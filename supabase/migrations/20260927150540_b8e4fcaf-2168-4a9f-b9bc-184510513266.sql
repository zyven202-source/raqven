REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_shop() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_shop_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_shop_owner(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_shop_role(UUID, public.shop_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_shop_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_shop_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_shop_role(UUID, public.shop_role[]) TO authenticated;