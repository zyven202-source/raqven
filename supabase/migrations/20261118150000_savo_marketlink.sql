-- ============================================================================
-- SAVO Marketlink — public multi-seller marketplace
--
-- Design rules, in the order they constrain everything below:
--
--   1. A listing is not a product. `marketlink_listings` stores only what the
--      owner chose to publish about an EXISTING `products` row: a description,
--      an optional public price and the uploaded image path. Price and
--      availability are read live from inventory at query time, so the
--      marketplace can never drift into a duplicate catalogue.
--   2. Public visitors never touch a table. Every anonymous read and every
--      anonymous write goes through a SECURITY DEFINER function that returns a
--      hand-built JSON shape. There is no anon SELECT on products, orders or
--      customers, and no anon INSERT anywhere.
--   3. Orders belong to a signed-in customer (`customer_id = auth.uid()`) and
--      to one seller. A seller reads only their own shop's orders; a customer
--      reads only their own orders, across every shop they bought from.
--   4. Submitting an order never moves stock and never creates a sale. The
--      till remains the only place inventory is deducted.
--   5. A listing can only be published with an image the owner uploaded into
--      this shop's prefix of the `marketlink-images` bucket.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketlink_delivery_kind') THEN
    CREATE TYPE public.marketlink_delivery_kind AS ENUM ('local', 'nationwide', 'worldwide');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marketlink_order_status') THEN
    CREATE TYPE public.marketlink_order_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled', 'completed');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Storefront configuration (one row per shop)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketlink_storefronts (
  shop_id UUID PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 80),
  description TEXT CHECK (description IS NULL OR length(description) <= 1200),
  public_phone TEXT CHECK (public_phone IS NULL OR length(public_phone) <= 40),
  public_email TEXT CHECK (public_email IS NULL OR length(public_email) <= 160),
  public_whatsapp TEXT CHECK (public_whatsapp IS NULL OR length(public_whatsapp) <= 40),
  -- Public business location. Coarse on purpose: a town and, optionally, an
  -- approximate coordinate the owner chooses to publish. Never the shop's
  -- private `address` column.
  country TEXT CHECK (country IS NULL OR length(country) <= 80),
  region TEXT CHECK (region IS NULL OR length(region) <= 80),
  city TEXT CHECK (city IS NULL OR length(city) <= 80),
  public_latitude DOUBLE PRECISION CHECK (public_latitude IS NULL OR public_latitude BETWEEN -90 AND 90),
  public_longitude DOUBLE PRECISION CHECK (public_longitude IS NULL OR public_longitude BETWEEN -180 AND 180),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketlink_storefront_coords_both_or_neither CHECK (
    (public_latitude IS NULL) = (public_longitude IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS marketlink_storefronts_published_idx
  ON public.marketlink_storefronts (is_published) WHERE is_published;

DROP TRIGGER IF EXISTS marketlink_storefronts_updated_at ON public.marketlink_storefronts;
CREATE TRIGGER marketlink_storefronts_updated_at
  BEFORE UPDATE ON public.marketlink_storefronts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.marketlink_storefronts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketlink_storefronts_member_read ON public.marketlink_storefronts;
CREATE POLICY marketlink_storefronts_member_read ON public.marketlink_storefronts
  FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));

DROP POLICY IF EXISTS marketlink_storefronts_owner_write ON public.marketlink_storefronts;
CREATE POLICY marketlink_storefronts_owner_write ON public.marketlink_storefronts
  FOR ALL TO authenticated
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- ---------------------------------------------------------------------------
-- 3) Listings — publication state over real products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketlink_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  description TEXT CHECK (description IS NULL OR length(description) <= 1200),
  -- NULL means "use the product's current selling price"; a value is the
  -- owner's explicit public price. The feed reads COALESCE(public_price,
  -- selling_price), so an unset price can never go stale.
  public_price NUMERIC(12,2) CHECK (public_price IS NULL OR public_price >= 0),
  image_path TEXT NOT NULL CHECK (length(trim(image_path)) BETWEEN 3 AND 400),
  category TEXT CHECK (category IS NULL OR length(category) <= 80),
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, product_id)
);

CREATE INDEX IF NOT EXISTS marketlink_listings_shop_idx ON public.marketlink_listings (shop_id);
CREATE INDEX IF NOT EXISTS marketlink_listings_published_idx
  ON public.marketlink_listings (published_at DESC) WHERE is_published;
CREATE INDEX IF NOT EXISTS marketlink_listings_category_idx
  ON public.marketlink_listings (category) WHERE is_published;

DROP TRIGGER IF EXISTS marketlink_listings_updated_at ON public.marketlink_listings;
CREATE TRIGGER marketlink_listings_updated_at
  BEFORE UPDATE ON public.marketlink_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/**
 * A listing can only point at a product in its own shop, and can only be
 * published with an image the shop uploaded into its own storage prefix.
 *
 * This is the database half of "no product without a genuine image": the
 * publish dialog refuses too, but a client is not a security boundary, so a
 * direct PostgREST write is checked here as well.
 */
CREATE OR REPLACE FUNCTION public.marketlink_validate_listing()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM public.products p WHERE p.id = NEW.product_id AND p.shop_id = NEW.shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That product does not belong to this shop' USING ERRCODE = '42501';
  END IF;

  IF NEW.image_path IS NULL OR length(trim(NEW.image_path)) = 0 THEN
    RAISE EXCEPTION 'Upload a product image before publishing' USING ERRCODE = '23514';
  END IF;
  IF NEW.image_path ~* '^https?://' THEN
    RAISE EXCEPTION 'The image must be uploaded to SAVO, not linked from another site' USING ERRCODE = '23514';
  END IF;
  IF NEW.image_path NOT LIKE NEW.shop_id::text || '/%' THEN
    RAISE EXCEPTION 'That image does not belong to this shop' USING ERRCODE = '42501';
  END IF;

  IF NEW.is_published THEN
    PERFORM 1 FROM public.products p
      WHERE p.id = NEW.product_id AND p.shop_id = NEW.shop_id AND p.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Only an active product can be published' USING ERRCODE = '23514';
    END IF;
    IF NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
  ELSE
    NEW.published_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketlink_listings_validate ON public.marketlink_listings;
CREATE TRIGGER marketlink_listings_validate
  BEFORE INSERT OR UPDATE ON public.marketlink_listings
  FOR EACH ROW EXECUTE FUNCTION public.marketlink_validate_listing();

ALTER TABLE public.marketlink_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketlink_listings_member_read ON public.marketlink_listings;
CREATE POLICY marketlink_listings_member_read ON public.marketlink_listings
  FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));

DROP POLICY IF EXISTS marketlink_listings_owner_write ON public.marketlink_listings;
CREATE POLICY marketlink_listings_owner_write ON public.marketlink_listings
  FOR ALL TO authenticated
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- ---------------------------------------------------------------------------
-- 4) Delivery zones
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketlink_delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  kind public.marketlink_delivery_kind NOT NULL,
  country TEXT CHECK (country IS NULL OR length(country) <= 80),
  region TEXT CHECK (region IS NULL OR length(region) <= 80),
  city TEXT CHECK (city IS NULL OR length(city) <= 80),
  -- NULL = the seller confirms the cost with the customer. Never invent a fee.
  fee NUMERIC(12,2) CHECK (fee IS NULL OR fee >= 0),
  note TEXT CHECK (note IS NULL OR length(note) <= 400),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketlink_zone_shape CHECK (
    (kind = 'worldwide')
    OR (kind = 'nationwide' AND country IS NOT NULL)
    OR (kind = 'local' AND (region IS NOT NULL OR city IS NOT NULL))
  )
);

CREATE INDEX IF NOT EXISTS marketlink_zones_shop_idx ON public.marketlink_delivery_zones (shop_id);

DROP TRIGGER IF EXISTS marketlink_zones_updated_at ON public.marketlink_delivery_zones;
CREATE TRIGGER marketlink_zones_updated_at
  BEFORE UPDATE ON public.marketlink_delivery_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.marketlink_delivery_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketlink_zones_member_read ON public.marketlink_delivery_zones;
CREATE POLICY marketlink_zones_member_read ON public.marketlink_delivery_zones
  FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));

DROP POLICY IF EXISTS marketlink_zones_owner_write ON public.marketlink_delivery_zones;
CREATE POLICY marketlink_zones_owner_write ON public.marketlink_delivery_zones
  FOR ALL TO authenticated
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

/**
 * Whether one zone serves a destination. Used by the feed filter, the
 * storefront payload and the order RPC, so all three agree by construction.
 */
CREATE OR REPLACE FUNCTION public.marketlink_zone_matches(
  p_kind public.marketlink_delivery_kind,
  p_zone_country TEXT,
  p_zone_region TEXT,
  p_zone_city TEXT,
  p_country TEXT,
  p_region TEXT,
  p_city TEXT
) RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'worldwide' THEN true
    WHEN 'nationwide' THEN
      p_zone_country IS NOT NULL
      AND lower(trim(p_zone_country)) = lower(trim(COALESCE(p_country, '')))
    WHEN 'local' THEN
      (p_zone_country IS NULL OR lower(trim(p_zone_country)) = lower(trim(COALESCE(p_country, ''))))
      AND (p_zone_region IS NULL OR lower(trim(p_zone_region)) = lower(trim(COALESCE(p_region, ''))))
      AND (p_zone_city IS NULL OR lower(trim(p_zone_city)) = lower(trim(COALESCE(p_city, ''))))
      AND (p_zone_region IS NOT NULL OR p_zone_city IS NOT NULL)
  END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Orders and order lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketlink_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reference TEXT NOT NULL,
  client_token UUID NOT NULL,
  customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) BETWEEN 2 AND 120),
  customer_phone TEXT CHECK (customer_phone IS NULL OR length(customer_phone) BETWEEN 7 AND 32),
  customer_email TEXT CHECK (customer_email IS NULL OR length(customer_email) BETWEEN 5 AND 160),
  preferred_contact TEXT NOT NULL DEFAULT 'phone' CHECK (preferred_contact IN ('phone', 'email', 'whatsapp')),
  fulfillment TEXT NOT NULL DEFAULT 'pickup' CHECK (fulfillment IN ('pickup', 'delivery')),
  delivery_zone_id UUID REFERENCES public.marketlink_delivery_zones(id) ON DELETE SET NULL,
  destination_country TEXT,
  destination_region TEXT,
  destination_city TEXT,
  delivery_address TEXT,
  delivery_note TEXT CHECK (delivery_note IS NULL OR length(delivery_note) <= 1000),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee NUMERIC(12,2) CHECK (delivery_fee IS NULL OR delivery_fee >= 0),
  currency TEXT NOT NULL DEFAULT 'KES',
  status public.marketlink_order_status NOT NULL DEFAULT 'pending',
  owner_note TEXT CHECK (owner_note IS NULL OR length(owner_note) <= 1000),
  status_updated_at TIMESTAMPTZ,
  status_updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, reference),
  UNIQUE (shop_id, client_token),
  CONSTRAINT marketlink_order_contact CHECK (customer_phone IS NOT NULL OR customer_email IS NOT NULL),
  CONSTRAINT marketlink_order_delivery CHECK (
    fulfillment = 'pickup'
    OR (delivery_zone_id IS NOT NULL AND destination_country IS NOT NULL AND delivery_address IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS marketlink_orders_shop_idx
  ON public.marketlink_orders (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketlink_orders_customer_idx
  ON public.marketlink_orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketlink_orders_rate_idx
  ON public.marketlink_orders (shop_id, created_at DESC);

DROP TRIGGER IF EXISTS marketlink_orders_updated_at ON public.marketlink_orders;
CREATE TRIGGER marketlink_orders_updated_at
  BEFORE UPDATE ON public.marketlink_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.marketlink_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.marketlink_orders(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.marketlink_listings(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  image_path TEXT
);

CREATE INDEX IF NOT EXISTS marketlink_order_items_order_idx
  ON public.marketlink_order_items (order_id);

ALTER TABLE public.marketlink_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketlink_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketlink_orders_read ON public.marketlink_orders;
CREATE POLICY marketlink_orders_read ON public.marketlink_orders
  FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id) OR customer_id = auth.uid());

DROP POLICY IF EXISTS marketlink_orders_owner_update ON public.marketlink_orders;
CREATE POLICY marketlink_orders_owner_update ON public.marketlink_orders
  FOR UPDATE TO authenticated
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

DROP POLICY IF EXISTS marketlink_order_items_read ON public.marketlink_order_items;
CREATE POLICY marketlink_order_items_read ON public.marketlink_order_items
  FOR SELECT TO authenticated
  USING (
    public.is_shop_member(shop_id)
    OR EXISTS (
      SELECT 1 FROM public.marketlink_orders o
      WHERE o.id = order_id AND o.customer_id = auth.uid()
    )
  );

-- No client may create an order directly: the RPC below is the only door,
-- because it is the only place the price, stock and delivery checks live.
REVOKE INSERT, DELETE ON public.marketlink_orders FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.marketlink_order_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.marketlink_listings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.marketlink_storefronts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.marketlink_delivery_zones FROM anon;

/**
 * Status changes only move forward along one path. Enforced in the database
 * because the seller's browser is not the authority on what a legal transition
 * is — and because a customer must not be able to mark their own request paid.
 */
CREATE OR REPLACE FUNCTION public.marketlink_guard_order_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  allowed BOOLEAN;
BEGIN
  IF NEW.shop_id <> OLD.shop_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.reference <> OLD.reference
     OR NEW.client_token <> OLD.client_token
     OR NEW.customer_name <> OLD.customer_name
     OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
     OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
     OR NEW.subtotal <> OLD.subtotal
     OR NEW.currency <> OLD.currency
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'An order request keeps its original details' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    allowed := CASE OLD.status
      WHEN 'pending' THEN NEW.status IN ('accepted', 'rejected', 'cancelled')
      WHEN 'accepted' THEN NEW.status IN ('completed', 'cancelled')
      ELSE false
    END;
    IF NOT allowed THEN
      RAISE EXCEPTION 'An order cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;
    NEW.status_updated_at := now();
    NEW.status_updated_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketlink_orders_guard ON public.marketlink_orders;
CREATE TRIGGER marketlink_orders_guard
  BEFORE UPDATE ON public.marketlink_orders
  FOR EACH ROW EXECUTE FUNCTION public.marketlink_guard_order_update();

-- ---------------------------------------------------------------------------
-- 6) In-app seller notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketlink_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.marketlink_orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'order_request',
  title TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketlink_notifications_shop_idx
  ON public.marketlink_notifications (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketlink_notifications_unread_idx
  ON public.marketlink_notifications (shop_id) WHERE read_at IS NULL;

ALTER TABLE public.marketlink_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketlink_notifications_read ON public.marketlink_notifications;
CREATE POLICY marketlink_notifications_read ON public.marketlink_notifications
  FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));

DROP POLICY IF EXISTS marketlink_notifications_mark_read ON public.marketlink_notifications;
CREATE POLICY marketlink_notifications_mark_read ON public.marketlink_notifications
  FOR UPDATE TO authenticated
  USING (public.is_shop_member(shop_id))
  WITH CHECK (public.is_shop_member(shop_id));

REVOKE INSERT, DELETE ON public.marketlink_notifications FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Customer-saved checkout details
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketlink_customer_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT CHECK (full_name IS NULL OR length(full_name) <= 120),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 32),
  email TEXT CHECK (email IS NULL OR length(email) <= 160),
  country TEXT CHECK (country IS NULL OR length(country) <= 80),
  region TEXT CHECK (region IS NULL OR length(region) <= 80),
  city TEXT CHECK (city IS NULL OR length(city) <= 80),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketlink_customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketlink_customer_profile_own ON public.marketlink_customer_profiles;
CREATE POLICY marketlink_customer_profile_own ON public.marketlink_customer_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS marketlink_customer_profiles_updated_at ON public.marketlink_customer_profiles;
CREATE TRIGGER marketlink_customer_profiles_updated_at
  BEFORE UPDATE ON public.marketlink_customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8) Public read functions
-- ---------------------------------------------------------------------------

/** One listing as the marketplace is allowed to see it. */
CREATE OR REPLACE FUNCTION public.marketlink_listing_json(
  p_listing public.marketlink_listings,
  p_product public.products,
  p_shop public.shops,
  p_category TEXT,
  p_currency TEXT,
  p_distance_km DOUBLE PRECISION,
  p_delivery_kinds TEXT[]
) RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', p_listing.id,
    'product_id', p_product.id,
    'shop_slug', p_shop.slug,
    'shop_name', COALESCE(NULLIF(trim(p_shop.name), ''), p_shop.slug),
    'name', p_product.name,
    'description', p_listing.description,
    'price', COALESCE(p_listing.public_price, p_product.selling_price),
    'currency', p_currency,
    'unit', p_product.unit,
    'image_path', p_listing.image_path,
    'category', p_category,
    'stock_state', CASE
      WHEN p_product.quantity <= 0 THEN 'out'
      WHEN p_product.quantity <= p_product.low_stock_threshold THEN 'low'
      ELSE 'in'
    END,
    'max_quantity', LEAST(GREATEST(floor(p_product.quantity), 0), 20),
    'distance_km', p_distance_km,
    'delivery_kinds', COALESCE(p_delivery_kinds, ARRAY[]::TEXT[])
  );
$$;

/**
 * The shared marketplace feed.
 *
 * `p_limit + 1` rows are fetched so `has_more` is a fact rather than a guess;
 * nothing is counted with a second full scan. Distance is returned only when
 * both the seller published an approximate location and the customer shared
 * coordinates — otherwise the key is null, never a made-up number.
 */
CREATE OR REPLACE FUNCTION public.marketlink_feed(
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_min_price NUMERIC DEFAULT NULL,
  p_max_price NUMERIC DEFAULT NULL,
  p_in_stock BOOLEAN DEFAULT NULL,
  p_shop_slug TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_limit INT DEFAULT 24,
  p_offset INT DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_rows JSONB;
  v_count INT;
BEGIN
  WITH base AS (
    SELECT
      l,
      p,
      s,
      COALESCE(l.category, c.name) AS category_name,
      COALESCE(l.public_price, p.selling_price) AS effective_price,
      CASE
        WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
             AND sf.public_latitude IS NOT NULL AND sf.public_longitude IS NOT NULL
        THEN 2 * 6371 * asin(sqrt(
          power(sin(radians(sf.public_latitude - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(sf.public_latitude))
            * power(sin(radians(sf.public_longitude - p_lng) / 2), 2)
        ))
        ELSE NULL
      END AS distance_km,
      (
        SELECT array_agg(DISTINCT z.kind::text)
        FROM public.marketlink_delivery_zones z
        WHERE z.shop_id = l.shop_id AND z.is_active
      ) AS delivery_kinds
    FROM public.marketlink_listings l
    JOIN public.products p ON p.id = l.product_id AND p.shop_id = l.shop_id
    JOIN public.shops s ON s.id = l.shop_id
    JOIN public.marketlink_storefronts sf ON sf.shop_id = s.id AND sf.is_published
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE l.is_published
      AND p.is_active
      AND s.is_active
  ),
  filtered AS (
    SELECT * FROM base
    WHERE (p_search IS NULL OR trim(p_search) = ''
           OR (base.p).name ILIKE '%' || trim(p_search) || '%'
           OR COALESCE((base.l).description, '') ILIKE '%' || trim(p_search) || '%'
           OR base.category_name ILIKE '%' || trim(p_search) || '%')
      AND (p_category IS NULL OR trim(p_category) = '' OR lower(base.category_name) = lower(trim(p_category)))
      AND (p_min_price IS NULL OR base.effective_price >= p_min_price)
      AND (p_max_price IS NULL OR base.effective_price <= p_max_price)
      AND (p_in_stock IS NULL OR NOT p_in_stock OR (base.p).quantity > 0)
      AND (p_shop_slug IS NULL OR trim(p_shop_slug) = '' OR (base.s).slug = trim(p_shop_slug))
      AND (p_country IS NULL OR trim(p_country) = '' OR EXISTS (
        SELECT 1 FROM public.marketlink_delivery_zones z
        WHERE z.shop_id = (base.s).id AND z.is_active
          AND public.marketlink_zone_matches(z.kind, z.country, z.region, z.city, p_country, p_region, NULL)
      ))
  ),
  page AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN p_lat IS NOT NULL THEN distance_km END ASC NULLS LAST,
      CASE WHEN (p).quantity > 0 THEN 0 ELSE 1 END,
      (l).published_at DESC NULLS LAST,
      (p).name
    LIMIT v_limit + 1 OFFSET v_offset
  )
  SELECT
    (SELECT COUNT(*) FROM page),
    (
      SELECT COALESCE(jsonb_agg(item ORDER BY ord), '[]'::jsonb)
      FROM (
        SELECT
          public.marketlink_listing_json(
            (page.l), (page.p), (page.s), page.category_name, (page.s).currency,
            page.distance_km, page.delivery_kinds
          ) AS item,
          row_number() OVER () AS ord
        FROM page
        LIMIT v_limit
      ) numbered
    )
  INTO v_count, v_rows;

  RETURN jsonb_build_object(
    'items', v_rows,
    'has_more', v_count > v_limit,
    'returned', jsonb_array_length(v_rows)
  );
END;
$$;

/** Categories that currently have at least one published listing. */
CREATE OR REPLACE FUNCTION public.marketlink_categories()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'count', n) ORDER BY n DESC, name), '[]'::jsonb)
  FROM (
    SELECT COALESCE(l.category, c.name) AS name, COUNT(*) AS n
    FROM public.marketlink_listings l
    JOIN public.products p ON p.id = l.product_id AND p.shop_id = l.shop_id AND p.is_active
    JOIN public.shops s ON s.id = l.shop_id AND s.is_active
    JOIN public.marketlink_storefronts sf ON sf.shop_id = s.id AND sf.is_published
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE l.is_published AND COALESCE(l.category, c.name) IS NOT NULL
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 40
  ) categories;
$$;

/** One public storefront: identity, contact, delivery and its listings. */
CREATE OR REPLACE FUNCTION public.marketlink_shop(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop public.shops;
  v_sf public.marketlink_storefronts;
  v_listings JSONB;
  v_zones JSONB;
BEGIN
  SELECT s.* INTO v_shop FROM public.shops s
    WHERE s.slug = trim(p_slug) AND s.is_active;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_sf FROM public.marketlink_storefronts sf
    WHERE sf.shop_id = v_shop.id AND sf.is_published;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(public.marketlink_listing_json(
      l, p, v_shop, COALESCE(l.category, c.name), v_shop.currency, NULL,
      (SELECT array_agg(DISTINCT z.kind::text) FROM public.marketlink_delivery_zones z
        WHERE z.shop_id = v_shop.id AND z.is_active)
    ) ORDER BY CASE WHEN p.quantity > 0 THEN 0 ELSE 1 END, l.published_at DESC NULLS LAST, p.name), '[]'::jsonb)
  INTO v_listings
  FROM public.marketlink_listings l
  JOIN public.products p ON p.id = l.product_id AND p.shop_id = l.shop_id
  LEFT JOIN public.categories c ON c.id = p.category_id
  WHERE l.shop_id = v_shop.id AND l.is_published AND p.is_active;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', z.id,
      'kind', z.kind,
      'country', z.country,
      'region', z.region,
      'city', z.city,
      'fee', z.fee,
      'note', z.note
    ) ORDER BY z.kind, z.country NULLS FIRST, z.region NULLS FIRST, z.city NULLS FIRST), '[]'::jsonb)
  INTO v_zones
  FROM public.marketlink_delivery_zones z
  WHERE z.shop_id = v_shop.id AND z.is_active;

  RETURN jsonb_build_object(
    'shop', jsonb_build_object(
      'slug', v_shop.slug,
      'name', v_sf.display_name,
      'description', v_sf.description,
      'phone', v_sf.public_phone,
      'email', v_sf.public_email,
      'whatsapp', v_sf.public_whatsapp,
      'country', v_sf.country,
      'region', v_sf.region,
      'city', v_sf.city,
      'currency', v_shop.currency,
      'updated_at', v_sf.updated_at
    ),
    'delivery', v_zones,
    'products', v_listings
  );
END;
$$;

/** One public listing page, plus the same seller's other published products. */
CREATE OR REPLACE FUNCTION public.marketlink_product(p_slug TEXT, p_listing_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop public.shops;
  v_sf public.marketlink_storefronts;
  v_listing public.marketlink_listings;
  v_product public.products;
  v_category TEXT;
  v_related JSONB;
  v_zones JSONB;
BEGIN
  SELECT s.* INTO v_shop FROM public.shops s WHERE s.slug = trim(p_slug) AND s.is_active;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_sf FROM public.marketlink_storefronts sf
    WHERE sf.shop_id = v_shop.id AND sf.is_published;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT l.* INTO v_listing FROM public.marketlink_listings l
    WHERE l.id = p_listing_id AND l.shop_id = v_shop.id AND l.is_published;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT p.* INTO v_product FROM public.products p
    WHERE p.id = v_listing.product_id AND p.shop_id = v_shop.id AND p.is_active;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(v_listing.category, c.name) INTO v_category
    FROM public.products p LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE p.id = v_product.id;

  SELECT COALESCE(jsonb_agg(public.marketlink_listing_json(
      l, p, v_shop, COALESCE(l.category, c.name), v_shop.currency, NULL, NULL
    ) ORDER BY l.published_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_related
  FROM public.marketlink_listings l
  JOIN public.products p ON p.id = l.product_id AND p.shop_id = l.shop_id AND p.is_active
  LEFT JOIN public.categories c ON c.id = p.category_id
  WHERE l.shop_id = v_shop.id AND l.is_published AND l.id <> v_listing.id
  LIMIT 6;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', z.id, 'kind', z.kind, 'country', z.country, 'region', z.region,
      'city', z.city, 'fee', z.fee, 'note', z.note
    ) ORDER BY z.kind), '[]'::jsonb)
  INTO v_zones
  FROM public.marketlink_delivery_zones z
  WHERE z.shop_id = v_shop.id AND z.is_active;

  RETURN jsonb_build_object(
    'listing', public.marketlink_listing_json(
      v_listing, v_product, v_shop, v_category, v_shop.currency, NULL,
      (SELECT array_agg(DISTINCT z.kind::text) FROM public.marketlink_delivery_zones z
        WHERE z.shop_id = v_shop.id AND z.is_active)
    ),
    'shop', jsonb_build_object(
      'slug', v_shop.slug,
      'name', v_sf.display_name,
      'description', v_sf.description,
      'phone', v_sf.public_phone,
      'email', v_sf.public_email,
      'whatsapp', v_sf.public_whatsapp,
      'country', v_sf.country,
      'region', v_sf.region,
      'city', v_sf.city,
      'currency', v_shop.currency
    ),
    'delivery', v_zones,
    'related', v_related
  );
END;
$$;

/** Every published shop, for the build-time sitemap. Public data only. */
CREATE OR REPLACE FUNCTION public.marketlink_public_shops()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'slug', s.slug,
      'name', sf.display_name,
      'updated_at', sf.updated_at
    ) ORDER BY s.slug), '[]'::jsonb)
  FROM public.marketlink_storefronts sf
  JOIN public.shops s ON s.id = sf.shop_id AND s.is_active
  WHERE sf.is_published;
$$;

/** Published listing ids per shop, for the build-time sitemap. */
CREATE OR REPLACE FUNCTION public.marketlink_public_listings()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'shop_slug', s.slug,
      'listing_id', l.id,
      'updated_at', l.updated_at
    ) ORDER BY l.updated_at DESC), '[]'::jsonb)
  FROM public.marketlink_listings l
  JOIN public.shops s ON s.id = l.shop_id AND s.is_active
  JOIN public.products p ON p.id = l.product_id AND p.is_active
  JOIN public.marketlink_storefronts sf ON sf.shop_id = s.id AND sf.is_published
  WHERE l.is_published;
$$;

-- ---------------------------------------------------------------------------
-- 9) Order submission — the only write path for customers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketlink_submit_order(
  p_slug TEXT,
  p_client_token UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT DEFAULT NULL,
  p_customer_email TEXT DEFAULT NULL,
  p_preferred_contact TEXT DEFAULT 'phone',
  p_fulfillment TEXT DEFAULT 'pickup',
  p_delivery_zone_id UUID DEFAULT NULL,
  p_destination_country TEXT DEFAULT NULL,
  p_destination_region TEXT DEFAULT NULL,
  p_destination_city TEXT DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_shop public.shops;
  v_sf public.marketlink_storefronts;
  v_zone public.marketlink_delivery_zones;
  v_name TEXT := NULLIF(trim(COALESCE(p_customer_name, '')), '');
  v_phone TEXT := NULLIF(regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9+]', '', 'g'), '');
  v_email TEXT := NULLIF(lower(trim(COALESCE(p_customer_email, ''))), '');
  v_note TEXT := NULLIF(trim(COALESCE(p_note, '')), '');
  v_address TEXT := NULLIF(trim(COALESCE(p_delivery_address, '')), '');
  v_line JSONB;
  v_pid UUID;
  v_qty NUMERIC;
  v_product public.products;
  v_listing public.marketlink_listings;
  v_price NUMERIC;
  v_subtotal NUMERIC := 0;
  v_fee NUMERIC := NULL;
  v_order_id UUID;
  v_ref TEXT;
  v_existing public.marketlink_orders;
  v_recent INT;
  v_count INT := 0;
  v_item_names TEXT := '';
  v_currency TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to send an order request' USING ERRCODE = '42501';
  END IF;

  IF p_client_token IS NULL THEN
    RAISE EXCEPTION 'A submission token is required' USING ERRCODE = '22023';
  END IF;

  IF v_name IS NULL OR length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Enter the name we should reply to' USING ERRCODE = '22023';
  END IF;
  IF (v_phone IS NULL OR length(v_phone) < 7 OR length(v_phone) > 20)
     AND (v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'Add a phone number or an email address so the shop can reach you' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your basket is empty' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 40 THEN
    RAISE EXCEPTION 'That is more than one order can hold. Split it into two requests.' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 1000 THEN
    RAISE EXCEPTION 'Keep the note under 1000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT s.* INTO v_shop FROM public.shops s WHERE s.slug = trim(p_slug) AND s.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That shop is not available' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_sf FROM public.marketlink_storefronts sf
    WHERE sf.shop_id = v_shop.id AND sf.is_published;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That shop is not taking requests right now' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: the same submission token can never create a second order.
  SELECT * INTO v_existing FROM public.marketlink_orders o
    WHERE o.shop_id = v_shop.id AND o.client_token = p_client_token;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'order_id', v_existing.id, 'reference', v_existing.reference,
      'status', v_existing.status, 'subtotal', v_existing.subtotal,
      'delivery_fee', v_existing.delivery_fee, 'currency', v_existing.currency,
      'shop_name', v_sf.display_name, 'duplicate', true
    );
  END IF;

  -- Cheap abuse guard: one contact may send three requests to one shop in ten
  -- minutes. Real customers never hit this; a script does.
  SELECT COUNT(*) INTO v_recent FROM public.marketlink_orders o
    WHERE o.shop_id = v_shop.id
      AND o.created_at > now() - interval '10 minutes'
      AND ((v_phone IS NOT NULL AND o.customer_phone = v_phone)
        OR (v_email IS NOT NULL AND o.customer_email = v_email));
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'Too many recent requests. Please wait a few minutes before sending another.' USING ERRCODE = 'P0003';
  END IF;

  IF p_fulfillment NOT IN ('pickup', 'delivery') THEN
    RAISE EXCEPTION 'Choose collection or delivery' USING ERRCODE = '22023';
  END IF;

  IF p_fulfillment = 'delivery' THEN
    IF p_delivery_zone_id IS NULL OR NULLIF(trim(COALESCE(p_destination_country, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Choose where this should be delivered' USING ERRCODE = '22023';
    END IF;
    IF v_address IS NULL OR length(v_address) < 5 THEN
      RAISE EXCEPTION 'Add the delivery address' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_zone FROM public.marketlink_delivery_zones z
      WHERE z.id = p_delivery_zone_id AND z.shop_id = v_shop.id AND z.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That delivery option is not offered by this shop' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.marketlink_zone_matches(
      v_zone.kind, v_zone.country, v_zone.region, v_zone.city,
      p_destination_country, p_destination_region, p_destination_city
    ) THEN
      RAISE EXCEPTION 'This shop does not deliver to that destination' USING ERRCODE = 'P0002';
    END IF;
    v_fee := v_zone.fee;
  END IF;

  v_currency := v_shop.currency;

  -- Price and availability are read here, at submit time, from inventory. This
  -- pass validates every line and builds the subtotal; the item rows are
  -- written once, below, against the real order id.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;

    IF v_pid IS NULL OR v_qty IS NULL OR v_qty <= 0 OR v_qty > 99 THEN
      RAISE EXCEPTION 'Every line needs a quantity between 1 and 99' USING ERRCODE = '22023';
    END IF;
    IF v_qty <> floor(v_qty) THEN
      RAISE EXCEPTION 'Order whole units only' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_listing FROM public.marketlink_listings l
      WHERE l.shop_id = v_shop.id AND l.product_id = v_pid AND l.is_published;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A product in your basket is no longer published' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_product FROM public.products p
      WHERE p.id = v_pid AND p.shop_id = v_shop.id AND p.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A product in your basket is no longer available' USING ERRCODE = 'P0002';
    END IF;
    IF v_product.quantity < v_qty THEN
      RAISE EXCEPTION '% only has % % left', v_product.name, GREATEST(floor(v_product.quantity), 0), v_product.unit
        USING ERRCODE = 'P0002';
    END IF;

    v_price := COALESCE(v_listing.public_price, v_product.selling_price);
    v_count := v_count + 1;
    v_subtotal := v_subtotal + round(v_price * v_qty, 2);
    v_item_names := v_item_names || CASE WHEN v_item_names = '' THEN '' ELSE ', ' END || v_product.name;
  END LOOP;

  -- Create the order. A short retry covers the (unlikely) reference collision.
  FOR i IN 1..5 LOOP
    v_ref := 'ML-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    BEGIN
      INSERT INTO public.marketlink_orders (
        shop_id, customer_id, reference, client_token,
        customer_name, customer_phone, customer_email, preferred_contact,
        fulfillment, delivery_zone_id, destination_country, destination_region,
        destination_city, delivery_address, delivery_note,
        subtotal, delivery_fee, currency, status
      ) VALUES (
        v_shop.id, v_uid, v_ref, p_client_token,
        v_name, v_phone, v_email, CASE WHEN p_preferred_contact IN ('phone','email','whatsapp') THEN p_preferred_contact ELSE 'phone' END,
        p_fulfillment, p_delivery_zone_id, p_destination_country, p_destination_region,
        p_destination_city, v_address, v_note,
        v_subtotal, v_fee, v_currency, 'pending'
      ) RETURNING id INTO v_order_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_order_id := NULL;
    END;
  END LOOP;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Could not create the order request. Please try again.' USING ERRCODE = 'P0001';
  END IF;

  -- Now insert the real lines against the real order.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_line->>'product_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    SELECT * INTO v_listing FROM public.marketlink_listings l
      WHERE l.shop_id = v_shop.id AND l.product_id = v_pid AND l.is_published;
    SELECT * INTO v_product FROM public.products p
      WHERE p.id = v_pid AND p.shop_id = v_shop.id AND p.is_active;
    v_price := COALESCE(v_listing.public_price, v_product.selling_price);
    INSERT INTO public.marketlink_order_items (
      order_id, shop_id, listing_id, product_id, product_name, unit,
      quantity, unit_price, line_total, image_path
    ) VALUES (
      v_order_id, v_shop.id, v_listing.id, v_product.id, v_product.name, v_product.unit,
      v_qty, v_price, round(v_price * v_qty, 2), v_listing.image_path
    );
  END LOOP;

  INSERT INTO public.marketlink_notifications (shop_id, order_id, kind, title, body)
  VALUES (
    v_shop.id, v_order_id, 'order_request',
    'New order request from ' || v_name,
    v_count::text || CASE WHEN v_count = 1 THEN ' item' ELSE ' items' END
      || ' · ' || v_currency || ' ' || to_char(v_subtotal, 'FM999999990.00')
  );

  INSERT INTO public.audit_log (shop_id, actor_id, action, entity_type, entity_id, summary, metadata)
  VALUES (
    v_shop.id, v_uid, 'marketlink.order_requested', 'marketlink_order', v_order_id::text,
    'Order request ' || v_ref || ' received',
    jsonb_build_object('reference', v_ref, 'items', v_count, 'subtotal', v_subtotal)
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id, 'reference', v_ref, 'status', 'pending',
    'subtotal', v_subtotal, 'delivery_fee', v_fee, 'currency', v_currency,
    'shop_name', v_sf.display_name, 'duplicate', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10) Order status (seller) and customer history
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketlink_set_order_status(
  p_order_id UUID,
  p_status public.marketlink_order_status
) RETURNS public.marketlink_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.marketlink_orders;
BEGIN
  SELECT * INTO v_order FROM public.marketlink_orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_shop_owner(v_order.shop_id) THEN
    RAISE EXCEPTION 'Only the shop owner can manage order requests' USING ERRCODE = '42501';
  END IF;

  IF p_status = v_order.status THEN
    RETURN v_order;
  END IF;

  UPDATE public.marketlink_orders SET status = p_status WHERE id = p_order_id
    RETURNING * INTO v_order;

  INSERT INTO public.audit_log (shop_id, actor_id, action, entity_type, entity_id, summary, metadata)
  VALUES (
    v_order.shop_id, auth.uid(), 'marketlink.order_status', 'marketlink_order',
    v_order.id::text, 'Order ' || v_order.reference || ' marked ' || p_status::text,
    jsonb_build_object('status', p_status, 'reference', v_order.reference)
  );

  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_my_orders()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'reference', o.reference,
      'status', o.status,
      'shop_slug', s.slug,
      'shop_name', COALESCE(sf.display_name, s.name),
      'subtotal', o.subtotal,
      'delivery_fee', o.delivery_fee,
      'currency', o.currency,
      'fulfillment', o.fulfillment,
      'created_at', o.created_at,
      'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'name', i.product_name, 'quantity', i.quantity,
          'unit_price', i.unit_price, 'line_total', i.line_total, 'unit', i.unit
        )), '[]'::jsonb)
        FROM public.marketlink_order_items i WHERE i.order_id = o.id
      )
    ) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM public.marketlink_orders o
  JOIN public.shops s ON s.id = o.shop_id
  LEFT JOIN public.marketlink_storefronts sf ON sf.shop_id = s.id
  WHERE o.customer_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 11) Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketlink_storefronts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketlink_listings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketlink_delivery_zones TO authenticated;
GRANT SELECT, UPDATE ON public.marketlink_orders TO authenticated;
GRANT SELECT ON public.marketlink_order_items TO authenticated;
GRANT SELECT, UPDATE ON public.marketlink_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketlink_customer_profiles TO authenticated;
GRANT ALL ON public.marketlink_storefronts, public.marketlink_listings,
  public.marketlink_delivery_zones, public.marketlink_orders,
  public.marketlink_order_items, public.marketlink_notifications,
  public.marketlink_customer_profiles TO service_role;

GRANT EXECUTE ON FUNCTION public.marketlink_feed(TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_categories() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_shop(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_product(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_public_shops() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_public_listings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_submit_order(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_set_order_status(UUID, public.marketlink_order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_my_orders() TO authenticated;

-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default. Revoking
-- from `anon` alone leaves that PUBLIC grant in place, which would let an
-- anonymous caller reach the order RPC. Both are revoked here, then the
-- authenticated role is granted explicitly.
REVOKE EXECUTE ON FUNCTION public.marketlink_submit_order(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_set_order_status(UUID, public.marketlink_order_status) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_my_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketlink_submit_order(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_set_order_status(UUID, public.marketlink_order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_my_orders() TO authenticated;

-- Defence in depth: the marketlink tables need no anonymous grant at all. RLS
-- already returns nothing without a policy, but a missing grant is a second
-- lock on the same door.
REVOKE ALL ON public.marketlink_storefronts, public.marketlink_listings,
  public.marketlink_delivery_zones, public.marketlink_orders,
  public.marketlink_order_items, public.marketlink_notifications,
  public.marketlink_customer_profiles FROM anon;

-- ---------------------------------------------------------------------------
-- 12) Storage: a public-read bucket for MARKETPLACE images only
--
-- Product photos in the app stay in the private `product-images` bucket. A
-- marketplace image has to load for a visitor with no session, and a signed URL
-- cannot be minted anonymously, so this separate bucket is public to READ.
-- Writes are owner-only and keyed by the shop's own prefix, so one shop cannot
-- overwrite another's picture. The object path — never a URL — is what is
-- stored in `marketlink_listings.image_path`.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketlink-images', 'marketlink-images', true, 5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS marketlink_images_public_read ON storage.objects;
CREATE POLICY marketlink_images_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'marketlink-images');

DROP POLICY IF EXISTS marketlink_images_owner_insert ON storage.objects;
CREATE POLICY marketlink_images_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'marketlink-images'
    AND public.is_shop_owner(public.storage_shop_id(name))
  );

DROP POLICY IF EXISTS marketlink_images_owner_update ON storage.objects;
CREATE POLICY marketlink_images_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'marketlink-images'
    AND public.is_shop_owner(public.storage_shop_id(name))
  )
  WITH CHECK (
    bucket_id = 'marketlink-images'
    AND public.is_shop_owner(public.storage_shop_id(name))
  );

DROP POLICY IF EXISTS marketlink_images_owner_delete ON storage.objects;
CREATE POLICY marketlink_images_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'marketlink-images'
    AND public.is_shop_owner(public.storage_shop_id(name))
  );

COMMIT;
