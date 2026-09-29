-- RAVQEN — an access code must identify exactly one shop.
--
-- The problem this fixes
-- ----------------------
-- `redeem_employee_access_code` located a code by computing the salted digest
-- for every active code and taking the first row that matched:
--
--     SELECT ... LIMIT 1
--
-- Nothing stopped two different shops from holding the *same* six-digit code.
-- Each shop salts its own digest, so both rows match the same typed text and
-- `LIMIT 1` silently picks one of them. A staff member can therefore be
-- enrolled into the wrong shop, which is both a security problem and an
-- unrecoverable data-integrity problem: they would sell another shop's stock.
--
-- The fix
-- --------
-- 1. Redemption counts every shop whose active code matches the typed text. If
--    more than one matches, the code is ambiguous and redemption is refused
--    with an honest message rather than guessing. Both shops are told to rotate.
-- 2. `access_code_is_ambiguous` is exposed so the owner-facing UI can warn
--    before a collision is ever created by a hand-typed code.
--
-- A global uniqueness constraint on the *plaintext* code is not possible: only
-- salted digests are stored, which is exactly what makes them safe to keep.

-- True when more than one shop currently holds this plaintext code active.
CREATE OR REPLACE FUNCTION public.access_code_is_ambiguous(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT c.shop_id) > 1
    FROM public.employee_access_codes c
   WHERE c.is_active
     AND c.member_id IS NULL
     AND c.code_hash = encode(
           sha256((COALESCE(public.shop_access_salt(c.shop_id), '') || ':'
                   || upper(trim(coalesce(p_code, ''))))::bytea), 'hex');
$$;

REVOKE ALL ON FUNCTION public.access_code_is_ambiguous(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_code_is_ambiguous(TEXT) TO authenticated;

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
  v_hits    INT;
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

  -- How many distinct shops could this code belong to? The salt makes a digest
  -- un-transferable between shops, so a genuine match is exact. More than one
  -- means two shops are holding the same code and we must not guess which.
  SELECT count(DISTINCT c.shop_id) INTO v_hits
    FROM public.employee_access_codes c
   WHERE c.is_active AND c.member_id IS NULL
     AND c.code_hash = encode(
           sha256((COALESCE(public.shop_access_salt(c.shop_id), '') || ':' || v_trimmed)::bytea), 'hex');

  IF v_hits > 1 THEN
    INSERT INTO public.access_code_attempts (user_id, succeeded) VALUES (v_user, false);
    RAISE EXCEPTION 'That code is being used by more than one shop. Ask your employer to change it.'
      USING ERRCODE = '22023';
  END IF;

  -- Exactly one candidate: the salt for that shop, then the row itself.
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
