-- ============================================================================
-- RAVQEN migration: storage buckets + owner/employee storage policies
--
-- The foundation migration created storage policies that referenced
-- `has_shop_role(..., ARRAY['owner','manager'])`. Migration A removed the
-- `manager` role, so those policy expressions are now invalid — this migration
-- recreates them on the owner/employee model.
--
-- It also provisions the three private buckets in SQL (idempotent), so a fresh
-- Supabase project needs no dashboard clicks: run the migrations and the
-- buckets exist.
--
-- Tenancy model: every object path is `<shop_id>/<filename>`; policies parse
-- the first path segment with `storage_shop_id()` and resolve membership via
-- `is_shop_member()`. Objects outside a valid shop prefix are invisible.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Buckets: private, size-capped, image-only where relevant.
--    Idempotent: existing buckets keep their id; limits are reconciled.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('shop-logos',       'shop-logos',       false, 2097152,  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('product-images',   'product-images',   false, 5242880,  ARRAY['image/png','image/jpeg','image/webp']),
  ('expense-receipts', 'expense-receipts', false, 10485760, ARRAY['image/png','image/jpeg','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public            = EXCLUDED.public,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The helper must be callable while checking policies (re-assert grants).
REVOKE ALL ON FUNCTION public.storage_shop_id(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_shop_id(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Policies. Old expressions referenced the removed `manager` role.
--    read / write: any active member of the owning shop
--    delete:       owner only (replacing a file is an UPDATE, not a DELETE)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "ravqen_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "ravqen_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "ravqen_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "ravqen_storage_delete" ON storage.objects;

CREATE POLICY "ravqen_storage_read_member" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id IN ('shop-logos','product-images','expense-receipts')
    AND public.is_shop_member(public.storage_shop_id(name))
  );

CREATE POLICY "ravqen_storage_insert_member" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('shop-logos','product-images','expense-receipts')
    AND public.is_shop_member(public.storage_shop_id(name))
  );

CREATE POLICY "ravqen_storage_update_member" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('shop-logos','product-images','expense-receipts')
    AND public.is_shop_member(public.storage_shop_id(name))
  )
  WITH CHECK (
    bucket_id IN ('shop-logos','product-images','expense-receipts')
    AND public.is_shop_member(public.storage_shop_id(name))
  );

CREATE POLICY "ravqen_storage_delete_owner" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('shop-logos','product-images','expense-receipts')
    AND public.is_shop_owner(public.storage_shop_id(name))
  );

COMMIT;
