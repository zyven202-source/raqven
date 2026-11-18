-- ============================================================================
-- Make "delete my account" remove the sign-in identity too.
--
-- `auth.users` is not writable from the client and cannot be touched by a
-- SECURITY INVOKER function. This function is SECURITY DEFINER and owned by the
-- migration role (`postgres`), so it can delete the identity; the `authenticated`
-- role never gets direct table access. Deleting the auth row cascades to
-- identities, sessions and refresh tokens, which is exactly the intent of
-- "delete my account".
--
-- The audit trail is preserved deliberately: `audit_log.actor_id` and the
-- operator columns on sales are `ON DELETE SET NULL`, so the shop's books keep
-- their entries and lose only the name attached to them.
--
-- The guards stay as they were: a user who still owns a shop is refused, and
-- the function refuses to run without a signed-in caller.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_owned  TEXT;
  v_count  INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.' USING ERRCODE = '42501';
  END IF;

  SELECT string_agg(s.name, ', ')
    INTO v_owned
    FROM public.shops s
   WHERE s.owner_id = v_user;

  IF v_owned IS NOT NULL THEN
    RAISE EXCEPTION
      'You still own: %. Transfer or close these shops first — their sales, stock and customer account records have to stay.', v_owned
      USING ERRCODE = '42501';
  END IF;

  -- Memberships and minted codes are removed first; neither cascades into a
  -- shop's ledger.
  DELETE FROM public.shop_members WHERE user_id = v_user;
  DELETE FROM public.employee_access_codes WHERE created_by = v_user;

  -- Keep the evidence, drop the identity.
  UPDATE public.consent_records
     SET user_id = NULL
   WHERE user_id = v_user;

  DELETE FROM public.profiles WHERE id = v_user;

  SELECT count(*) INTO v_count
    FROM public.shop_members m
   WHERE m.user_id = v_user;

  -- The identity itself. Everything in `auth` that hangs off this row
  -- (identities, sessions, refresh tokens) goes with it, so the old password
  -- stops working at once.
  DELETE FROM auth.users WHERE id = v_user;

  RETURN jsonb_build_object(
    'profile_deleted',     true,
    'identity_deleted',    true,
    'memberships_removed', v_count,
    'consent_retained',    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

COMMIT;
