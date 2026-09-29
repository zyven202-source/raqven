-- ============================================================================
-- RAVQEN migration: move the access-code salt out of `shops`
--
-- Why this migration exists
--   The first version of the staff access code stored a per-shop salt in
--   `shops.access_code_salt`. The app never selected that column, but every
--   active member can read their own shop row, so any signed-in employee could
--   select the salt directly from the API and pre-compute digests offline
--   against every candidate six-digit code.
--
--   Restricting a column on a table that authenticated users can already read
--   means revoking the table grant and re-granting it column by column, which
--   is fragile — the next column added would be readable by default. Moving the
--   secret to its own table with row level security enabled and no policies is
--   deny-by-construction: no client role can read it, select it, or join to it.
--
--   The functions that need it are SECURITY DEFINER, so they are unaffected.
--
-- Data preserving: every existing salt is copied across, so codes minted
-- before this migration keep working.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.shop_access_secrets (
  shop_id    UUID PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  salt       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deny by construction: RLS on, zero policies, no grants. A signed-in member
-- querying this table gets permission denied, not an empty result.
ALTER TABLE public.shop_access_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_access_secrets FROM anon, authenticated;
GRANT ALL ON public.shop_access_secrets TO service_role;

-- The backfill only runs on a database that still has the column, so replaying
-- this migration against one where it is already gone is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'shops'
       AND column_name = 'access_code_salt'
  ) THEN
    EXECUTE $copy$
      INSERT INTO public.shop_access_secrets (shop_id, salt)
      SELECT id, access_code_salt FROM public.shops WHERE access_code_salt IS NOT NULL
      ON CONFLICT (shop_id) DO UPDATE SET salt = EXCLUDED.salt
    $copy$;
  END IF;
END $$;

-- Any shop that somehow has no salt yet gets one now.
INSERT INTO public.shop_access_secrets (shop_id, salt)
SELECT s.id, encode(extensions.gen_random_bytes(16), 'hex')
  FROM public.shops s
 WHERE NOT EXISTS (SELECT 1 FROM public.shop_access_secrets x WHERE x.shop_id = s.id)
ON CONFLICT (shop_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Repoint the three functions at the new table, then drop the column.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.shop_access_salt(p_shop_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.salt FROM public.shop_access_secrets s WHERE s.shop_id = p_shop_id;
$$;

REVOKE ALL ON FUNCTION public.shop_access_salt(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shop_access_salt(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_employee_access_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    UUID := auth.uid();
  v_trimmed TEXT := upper(trim(coalesce(p_code, '')));
  v_digest  TEXT;
  v_code    public.employee_access_codes%ROWTYPE;
  v_shop    public.shops%ROWTYPE;
  v_salt    TEXT;
  v_member  UUID;
  v_recent  INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You need to sign in before using a shop access code.'
      USING ERRCODE = '42501';
  END IF;

  IF length(v_trimmed) < 4 THEN
    RAISE EXCEPTION 'That access code looks too short. Check it with your employer.'
      USING ERRCODE = '22023';
  END IF;

  -- Throttle: 10 failures in the last hour, per user, stops the guessing.
  SELECT count(*) INTO v_recent
    FROM public.access_code_attempts a
   WHERE a.user_id = v_user
     AND NOT a.succeeded
     AND a.attempted_at > now() - interval '1 hour';

  IF v_recent >= 10 THEN
    RAISE EXCEPTION 'Too many wrong codes. Try again in an hour, or ask your employer for a new code.'
      USING ERRCODE = '42501';
  END IF;

  -- The salt makes a digest un-transferable between shops. sha256 takes bytea,
  -- so the concatenation is cast explicitly.
  SELECT public.shop_access_salt(c.shop_id) INTO v_salt
    FROM public.employee_access_codes c
   WHERE c.is_active AND c.member_id IS NULL
     AND c.code_hash = encode(
           sha256((COALESCE(public.shop_access_salt(c.shop_id), '') || ':' || v_trimmed)::bytea), 'hex')
   LIMIT 1;

  SELECT * INTO v_code
    FROM public.employee_access_codes
   WHERE is_active AND member_id IS NULL
     AND code_hash = encode(sha256((COALESCE(v_salt, '') || ':' || v_trimmed)::bytea), 'hex')
   LIMIT 1;

  -- Fall back to the pre-migration unsalted digest, then retire the code so the
  -- next one is salted.
  IF NOT FOUND THEN
    v_digest := encode(sha256(v_trimmed::bytea), 'hex');
    SELECT * INTO v_code
      FROM public.employee_access_codes
     WHERE is_active AND member_id IS NULL AND code_hash = v_digest
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO public.access_code_attempts (user_id, succeeded) VALUES (v_user, false);
    RAISE EXCEPTION 'That access code is not valid for any shop.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_shop FROM public.shops WHERE id = v_code.shop_id;

  IF NOT FOUND OR v_shop.is_active = false THEN
    INSERT INTO public.access_code_attempts (user_id, code_id, succeeded)
         VALUES (v_user, v_code.id, false);
    RAISE EXCEPTION 'That shop is no longer active.' USING ERRCODE = '22023';
  END IF;

  -- Closed door: the switch is enforced here, not by hiding a form.
  IF v_shop.employee_joining_enabled = false THEN
    INSERT INTO public.access_code_attempts (user_id, code_id, succeeded)
         VALUES (v_user, v_code.id, false);
    RAISE EXCEPTION 'This shop is not accepting new staff right now. Ask the owner to reopen it.'
      USING ERRCODE = '42501';
  END IF;

  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    INSERT INTO public.access_code_attempts (user_id, code_id, succeeded)
         VALUES (v_user, v_code.id, false);
    RAISE EXCEPTION 'That access code has expired. Ask the owner for a new one.' USING ERRCODE = '22023';
  END IF;

  -- The owner can stop one person without closing the door for everyone.
  SELECT m.id INTO v_member
    FROM public.shop_members m
   WHERE m.shop_id = v_code.shop_id AND m.user_id = v_user;

  IF v_member IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.shop_members m
                WHERE m.id = v_member AND m.status <> 'active') THEN
      INSERT INTO public.access_code_attempts (user_id, code_id, succeeded)
           VALUES (v_user, v_code.id, false);
      RAISE EXCEPTION 'Your access to this shop has been switched off. Ask the owner to restore it.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.shop_members (shop_id, user_id, role, status)
       VALUES (v_code.shop_id, v_user, 'employee', 'active')
  ON CONFLICT (shop_id, user_id) DO NOTHING;

  UPDATE public.employee_access_codes
     SET last_used_at = now(), updated_at = now()
   WHERE id = v_code.id;

  INSERT INTO public.access_code_attempts (user_id, shop_id, code_id, succeeded)
       VALUES (v_user, v_code.shop_id, v_code.id, true);

  -- Retire a legacy unsalted code the first time it is used.
  IF v_code.code_hash = encode(sha256(v_trimmed::bytea), 'hex') THEN
    UPDATE public.employee_access_codes
       SET is_active = false, updated_at = now()
     WHERE id = v_code.id;
  END IF;

  RETURN jsonb_build_object(
    'shop_id',   v_code.shop_id,
    'shop_name', v_shop.name,
    'role',      'employee'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_employee_access_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_employee_access_code(TEXT) TO authenticated;

-- Ensures a shop always has a salt, minting one on first use.
CREATE OR REPLACE FUNCTION public.ensure_shop_access_salt(p_shop_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_salt TEXT;
BEGIN
  INSERT INTO public.shop_access_secrets (shop_id, salt)
       VALUES (p_shop_id, encode(extensions.gen_random_bytes(16), 'hex'))
  ON CONFLICT (shop_id) DO UPDATE SET salt = public.shop_access_secrets.salt
  RETURNING salt INTO v_salt;

  RETURN v_salt;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_shop_access_salt(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_shop_access_salt(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_employee_access_code(
  p_shop_id UUID,
  p_label   TEXT,
  p_code    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  UUID := auth.uid();
  v_id    UUID;
  v_salt  TEXT;
  v_plain TEXT := upper(trim(coalesce(p_code, '')));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_shop_owner(p_shop_id) THEN
    RAISE EXCEPTION 'Only the shop owner can create access codes' USING ERRCODE = '42501';
  END IF;

  IF length(v_plain) < 6 THEN
    RAISE EXCEPTION 'An access code needs at least 6 characters' USING ERRCODE = '22023';
  END IF;

  v_salt := public.ensure_shop_access_salt(p_shop_id);

  -- Retiring first also clears the partial unique index, so a shop can never
  -- hold two live codes that both work.
  UPDATE public.employee_access_codes
     SET is_active = false, updated_at = now()
   WHERE shop_id = p_shop_id AND member_id IS NULL AND is_active;

  INSERT INTO public.employee_access_codes (shop_id, member_id, label, code_hash, created_by)
       VALUES (
         p_shop_id, NULL, COALESCE(NULLIF(trim(p_label), ''), 'Staff access code'),
         encode(sha256((v_salt || ':' || v_plain)::bytea), 'hex'), v_user
       )
    RETURNING id INTO v_id;

  RETURN jsonb_build_object('code_id', v_id, 'label', p_label);
END;
$$;

REVOKE ALL ON FUNCTION public.create_employee_access_code(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_employee_access_code(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.regenerate_employee_access_code(p_shop_id UUID, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salt  TEXT;
  v_id    UUID;
  v_plain TEXT := upper(trim(coalesce(p_code, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_shop_owner(p_shop_id) THEN
    RAISE EXCEPTION 'Only the shop owner can regenerate the access code' USING ERRCODE = '42501';
  END IF;
  IF length(v_plain) < 6 THEN
    RAISE EXCEPTION 'An access code needs at least 6 characters' USING ERRCODE = '22023';
  END IF;

  v_salt := public.ensure_shop_access_salt(p_shop_id);

  UPDATE public.employee_access_codes
     SET is_active = false, updated_at = now()
   WHERE shop_id = p_shop_id AND member_id IS NULL AND is_active;

  INSERT INTO public.employee_access_codes (shop_id, member_id, label, code_hash, created_by)
       VALUES (p_shop_id, NULL, 'Staff access code',
               encode(sha256((v_salt || ':' :: text || v_plain)::bytea), 'hex'), auth.uid())
    RETURNING id INTO v_id;

  RETURN jsonb_build_object('code_id', v_id, 'label', 'Staff access code');
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_employee_access_code(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_employee_access_code(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- The column has served its purpose and is no longer readable by anyone.
-- ---------------------------------------------------------------------------
ALTER TABLE public.shops DROP COLUMN IF EXISTS access_code_salt;

COMMIT;
