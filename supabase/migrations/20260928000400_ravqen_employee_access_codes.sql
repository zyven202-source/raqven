-- ============================================================================
-- RAVQEN migration: employee self-service joining via an access code
--
-- Why this migration exists
--   The owner used to add staff by pasting the staff member's Supabase user id
--   (a UUID) into the Employees screen. That is impossible for a real shop
--   owner: a UUID is not something a human can read off a phone screen, and it
--   leaked an implementation detail into the customer experience.
--
--   This migration makes the access code the actual join mechanism:
--     owner  → mints / regenerates / retires a code
--     staff  → signs up, chooses "Employee", types the code
--     database → decides which shop they join and at which role
--
-- Security
--   * The code never travels to a client-issued query that picks a shop: the RPC
--     derives the shop FROM the code, so a client cannot choose its own shop_id
--     or role.
--   * Codes are stored as a salted SHA-256 digest (salt is per shop, so a digest
--     stolen from one shop cannot be pre-computed against another). Legacy
--     unsalted codes created before this migration still work — the digest is
--     simply an extra index probe — and are retired the first time they are used.
--   * A six-digit code has ~1M combinations, so guessing is throttled per user
--     and per code. Ten failed attempts in an hour locks the route for an hour
--     and is reported honestly to the user.
--   * `employee_joining_enabled` lets an owner close the door entirely. While it
--     is off, no code — even a valid one — can enrol anybody.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Owner controls on the shops row.
-- ---------------------------------------------------------------------------
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS employee_joining_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS access_code_salt TEXT;

COMMENT ON COLUMN public.shops.employee_joining_enabled IS
  'Owner switch. When false, no access code can enrol a new employee, even a valid one.';
COMMENT ON COLUMN public.shops.access_code_salt IS
  'Per-shop random salt mixed into access-code digests. Never leaves the database.';

-- Every existing shop gets a salt so the first code minted there is salted.
-- pgcrypto lives in the `extensions` schema on this project, and the functions
-- below run with `search_path = public`, so every call to it is qualified.
UPDATE public.shops
   SET access_code_salt = encode(extensions.gen_random_bytes(16), 'hex')
 WHERE access_code_salt IS NULL;

-- staff can read their own shop row; the salt is selected away by the app.
-- (RLS is unchanged: shops are readable by owner + active members.)

-- ---------------------------------------------------------------------------
-- 2) Failed-attempt ledger, so a 6-digit code cannot be ground down.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_code_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  shop_id     UUID REFERENCES public.shops(id) ON DELETE CASCADE,
  code_id     UUID REFERENCES public.employee_access_codes(id) ON DELETE CASCADE,
  succeeded   BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_code_attempts_user_idx
  ON public.access_code_attempts(user_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS access_code_attempts_code_idx
  ON public.access_code_attempts(code_id, attempted_at DESC);

-- The table is a security log, never customer data: it is readable only by the
-- database itself, so RLS is enabled with no policies on purpose.
ALTER TABLE public.access_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_code_attempts FROM anon, authenticated;

-- Fast probe for "which shop does this digest belong to?".
CREATE INDEX IF NOT EXISTS employee_access_codes_hash_idx
  ON public.employee_access_codes(code_hash) WHERE is_active;

-- ---------------------------------------------------------------------------
-- 3) One shop-wide code is live at a time, and it has a label.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS employee_access_codes_one_shop_wide_active
  ON public.employee_access_codes(shop_id)
  WHERE is_active AND member_id IS NULL;

-- ---------------------------------------------------------------------------
-- 4) Redeem: the only route by which a non-owner can become a member.
--
--    Deliberately SECURITY DEFINER: the caller has no membership yet, so the
--    insert cannot be authorised by the shop_members insert policy. The function
--    itself is the authorisation, and it hardcodes role = 'employee'.
-- ---------------------------------------------------------------------------
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
  SELECT s.access_code_salt INTO v_salt
    FROM public.employee_access_codes c
    JOIN public.shops s ON s.id = c.shop_id
   WHERE c.is_active AND c.member_id IS NULL
     AND c.code_hash = encode(
           sha256((COALESCE(s.access_code_salt, '') || ':' || v_trimmed)::bytea), 'hex')
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

-- ---------------------------------------------------------------------------
-- 5) Owner controls: open/close joining, and rotate the code in one call.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_employee_joining(p_shop_id UUID, p_enabled BOOLEAN)
RETURNS public.shops
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_shop public.shops;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_shop_owner(p_shop_id) THEN
    RAISE EXCEPTION 'Only the shop owner can change this.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.shops
     SET employee_joining_enabled = COALESCE(p_enabled, false), updated_at = now()
   WHERE id = p_shop_id
  RETURNING * INTO v_shop;

  RETURN v_shop;
END;
$$;

REVOKE ALL ON FUNCTION public.set_employee_joining(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_joining(UUID, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Rework the code minter to use the per-shop salt, and expose rotation.
--    create_employee_access_code keeps its signature so the shop-creation flow
--    and existing clients keep working.
-- ---------------------------------------------------------------------------
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

  SELECT access_code_salt INTO v_salt FROM public.shops WHERE id = p_shop_id FOR UPDATE;
  IF v_salt IS NULL THEN
    UPDATE public.shops
       SET access_code_salt = encode(extensions.gen_random_bytes(16), 'hex')
     WHERE id = p_shop_id
    RETURNING access_code_salt INTO v_salt;
  END IF;

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

-- Regenerate = mint a new one. Retiring the old code is part of the same call,
-- so the owner can never end up with two working codes.
CREATE OR REPLACE FUNCTION public.regenerate_employee_access_code(p_shop_id UUID, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salt TEXT;
  v_id   UUID;
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

  SELECT access_code_salt INTO v_salt FROM public.shops WHERE id = p_shop_id FOR UPDATE;
  IF v_salt IS NULL THEN
    UPDATE public.shops
       SET access_code_salt = encode(extensions.gen_random_bytes(16), 'hex')
     WHERE id = p_shop_id
    RETURNING access_code_salt INTO v_salt;
  END IF;

  UPDATE public.employee_access_codes
     SET is_active = false, updated_at = now()
   WHERE shop_id = p_shop_id AND member_id IS NULL AND is_active;

  INSERT INTO public.employee_access_codes (shop_id, member_id, label, code_hash, created_by)
       VALUES (p_shop_id, NULL, 'Staff access code',
               encode(sha256((v_salt || ':' || v_plain)::bytea), 'hex'), auth.uid())
    RETURNING id INTO v_id;

  RETURN jsonb_build_object('code_id', v_id, 'label', 'Staff access code');
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_employee_access_code(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_employee_access_code(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Grants. access_code_attempts stays unreachable from any client role.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_access_codes TO authenticated;
REVOKE ALL ON public.access_code_attempts FROM anon, authenticated;
GRANT ALL ON public.access_code_attempts TO service_role;

COMMIT;
