-- ============================================================================
-- RAVQEN: low-stock flag
--
-- Why this migration exists
--   "Show me what is running out" must be a database filter, not a JavaScript
--   filter over a page of rows — a client-side filter silently misses
--   low-stock items that fall outside the fetched page, which is exactly the
--   failure that gets a shop owner caught out.
--
--   PostgREST cannot compare two columns to each other in a filter, so the
--   comparison becomes a generated column. It is always derived from
--   quantity/low_stock_threshold, so it can never drift.
-- ============================================================================

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_low_stock BOOLEAN
  GENERATED ALWAYS AS (quantity <= low_stock_threshold) STORED;

COMMENT ON COLUMN public.products.is_low_stock IS
  'Generated: quantity <= low_stock_threshold. Read-only; derived, never written.';

CREATE INDEX IF NOT EXISTS products_shop_low_stock_idx
  ON public.products(shop_id) WHERE is_low_stock;

COMMIT;
