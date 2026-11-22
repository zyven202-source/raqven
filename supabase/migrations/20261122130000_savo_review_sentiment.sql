-- ===========================================================================
-- SAVO Market — review sentiment, stored once
-- ===========================================================================
--
-- Before this, the seller's feedback section asked the model to label the same
-- reviews every time it opened. The label of a published review does not change
-- when nobody edits it, so it is computed once and kept on the row.
--
-- The columns are written by the `savo-ai` edge function, which reaches them with
-- its service role after the model answers. Nothing in the browser can write
-- them: the table already revokes INSERT/UPDATE/DELETE from anon and
-- authenticated, and that is unchanged.
-- ===========================================================================

BEGIN;

ALTER TABLE public.marketlink_reviews
  ADD COLUMN IF NOT EXISTS sentiment_label TEXT
    CHECK (sentiment_label IS NULL OR sentiment_label IN ('positive', 'neutral', 'negative')),
  ADD COLUMN IF NOT EXISTS sentiment_score NUMERIC(4, 3)
    CHECK (sentiment_score IS NULL OR (sentiment_score >= 0 AND sentiment_score <= 1)),
  ADD COLUMN IF NOT EXISTS sentiment_model TEXT,
  ADD COLUMN IF NOT EXISTS sentiment_at TIMESTAMPTZ;

-- A partial index keeps the "what still needs a label" question cheap without
-- indexing the whole table for it.
CREATE INDEX IF NOT EXISTS marketlink_reviews_unlabelled_idx
  ON public.marketlink_reviews (shop_id)
  WHERE sentiment_label IS NULL AND moderation = 'visible';

/**
 * Stored sentiment for one shop's visible reviews.
 *
 * Seller-only: the section that shows it lives in the shop workspace, and the
 * public storefront deliberately publishes star ratings and words without a
 * model's opinion attached.
 */
CREATE OR REPLACE FUNCTION public.marketlink_shop_sentiment(p_shop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to read this shop''s feedback' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'This is not your shop' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'label', r.sentiment_label,
    'score', r.sentiment_score,
    'model', r.sentiment_model,
    'computed_at', r.sentiment_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.marketlink_reviews r
  WHERE r.shop_id = p_shop_id
    AND r.moderation = 'visible'
    AND r.sentiment_label IS NOT NULL;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.marketlink_shop_sentiment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketlink_shop_sentiment(UUID) TO authenticated;

COMMIT;
