-- Marketlink shop addresses.
--
-- These were first applied while building the feature; this migration records
-- the exact definitions the production database runs, so a fresh environment
-- ends up with the same readable, reserved-word-safe `/shop/<slug>` URLs.
--
-- The slug lives on `shops.slug` (already unique), is editable by the owner, and
-- is validated in the database as well as in the client, because a direct API
-- call must not be able to store an unusable or reserved address.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Words that must never become a shop address because a SAVO route owns them.
CREATE OR REPLACE FUNCTION public.marketlink_slug_reserved(p_slug text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT lower(trim(p_slug)) = ANY (ARRAY[
    'app','market','marketplace','shop','shops','store','dashboard','auth','api','admin',
    'legal','features','pricing','support','about','marketlink','sitemap','robots','login',
    'signup','account','checkout','new','edit','settings','help','static','assets'
  ]);
$function$;

-- Used by the owner-facing address form before it offers to save.
CREATE OR REPLACE FUNCTION public.marketlink_slug_available(p_slug text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    lower(trim(p_slug)) ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND length(trim(p_slug)) BETWEEN 3 AND 60
    AND NOT public.marketlink_slug_reserved(p_slug)
    AND NOT EXISTS (SELECT 1 FROM public.shops s WHERE s.slug = lower(trim(p_slug)));
$function$;

CREATE OR REPLACE FUNCTION public.marketlink_validate_shop_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    IF lower(NEW.slug) !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(NEW.slug) NOT BETWEEN 3 AND 60 THEN
      RAISE EXCEPTION 'Use 3–60 lowercase letters, numbers and single hyphens' USING ERRCODE = '22023';
    END IF;
    IF public.marketlink_slug_reserved(NEW.slug) THEN
      RAISE EXCEPTION 'That address is reserved by SAVO' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS marketlink_shop_slug_validate ON public.shops;
CREATE TRIGGER marketlink_shop_slug_validate
  BEFORE UPDATE OF slug ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.marketlink_validate_shop_slug();

-- Marketplace search matches product descriptions with ILIKE, so a trigram
-- index keeps that from becoming a sequential scan as listings grow.
CREATE INDEX IF NOT EXISTS marketlink_listings_desc_trgm
  ON public.marketlink_listings USING gin (description gin_trgm_ops);

-- Only a shop owner (or the slug form) needs the availability check.
REVOKE EXECUTE ON FUNCTION public.marketlink_slug_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketlink_slug_available(text) TO authenticated;
