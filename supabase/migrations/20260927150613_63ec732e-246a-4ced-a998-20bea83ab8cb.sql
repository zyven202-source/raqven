CREATE OR REPLACE FUNCTION public.storage_shop_id(_name TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v UUID;
BEGIN
  BEGIN
    v := (string_to_array(_name, '/'))[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public.storage_shop_id(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_shop_id(TEXT) TO authenticated;

CREATE POLICY "ravqen_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('shop-logos','product-images','expense-receipts')
         AND public.is_shop_member(public.storage_shop_id(name)));
CREATE POLICY "ravqen_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('shop-logos','product-images','expense-receipts')
         AND public.is_shop_member(public.storage_shop_id(name)));
CREATE POLICY "ravqen_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('shop-logos','product-images','expense-receipts')
         AND public.is_shop_member(public.storage_shop_id(name)))
  WITH CHECK (bucket_id IN ('shop-logos','product-images','expense-receipts')
         AND public.is_shop_member(public.storage_shop_id(name)));
CREATE POLICY "ravqen_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('shop-logos','product-images','expense-receipts')
         AND public.has_shop_role(public.storage_shop_id(name), ARRAY['owner','manager']::public.shop_role[]));