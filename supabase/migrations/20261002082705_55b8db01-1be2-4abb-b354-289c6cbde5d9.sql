REVOKE ALL ON FUNCTION public.storage_shop_id(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_shop_id(TEXT) TO authenticated;
DROP POLICY IF EXISTS "ravqen_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "ravqen_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "ravqen_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "ravqen_storage_delete" ON storage.objects;
CREATE POLICY "ravqen_storage_read_member" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('shop-logos','product-images','expense-receipts') AND public.is_shop_member(public.storage_shop_id(name)));
CREATE POLICY "ravqen_storage_insert_member" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('shop-logos','product-images','expense-receipts') AND public.is_shop_member(public.storage_shop_id(name)));
CREATE POLICY "ravqen_storage_update_member" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('shop-logos','product-images','expense-receipts') AND public.is_shop_member(public.storage_shop_id(name)))
  WITH CHECK (bucket_id IN ('shop-logos','product-images','expense-receipts') AND public.is_shop_member(public.storage_shop_id(name)));
CREATE POLICY "ravqen_storage_delete_owner" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('shop-logos','product-images','expense-receipts') AND public.is_shop_owner(public.storage_shop_id(name)));