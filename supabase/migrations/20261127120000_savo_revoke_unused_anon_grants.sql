-- ============================================================================
-- Take away the anonymous grants that no policy can ever satisfy.
--
-- Four Market tables were granted to `anon` when the schema was created, but
-- every policy on them is written `to authenticated`:
--
--   marketlink_order_events   read by a shop member or the order's customer
--   marketlink_release_reads  a person's own "already read" marks
--   marketlink_reviews        the review's author or the shop
--   marketlink_sellers        the seller's own application
--
-- Row-level security already refuses `anon` on all four — a grant is not a
-- policy — so this is not a leak being closed. It is least privilege: a
-- privilege that exists but can never be used is one more thing to get wrong
-- later, and it makes an audit read as though anonymous visitors can reach
-- order events and reviews when they cannot.
--
-- `marketlink_releases` keeps its anon grant on purpose: `published_at <=
-- now()` is the public catalogue the Market page reads signed out.
--
-- Nothing in the app queries these four as `anon`; every caller is signed in.
-- ============================================================================

BEGIN;

REVOKE ALL ON TABLE public.marketlink_order_events FROM anon;
REVOKE ALL ON TABLE public.marketlink_release_reads FROM anon;
REVOKE ALL ON TABLE public.marketlink_reviews FROM anon;
REVOKE ALL ON TABLE public.marketlink_sellers FROM anon;

COMMIT;
