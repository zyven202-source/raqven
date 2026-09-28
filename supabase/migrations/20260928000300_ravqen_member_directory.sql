-- ============================================================================
-- RAVQEN: shop member directory
--
-- Why this migration exists
--   Section 10 of the spec requires every transaction row to name the person
--   who recorded it. `profiles` is deliberately self-only (a user can read
--   their own profile), and `shop_members` only exposes other rows to the
--   owner — so a shop's own staff could not see each other's names, and the
--   ledger would have to print "unknown user" for every sale by a colleague.
--
--   This function closes that gap narrowly: it returns ONLY the people who
--   belong to the shop the caller is already a member of, and returns nothing
--   at all to anyone who is not a member. It exposes no other profile data.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.shop_member_directory(p_shop_id UUID)
RETURNS TABLE (
  user_id      UUID,
  display_name TEXT,
  role         public.shop_role,
  status       public.member_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.user_id,
         COALESCE(
           NULLIF(trim(m.display_name), ''),
           NULLIF(trim(p.full_name), ''),
           'Staff member'
         ) AS display_name,
         m.role,
         m.status
    FROM public.shop_members m
    LEFT JOIN public.profiles p ON p.id = m.user_id
   WHERE m.shop_id = p_shop_id
     -- The gate: a non-member gets zero rows, not an error.
     AND public.is_shop_member(p_shop_id)
   ORDER BY m.created_at;
$$;

REVOKE ALL ON FUNCTION public.shop_member_directory(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shop_member_directory(UUID) TO authenticated;

COMMIT;
