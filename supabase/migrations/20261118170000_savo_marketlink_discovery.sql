-- Marketlink discovery: sort modes on the shared feed, and saved products.
--
-- Everything here is additive. The feed keeps its existing filters and its
-- `SECURITY DEFINER` public shape; it gains one optional argument so that
-- "New arrivals" and "Near arrivals" are ordered by the database instead of by
-- whatever page the browser happens to hold.
--
-- Saved products get their own table rather than a column on the customer
-- profile: a favourite references one listing, the listing may later be
-- unpublished, and a join table lets the delete cascade clean up after itself.

-- ---------------------------------------------------------------------------
-- 1) Feed sort modes
--
-- `p_sort` must be added, not appended by overloading: two functions with
-- defaulted arguments would make every named-argument call ambiguous.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.marketlink_feed(
  TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION, INT, INT
);

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
  p_offset INT DEFAULT 0,
  p_sort TEXT DEFAULT 'relevance'
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_sort TEXT := lower(COALESCE(NULLIF(trim(p_sort), ''), 'relevance'));
  v_rows JSONB;
  v_count INT;
BEGIN
  -- An unknown order is a caller's typo, not a reason to fail a shopper's page.
  IF v_sort NOT IN ('relevance', 'newest', 'nearby') THEN
    v_sort := 'relevance';
  END IF;

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
      -- New arrivals: the seller's own publication time, newest first.
      CASE WHEN v_sort = 'newest' THEN (l).published_at END DESC NULLS LAST,
      -- Nearby: real coordinates only. A shop without them sorts last; it is
      -- never given a distance it did not publish.
      CASE
        WHEN v_sort <> 'newest' AND p_lat IS NOT NULL AND p_lng IS NOT NULL
        THEN distance_km
      END ASC NULLS LAST,
      -- Everything else: what a customer can actually buy first.
      CASE WHEN v_sort <> 'newest' AND (p).quantity > 0 THEN 0 ELSE 1 END,
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

GRANT EXECUTE ON FUNCTION public.marketlink_feed(
  TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION, INT, INT, TEXT
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Saved products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketlink_favourites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.marketlink_listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

ALTER TABLE public.marketlink_favourites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketlink_favourites_read ON public.marketlink_favourites;
CREATE POLICY marketlink_favourites_read ON public.marketlink_favourites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS marketlink_favourites_insert ON public.marketlink_favourites;
CREATE POLICY marketlink_favourites_insert ON public.marketlink_favourites
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS marketlink_favourites_delete ON public.marketlink_favourites;
CREATE POLICY marketlink_favourites_delete ON public.marketlink_favourites
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.marketlink_favourites FROM anon;
GRANT SELECT, INSERT, DELETE ON public.marketlink_favourites TO authenticated;
GRANT ALL ON public.marketlink_favourites TO service_role;

/**
 * Save or unsave one product, and say which happened.
 *
 * A caller may only save a listing that is currently public, so a guessed UUID
 * cannot be used to store a reference to an unpublished product. The delete
 * runs first and its `FOUND` decides, which makes the toggle safe to retry.
 */
CREATE OR REPLACE FUNCTION public.marketlink_toggle_favourite(p_listing_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to save products' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.marketlink_favourites f
   WHERE f.user_id = v_uid AND f.listing_id = p_listing_id;

  IF FOUND THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.marketlink_listings l
    JOIN public.products p ON p.id = l.product_id AND p.shop_id = l.shop_id AND p.is_active
    JOIN public.shops s ON s.id = l.shop_id AND s.is_active
    JOIN public.marketlink_storefronts sf ON sf.shop_id = s.id AND sf.is_published
    WHERE l.id = p_listing_id AND l.is_published
  ) THEN
    RAISE EXCEPTION 'That product is not available' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.marketlink_favourites (user_id, listing_id)
  VALUES (v_uid, p_listing_id);

  RETURN true;
END;
$$;

/** The saved listing ids for the signed-in customer, newest first. */
CREATE OR REPLACE FUNCTION public.marketlink_favourite_ids()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(f.listing_id ORDER BY f.created_at DESC), '[]'::jsonb)
  FROM public.marketlink_favourites f
  WHERE f.user_id = auth.uid();
$$;

/** Saved products, as the same public card payload the feed returns. */
CREATE OR REPLACE FUNCTION public.marketlink_my_favourites()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(item ORDER BY saved_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      public.marketlink_listing_json(
        l, p, s, COALESCE(l.category, c.name), s.currency, NULL,
        (SELECT array_agg(DISTINCT z.kind::text)
           FROM public.marketlink_delivery_zones z
          WHERE z.shop_id = l.shop_id AND z.is_active)
      ) AS item,
      f.created_at AS saved_at
    FROM public.marketlink_favourites f
    JOIN public.marketlink_listings l ON l.id = f.listing_id AND l.is_published
    JOIN public.products p ON p.id = l.product_id AND p.shop_id = l.shop_id AND p.is_active
    JOIN public.shops s ON s.id = l.shop_id AND s.is_active
    JOIN public.marketlink_storefronts sf ON sf.shop_id = s.id AND sf.is_published
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE f.user_id = auth.uid()
  ) saved;
$$;

REVOKE EXECUTE ON FUNCTION public.marketlink_toggle_favourite(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_favourite_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_my_favourites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketlink_toggle_favourite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_favourite_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_my_favourites() TO authenticated;

COMMENT ON TABLE public.marketlink_favourites IS
  'Products a signed-in customer saved from the marketplace. Owner-only rows, enforced by RLS.';
