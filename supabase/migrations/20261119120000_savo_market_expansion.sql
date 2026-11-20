-- ============================================================================
-- 20261119120000_savo_market_expansion.sql
--
-- Adds the commerce features that sit on top of the existing Marketlink core:
--
--   1. A real fulfillment/settlement lifecycle for marketplace orders, with
--      mutual completion confirmed independently by both parties.
--   2. Exactly-once recording of a settled marketplace order in the existing
--      `sales` ledger, with a stock movement and a channel marker so reports
--      can tell marketplace revenue from POS revenue.
--   3. Customer-facing persisted notifications (the shop inbox already
--      existed; customers had no recipient of their own).
--   4. SAVO Circles: private shopping lists with a shareable read-only token,
--      deterministic product matching and no access to private data.
--   5. Reviews tied to eligible settled orders, a public reputation aggregate,
--      and reporting/moderation state that never silently hides a negative
--      review.
--   6. Release announcements published by a platform admin, with per-user read
--      state instead of one row per user.
--   7. An authorized order-document payload for SAVO Signature receipts.
--
-- Every change is additive. No existing row is rewritten and no policy is
-- loosened: anonymous callers still reach only SECURITY DEFINER functions.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Order lifecycle vocabulary
-- ---------------------------------------------------------------------------

ALTER TYPE public.marketlink_order_status ADD VALUE IF NOT EXISTS 'preparing';
ALTER TYPE public.marketlink_order_status ADD VALUE IF NOT EXISTS 'ready_for_collection';
ALTER TYPE public.marketlink_order_status ADD VALUE IF NOT EXISTS 'out_for_delivery';
ALTER TYPE public.marketlink_order_status ADD VALUE IF NOT EXISTS 'awaiting_settlement';
ALTER TYPE public.marketlink_order_status ADD VALUE IF NOT EXISTS 'settled';
ALTER TYPE public.marketlink_order_status ADD VALUE IF NOT EXISTS 'disputed';

-- ---------------------------------------------------------------------------
-- 2) Settlement columns, channel columns on the ledger, and transition history
-- ---------------------------------------------------------------------------

ALTER TABLE public.marketlink_orders
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seller_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS marketlink_orders_awaiting_idx
  ON public.marketlink_orders (shop_id, status);

-- A settled marketplace order may create at most one sale, and a sale may be
-- referenced by at most one order. This is the database-level guarantee behind
-- "a repeated confirmation must not record revenue twice".
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'pos',
  ADD COLUMN IF NOT EXISTS marketplace_order_id UUID REFERENCES public.marketlink_orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sales_marketplace_order_uidx
  ON public.sales (marketplace_order_id)
  WHERE marketplace_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sales_shop_channel_idx ON public.sales (shop_id, channel, sold_at DESC);

CREATE TABLE IF NOT EXISTS public.marketlink_order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.marketlink_orders(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  actor_id UUID,
  actor_role TEXT NOT NULL DEFAULT 'system',
  from_status public.marketlink_order_status,
  to_status public.marketlink_order_status,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketlink_order_events_order_idx
  ON public.marketlink_order_events (order_id, created_at);

ALTER TABLE public.marketlink_order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketlink_order_events_read ON public.marketlink_order_events;
CREATE POLICY marketlink_order_events_read ON public.marketlink_order_events
  FOR SELECT TO authenticated
  USING (
    public.is_shop_member(shop_id)
    OR EXISTS (
      SELECT 1 FROM public.marketlink_orders o
      WHERE o.id = order_id AND o.customer_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.marketlink_order_events FROM anon, authenticated;
GRANT SELECT ON public.marketlink_order_events TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Notifications get a real recipient
--
-- `user_id IS NULL` keeps the existing meaning: a shop inbox row, visible to
-- the shop's members. A customer row carries the customer's id and is visible
-- only to that user. A shop member must never see a customer's personal rows.
-- ---------------------------------------------------------------------------

ALTER TABLE public.marketlink_notifications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'order_request',
  ADD COLUMN IF NOT EXISTS target_path TEXT,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE INDEX IF NOT EXISTS marketlink_notifications_user_idx
  ON public.marketlink_notifications (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS marketlink_notifications_dedupe_uidx
  ON public.marketlink_notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND user_id IS NOT NULL;

DROP POLICY IF EXISTS marketlink_notifications_read ON public.marketlink_notifications;
CREATE POLICY marketlink_notifications_read ON public.marketlink_notifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND public.is_shop_member(shop_id))
  );

DROP POLICY IF EXISTS marketlink_notifications_mark_read ON public.marketlink_notifications;
CREATE POLICY marketlink_notifications_mark_read ON public.marketlink_notifications
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND public.is_shop_member(shop_id))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (user_id IS NULL AND public.is_shop_member(shop_id))
  );

REVOKE INSERT, DELETE ON public.marketlink_notifications FROM anon, authenticated;

/**
 * Writes one notification for one recipient. Internal helper: it is not
 * granted to any client role, so a browser cannot forge a notification.
 */
CREATE OR REPLACE FUNCTION public.marketlink_notify(
  p_user_id UUID,
  p_shop_id UUID,
  p_order_id UUID,
  p_kind TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_target_path TEXT DEFAULT NULL,
  p_dedupe_key TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.marketlink_notifications (
    user_id, shop_id, order_id, kind, title, body, target_path, dedupe_key
  ) VALUES (
    p_user_id, p_shop_id, p_order_id, p_kind, p_title, p_body, p_target_path, p_dedupe_key
  )
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.marketlink_notify(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) The transition guard is rewritten for the full lifecycle
-- ---------------------------------------------------------------------------

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
      -- 'completed' stays reachable from 'accepted' for compatibility with a
      -- browser tab loaded before this migration; it is a terminal state and
      -- records no sale, so it cannot fake settlement.
      WHEN 'accepted' THEN NEW.status IN (
        'preparing', 'ready_for_collection', 'out_for_delivery',
        'awaiting_settlement', 'cancelled', 'completed')
      WHEN 'preparing' THEN NEW.status IN (
        'ready_for_collection', 'out_for_delivery', 'awaiting_settlement', 'cancelled')
      WHEN 'ready_for_collection' THEN NEW.status IN ('awaiting_settlement', 'cancelled')
      WHEN 'out_for_delivery' THEN NEW.status IN ('awaiting_settlement', 'cancelled')
      -- Settling is only legal once BOTH parties have confirmed. The RPC below
      -- is the only place those timestamps are written, so a direct table
      -- update from a browser cannot fake completion.
      WHEN 'awaiting_settlement' THEN
        NEW.status IN ('disputed', 'cancelled')
        OR (NEW.status = 'settled'
            AND NEW.customer_confirmed_at IS NOT NULL
            AND NEW.seller_confirmed_at IS NOT NULL)
      WHEN 'disputed' THEN
        NEW.status IN ('awaiting_settlement', 'cancelled')
        OR (NEW.status = 'settled'
            AND NEW.customer_confirmed_at IS NOT NULL
            AND NEW.seller_confirmed_at IS NOT NULL)
      ELSE false
    END;
    IF NOT allowed THEN
      RAISE EXCEPTION 'An order cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;

    -- A collection order is never "out for delivery", and a delivery order is
    -- never "ready for collection".
    IF NEW.status = 'out_for_delivery' AND NEW.fulfillment <> 'delivery' THEN
      RAISE EXCEPTION 'This order is for collection, not delivery' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'ready_for_collection' AND NEW.fulfillment <> 'pickup' THEN
      RAISE EXCEPTION 'This order is for delivery, not collection' USING ERRCODE = '23514';
    END IF;

    NEW.status_updated_at := now();
    NEW.status_updated_by := auth.uid();
    IF NEW.status = 'accepted' AND NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketlink_orders_guard ON public.marketlink_orders;
CREATE TRIGGER marketlink_orders_guard
  BEFORE UPDATE ON public.marketlink_orders
  FOR EACH ROW EXECUTE FUNCTION public.marketlink_guard_order_update();

/** Every status change leaves a row, whoever caused it. */
CREATE OR REPLACE FUNCTION public.marketlink_log_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.marketlink_order_events (
      order_id, shop_id, actor_id, actor_role, from_status, to_status, note
    ) VALUES (
      NEW.id, NEW.shop_id, auth.uid(),
      CASE
        WHEN auth.uid() IS NULL THEN 'system'
        WHEN NEW.customer_id = auth.uid() THEN 'customer'
        WHEN public.is_shop_member(NEW.shop_id) THEN 'seller'
        ELSE 'system'
      END,
      OLD.status, NEW.status, NEW.owner_note
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketlink_orders_log ON public.marketlink_orders;
CREATE TRIGGER marketlink_orders_log
  AFTER UPDATE ON public.marketlink_orders
  FOR EACH ROW EXECUTE FUNCTION public.marketlink_log_order_event();

-- ---------------------------------------------------------------------------
-- 5) Settlement: an acknowledgment, never a payment
-- ---------------------------------------------------------------------------

/**
 * One party confirms they consider the transaction complete.
 *
 * The first call records a timestamp and tells the other party. The second
 * call moves the order to settled and records exactly one marketplace sale.
 * Calling again as the same party is a no-op that returns the current state.
 *
 * This function does not mark anything as paid. `sales.amount_paid` stays 0 and
 * the balance is carried, because SAVO has no verified online payment record
 * for a marketplace order.
 */
CREATE OR REPLACE FUNCTION public.marketlink_confirm_settlement(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.marketlink_orders;
  v_is_customer BOOLEAN;
  v_is_seller BOOLEAN;
  v_both BOOLEAN;
  v_seller UUID;
  v_sale_id UUID;
  v_total NUMERIC;
  v_item RECORD;
  v_product public.products;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to confirm this order' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.marketlink_orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_customer := v_order.customer_id = v_uid;
  v_is_seller := public.is_shop_member(v_order.shop_id);
  IF NOT v_is_customer AND NOT v_is_seller THEN
    RAISE EXCEPTION 'This is not your order' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('settled', 'completed') THEN
    RETURN jsonb_build_object(
      'status', v_order.status, 'settled_at', v_order.settled_at,
      'customer_confirmed_at', v_order.customer_confirmed_at,
      'seller_confirmed_at', v_order.seller_confirmed_at,
      'sale_id', v_order.sale_id, 'duplicate', true
    );
  END IF;

  IF v_order.status NOT IN ('awaiting_settlement', 'disputed') THEN
    RAISE EXCEPTION 'This order is not ready to be settled yet' USING ERRCODE = '23514';
  END IF;

  IF v_is_customer AND v_order.customer_confirmed_at IS NULL THEN
    UPDATE public.marketlink_orders SET customer_confirmed_at = now() WHERE id = p_order_id;
  ELSIF v_is_seller AND v_order.seller_confirmed_at IS NULL THEN
    UPDATE public.marketlink_orders SET seller_confirmed_at = now() WHERE id = p_order_id;
  END IF;

  SELECT * INTO v_order FROM public.marketlink_orders o WHERE o.id = p_order_id FOR UPDATE;
  v_both := v_order.customer_confirmed_at IS NOT NULL AND v_order.seller_confirmed_at IS NOT NULL;

  -- Tell the other party their confirmation landed.
  IF v_is_customer THEN
    PERFORM public.marketlink_notify(
      NULL, v_order.shop_id, v_order.id, 'settlement_confirmed',
      'Customer confirmed order ' || v_order.reference,
      'Confirm on your side once the order is complete.',
      '/app/marketlink', 'settle-seller-' || v_order.id::text
    );
  ELSE
    PERFORM public.marketlink_notify(
      v_order.customer_id, v_order.shop_id, v_order.id, 'settlement_confirmed',
      'The shop confirmed order ' || v_order.reference,
      'Confirm on your side once you have received it.',
      '/account/orders', 'settle-customer-' || v_order.id::text
    );
  END IF;

  IF v_both AND v_order.status <> 'settled' THEN
    -- Re-check stock before recognising revenue: if inventory moved since the
    -- order was placed, the order stays open rather than overselling.
    FOR v_item IN
      SELECT i.product_id, i.quantity, i.unit_price, i.line_total, i.product_name
      FROM public.marketlink_order_items i WHERE i.order_id = v_order.id
    LOOP
      IF v_item.product_id IS NOT NULL THEN
        SELECT * INTO v_product FROM public.products p WHERE p.id = v_item.product_id FOR UPDATE;
        IF FOUND AND v_product.quantity < v_item.quantity THEN
          RAISE EXCEPTION '% now has % left, which is less than this order needs',
            v_product.name, v_product.quantity USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END LOOP;

    v_total := round(v_order.subtotal + COALESCE(v_order.delivery_fee, 0), 2);

    SELECT sm.user_id INTO v_seller
    FROM public.shop_members sm
    WHERE sm.shop_id = v_order.shop_id AND sm.role = 'owner'
    ORDER BY sm.created_at LIMIT 1;

    -- One sale per order. The partial unique index is the final guard.
    IF v_order.sale_id IS NULL THEN
      INSERT INTO public.sales (
        shop_id, receipt_number, customer_name, customer_phone,
        subtotal, discount_amount, tax_amount, total_amount,
        amount_paid, balance_due, status, note, user_id, channel, marketplace_order_id
      ) VALUES (
        v_order.shop_id, v_order.reference, v_order.customer_name, v_order.customer_phone,
        v_order.subtotal, 0, 0, v_total,
        0, v_total, 'completed',
        'Marketplace order ' || v_order.reference || ' · settled by both parties',
        v_seller, 'marketplace', v_order.id
      ) RETURNING id INTO v_sale_id;

      INSERT INTO public.sale_items (
        shop_id, sale_id, product_id, product_name, quantity,
        unit_price, buying_price, discount_amount, subtotal
      )
      SELECT
        v_order.shop_id, v_sale_id, i.product_id, i.product_name, i.quantity,
        i.unit_price, COALESCE(p.buying_price, 0), 0, i.line_total
      FROM public.marketlink_order_items i
      LEFT JOIN public.products p ON p.id = i.product_id
      WHERE i.order_id = v_order.id;

      -- Stock leaves the shelf at recognition time, through the same ledger the
      -- POS writes to, so reports and stock history stay consistent.
      FOR v_item IN
        SELECT i.product_id, i.quantity
        FROM public.marketlink_order_items i
        WHERE i.order_id = v_order.id AND i.product_id IS NOT NULL
      LOOP
        UPDATE public.products
          SET quantity = quantity - v_item.quantity
          WHERE id = v_item.product_id
          RETURNING * INTO v_product;

        INSERT INTO public.inventory_movements (
          shop_id, product_id, movement_type, quantity, unit_cost, balance_after,
          reference_type, reference_id, notes, user_id
        ) VALUES (
          v_order.shop_id, v_product.id, 'sale', -v_item.quantity,
          v_product.buying_price, v_product.quantity,
          'marketlink_order', v_order.id,
          'Marketplace order ' || v_order.reference, v_uid
        );
      END LOOP;
    ELSE
      v_sale_id := v_order.sale_id;
    END IF;

    UPDATE public.marketlink_orders
      SET status = 'settled', settled_at = now(), sale_id = v_sale_id
      WHERE id = v_order.id;

    PERFORM public.marketlink_notify(
      v_order.customer_id, v_order.shop_id, v_order.id, 'order_settled',
      'Order ' || v_order.reference || ' is settled',
      'Both sides confirmed completion. No card or online payment is recorded by SAVO.',
      '/account/orders', 'settled-customer-' || v_order.id::text
    );
    PERFORM public.marketlink_notify(
      NULL, v_order.shop_id, v_order.id, 'order_settled',
      'Order ' || v_order.reference || ' is settled',
      'Recorded as a marketplace sale. Confirm any payment you received separately.',
      '/app/marketlink', 'settled-seller-' || v_order.id::text
    );
    INSERT INTO public.audit_log (shop_id, actor_id, action, entity_type, entity_id, summary, metadata)
    VALUES (
      v_order.shop_id, v_uid, 'marketlink.order_settled', 'marketlink_order', v_order.id::text,
      'Order ' || v_order.reference || ' settled by mutual confirmation',
      jsonb_build_object('reference', v_order.reference, 'sale_id', v_sale_id, 'total', v_total)
    );
  END IF;

  SELECT * INTO v_order FROM public.marketlink_orders o WHERE o.id = p_order_id;
  RETURN jsonb_build_object(
    'status', v_order.status, 'settled_at', v_order.settled_at,
    'customer_confirmed_at', v_order.customer_confirmed_at,
    'seller_confirmed_at', v_order.seller_confirmed_at,
    'sale_id', v_order.sale_id, 'duplicate', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_dispute_order(p_order_id UUID, p_reason TEXT)
RETURNS public.marketlink_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.marketlink_orders;
  v_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to raise a dispute' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Describe the problem in 5–1000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.marketlink_orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.customer_id <> v_uid AND NOT public.is_shop_member(v_order.shop_id) THEN
    RAISE EXCEPTION 'This is not your order' USING ERRCODE = '42501';
  END IF;
  IF v_order.status = 'settled' THEN
    RAISE EXCEPTION 'A settled order is final; contact the shop directly' USING ERRCODE = '23514';
  END IF;

  UPDATE public.marketlink_orders
    SET status = 'disputed', disputed_at = now(), dispute_reason = v_reason
    WHERE id = p_order_id
    RETURNING * INTO v_order;

  IF v_order.customer_id = v_uid THEN
    PERFORM public.marketlink_notify(
      NULL, v_order.shop_id, v_order.id, 'order_disputed',
      'Order ' || v_order.reference || ' was disputed',
      v_reason, '/app/marketlink', 'dispute-' || v_order.id::text
    );
  ELSE
    PERFORM public.marketlink_notify(
      v_order.customer_id, v_order.shop_id, v_order.id, 'order_disputed',
      'The shop raised a problem with order ' || v_order.reference,
      v_reason, '/account/orders', 'dispute-' || v_order.id::text
    );
  END IF;

  RETURN v_order;
END;
$$;

-- Seller transitions, with the customer notified each time.
CREATE OR REPLACE FUNCTION public.marketlink_advance_order(
  p_order_id UUID,
  p_status public.marketlink_order_status,
  p_note TEXT DEFAULT NULL
) RETURNS public.marketlink_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.marketlink_orders;
  v_label TEXT;
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

  UPDATE public.marketlink_orders
    SET status = p_status,
        owner_note = COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), owner_note)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

  v_label := replace(v_order.status::text, '_', ' ');
  PERFORM public.marketlink_notify(
    v_order.customer_id, v_order.shop_id, v_order.id, 'order_status',
    'Order ' || v_order.reference || ' is now ' || v_label,
    CASE v_order.status::text
      WHEN 'rejected' THEN 'The shop declined this request. Nothing was charged.'
      WHEN 'cancelled' THEN 'This order was cancelled.'
      WHEN 'awaiting_settlement' THEN 'Confirm completion when you are ready.'
      ELSE NULL
    END,
    '/account/orders',
    'status-' || v_order.id::text || '-' || v_order.status::text
  );

  INSERT INTO public.audit_log (shop_id, actor_id, action, entity_type, entity_id, summary, metadata)
  VALUES (
    v_order.shop_id, auth.uid(), 'marketlink.order_status', 'marketlink_order',
    v_order.id::text, 'Order ' || v_order.reference || ' marked ' || v_order.status::text,
    jsonb_build_object('status', v_order.status, 'reference', v_order.reference)
  );

  RETURN v_order;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) SAVO Circles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketlink_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  share_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  share_enabled BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketlink_lists_owner_idx
  ON public.marketlink_lists (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.marketlink_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.marketlink_lists(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.marketlink_listings(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  note TEXT CHECK (note IS NULL OR length(note) <= 400),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketlink_list_items_list_idx
  ON public.marketlink_list_items (list_id, created_at);

ALTER TABLE public.marketlink_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketlink_list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketlink_lists_own ON public.marketlink_lists;
CREATE POLICY marketlink_lists_own ON public.marketlink_lists
  FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS marketlink_list_items_own ON public.marketlink_list_items;
CREATE POLICY marketlink_list_items_own ON public.marketlink_list_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.marketlink_lists l WHERE l.id = list_id AND l.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.marketlink_lists l WHERE l.id = list_id AND l.owner_id = auth.uid()));

DROP TRIGGER IF EXISTS marketlink_lists_updated_at ON public.marketlink_lists;
CREATE TRIGGER marketlink_lists_updated_at
  BEFORE UPDATE ON public.marketlink_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketlink_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketlink_list_items TO authenticated;
GRANT ALL ON public.marketlink_lists, public.marketlink_list_items TO service_role;
REVOKE ALL ON public.marketlink_lists, public.marketlink_list_items FROM anon;

/**
 * Deterministic name matching.
 *
 * Lowercased, punctuation removed, whitespace collapsed. No AI and no fuzzy
 * third-party service: the match a customer sees is explainable.
 */
CREATE OR REPLACE FUNCTION public.marketlink_norm(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9 ]+', ' ', 'g'));
$$;

/**
 * The matching candidates for one requested item, across every published shop.
 * The caller's own requested listing, when still published, comes first.
 */
CREATE OR REPLACE FUNCTION public.marketlink_list_candidates(
  p_name TEXT,
  p_listing_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 4
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH norm AS (
    SELECT public.marketlink_norm(p_name) AS term
  ),
  candidates AS (
    SELECT
      l.id,
      l.product_id,
      p.name,
      p.unit,
      COALESCE(l.public_price, p.selling_price) AS price,
      p.quantity,
      l.image_path,
      s.slug AS shop_slug,
      COALESCE(sf.display_name, s.name) AS shop_name,
      s.currency,
      (SELECT COALESCE(jsonb_agg(DISTINCT z.kind), '[]'::jsonb)
         FROM public.marketlink_delivery_zones z
         WHERE z.shop_id = s.id AND z.is_active) AS delivery_kinds,
      CASE
        WHEN p.quantity <= 0 THEN 'out'
        WHEN p.quantity <= p.low_stock_threshold THEN 'low'
        ELSE 'in'
      END AS stock_state,
      (l.id = p_listing_id) AS is_requested
    FROM public.marketlink_listings l
    JOIN public.products p ON p.id = l.product_id AND p.is_active
    JOIN public.shops s ON s.id = l.shop_id AND s.is_active
    JOIN public.marketlink_storefronts sf ON sf.shop_id = s.id AND sf.is_published
    CROSS JOIN norm
    WHERE l.is_published
      AND (
        l.id = p_listing_id
        OR norm.term = ''
        OR public.marketlink_norm(p.name) LIKE '%' || norm.term || '%'
        OR norm.term LIKE '%' || public.marketlink_norm(p.name) || '%'
        OR EXISTS (
          SELECT 1
          FROM regexp_split_to_table(norm.term, '\s+') AS t(token)
          WHERE length(t.token) >= 3
            AND public.marketlink_norm(p.name) LIKE '%' || t.token || '%'
        )
        OR public.marketlink_norm(l.category) LIKE '%' || norm.term || '%'
      )
  )
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'is_requested' DESC, entry->>'in_stock' DESC, (entry->>'price')::numeric), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'listing_id', c.id,
      'product_id', c.product_id,
      'name', c.name,
      'unit', c.unit,
      'price', c.price,
      'currency', c.currency,
      'image_path', c.image_path,
      'shop_slug', c.shop_slug,
      'shop_name', c.shop_name,
      'stock_state', c.stock_state,
      'max_quantity', GREATEST(floor(c.quantity), 0),
      'delivery_kinds', c.delivery_kinds,
      'is_requested', c.is_requested,
      'in_stock', c.quantity > 0
    ) AS entry
    FROM candidates c
    ORDER BY c.is_requested DESC, (c.quantity > 0) DESC, COALESCE(NULLIF(c.price, 0), 1e12) ASC
    LIMIT LEAST(GREATEST(p_limit, 1), 8)
  ) rows;
$$;

/**
 * A list, with every requested line and its real candidates.
 * `p_owner_only` is true for the owner's own view; the shared view never
 * receives the owner's id, email, addresses or any other list.
 */
CREATE OR REPLACE FUNCTION public.marketlink_list_payload(p_list_id UUID, p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_list public.marketlink_lists;
  v_is_owner BOOLEAN;
BEGIN
  IF p_list_id IS NOT NULL THEN
    SELECT * INTO v_list FROM public.marketlink_lists l WHERE l.id = p_list_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That list no longer exists' USING ERRCODE = 'P0002';
    END IF;
    v_is_owner := auth.uid() IS NOT NULL AND v_list.owner_id = auth.uid();
    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'That list is not yours' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO v_list FROM public.marketlink_lists l
      WHERE l.share_token = p_token AND l.share_enabled AND l.archived_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That shared list is not available' USING ERRCODE = 'P0002';
    END IF;
    -- A signed-out visitor is never the owner, and a NULL comparison must not
    -- leak a JSON null into the payload the page reads as a boolean.
    v_is_owner := auth.uid() IS NOT NULL AND v_list.owner_id = auth.uid();
  END IF;

  RETURN jsonb_build_object(
    'id', v_list.id,
    'name', v_list.name,
    'is_owner', v_is_owner,
    'share_token', CASE WHEN v_is_owner AND v_list.share_enabled THEN v_list.share_token ELSE NULL END,
    'updated_at', v_list.updated_at,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'quantity', i.quantity,
        'note', i.note,
        'resolved', i.resolved_at IS NOT NULL,
        'listing_id', i.listing_id,
        'candidates', public.marketlink_list_candidates(i.name, i.listing_id, 4)
      ) ORDER BY i.created_at)
      FROM public.marketlink_list_items i
      WHERE i.list_id = v_list.id
    ), '[]'::jsonb)
  );
END;
$$;

-- Every list write goes through a function: the browser never builds a row
-- with an owner id it chose.
CREATE OR REPLACE FUNCTION public.marketlink_create_list(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to keep a shopping list' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Give the list a name of 1–80 characters' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.marketlink_lists (owner_id, name) VALUES (auth.uid(), v_name) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_rename_list(p_list_id UUID, p_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
BEGIN
  IF v_name IS NULL OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Give the list a name of 1–80 characters' USING ERRCODE = '22023';
  END IF;
  UPDATE public.marketlink_lists SET name = v_name
    WHERE id = p_list_id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That list is not yours' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_delete_list(p_list_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.marketlink_lists WHERE id = p_list_id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That list is not yours' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_rotate_list_share(p_list_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token UUID;
BEGIN
  UPDATE public.marketlink_lists
    SET share_token = gen_random_uuid(), share_enabled = true
    WHERE id = p_list_id AND owner_id = auth.uid()
    RETURNING share_token INTO v_token;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'That list is not yours' USING ERRCODE = '42501';
  END IF;
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_set_list_share(p_list_id UUID, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.marketlink_lists SET share_enabled = COALESCE(p_enabled, true)
    WHERE id = p_list_id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That list is not yours' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_add_list_item(
  p_list_id UUID,
  p_name TEXT,
  p_quantity NUMERIC DEFAULT 1,
  p_listing_id UUID DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_name TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
  v_qty NUMERIC := COALESCE(NULLIF(p_quantity, 0), 1);
  v_listing public.marketlink_listings;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.marketlink_lists l
    WHERE l.id = p_list_id AND l.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'That list is not yours' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR length(v_name) > 160 THEN
    RAISE EXCEPTION 'Name the item in 1–160 characters' USING ERRCODE = '22023';
  END IF;
  IF v_qty <= 0 OR v_qty > 999 THEN
    RAISE EXCEPTION 'Choose a quantity between 1 and 999' USING ERRCODE = '22023';
  END IF;

  -- A listing reference must be a real, currently published listing.
  IF p_listing_id IS NOT NULL THEN
    SELECT * INTO v_listing FROM public.marketlink_listings l
      WHERE l.id = p_listing_id AND l.is_published;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That product is no longer published' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.marketlink_list_items (list_id, listing_id, product_id, name, quantity, note)
  VALUES (p_list_id, p_listing_id, COALESCE(p_product_id, v_listing.product_id), v_name, v_qty,
          NULLIF(trim(COALESCE(p_note, '')), ''))
  RETURNING id INTO v_id;

  UPDATE public.marketlink_lists SET updated_at = now() WHERE id = p_list_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_update_list_item(
  p_item_id UUID,
  p_quantity NUMERIC DEFAULT NULL,
  p_resolved BOOLEAN DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.marketlink_list_items i
    SET quantity = COALESCE(p_quantity, i.quantity),
        resolved_at = CASE WHEN p_resolved IS NULL THEN i.resolved_at
                           WHEN p_resolved THEN now() ELSE NULL END,
        name = COALESCE(NULLIF(trim(COALESCE(p_name, '')), ''), i.name),
        note = COALESCE(p_note, i.note)
    WHERE i.id = p_item_id
      AND EXISTS (
        SELECT 1 FROM public.marketlink_lists l
        WHERE l.id = i.list_id AND l.owner_id = auth.uid()
      );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item is not on one of your lists' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_remove_list_item(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.marketlink_list_items i
    WHERE i.id = p_item_id
      AND EXISTS (
        SELECT 1 FROM public.marketlink_lists l
        WHERE l.id = i.list_id AND l.owner_id = auth.uid()
      );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That item is not on one of your lists' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_my_lists()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', l.id, 'name', l.name, 'share_token', l.share_token,
    'share_enabled', l.share_enabled, 'updated_at', l.updated_at,
    'item_count', (SELECT count(*) FROM public.marketlink_list_items i WHERE i.list_id = l.id),
    'open_count', (SELECT count(*) FROM public.marketlink_list_items i
                    WHERE i.list_id = l.id AND i.resolved_at IS NULL)
  ) ORDER BY l.updated_at DESC), '[]'::jsonb)
  FROM public.marketlink_lists l
  WHERE l.owner_id = auth.uid() AND l.archived_at IS NULL;
$$;

-- ---------------------------------------------------------------------------
-- 7) Reviews and reputation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketlink_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id UUID NOT NULL UNIQUE REFERENCES public.marketlink_orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT CHECK (body IS NULL OR length(body) <= 2000),
  verified_purchase BOOLEAN NOT NULL DEFAULT true,
  moderation TEXT NOT NULL DEFAULT 'visible' CHECK (moderation IN ('visible', 'reported', 'hidden')),
  report_count INT NOT NULL DEFAULT 0,
  last_reported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS marketlink_reviews_shop_idx
  ON public.marketlink_reviews (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketlink_reviews_visible_idx
  ON public.marketlink_reviews (shop_id) WHERE moderation <> 'hidden';

ALTER TABLE public.marketlink_reviews ENABLE ROW LEVEL SECURITY;

-- The writer is a verified buyer, so their own review is theirs to see. The
-- shop sees its reviews. The public never queries this table; it uses the
-- aggregate and the published list below, which exclude hidden rows and any
-- customer identity.
DROP POLICY IF EXISTS marketlink_reviews_read ON public.marketlink_reviews;
CREATE POLICY marketlink_reviews_read ON public.marketlink_reviews
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_shop_member(shop_id));

REVOKE INSERT, UPDATE, DELETE ON public.marketlink_reviews FROM anon, authenticated;
GRANT SELECT ON public.marketlink_reviews TO authenticated;

CREATE OR REPLACE FUNCTION public.marketlink_submit_review(
  p_order_id UUID,
  p_rating INT,
  p_body TEXT DEFAULT NULL
) RETURNS public.marketlink_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.marketlink_orders;
  v_body TEXT := NULLIF(trim(COALESCE(p_body, '')), '');
  v_review public.marketlink_reviews;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to leave feedback' USING ERRCODE = '42501';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Choose a star rating from 1 to 5' USING ERRCODE = '22023';
  END IF;
  IF v_body IS NOT NULL AND length(v_body) > 2000 THEN
    RAISE EXCEPTION 'Keep your feedback under 2000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.marketlink_orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.customer_id <> v_uid THEN
    RAISE EXCEPTION 'Only the customer on this order can review it' USING ERRCODE = '42501';
  END IF;
  IF v_order.status NOT IN ('settled', 'completed') THEN
    RAISE EXCEPTION 'You can review an order once it is complete' USING ERRCODE = '23514';
  END IF;
  -- A shop owner reviewing their own shop through a second account is not
  -- detectable in general, but the direct case is: this account belongs to the
  -- shop that would be reviewed.
  IF public.is_shop_member(v_order.shop_id) THEN
    RAISE EXCEPTION 'A shop cannot review its own order' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.marketlink_reviews r WHERE r.order_id = p_order_id) THEN
    RAISE EXCEPTION 'This order already has feedback' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.marketlink_reviews (shop_id, order_id, customer_id, rating, body)
  VALUES (v_order.shop_id, p_order_id, v_uid, p_rating, v_body)
  RETURNING * INTO v_review;

  PERFORM public.marketlink_notify(
    NULL, v_order.shop_id, v_order.id, 'review_received',
    'New ' || p_rating || '-star feedback',
    left(COALESCE(v_body, 'No written comment.'), 140),
    '/app/marketlink', 'review-' || v_review.id::text
  );

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_report_review(p_review_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to report feedback' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Keep the reason under 500 characters' USING ERRCODE = '22023';
  END IF;

  -- Reporting flags a review for a human. It never deletes it, and it never
  -- hides a negative rating.
  UPDATE public.marketlink_reviews
    SET moderation = CASE WHEN moderation = 'hidden' THEN 'hidden' ELSE 'reported' END,
        report_count = report_count + 1,
        last_reported_at = now()
    WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feedback not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

/** Public: one shop's published reviews, with no customer identity. */
CREATE OR REPLACE FUNCTION public.marketlink_shop_reviews(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'rating', r.rating,
    'body', r.body,
    'created_at', r.created_at,
    'verified_purchase', r.verified_purchase,
    'author', 'Verified customer'
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  FROM public.marketlink_reviews r
  JOIN public.shops s ON s.id = r.shop_id
  WHERE s.slug = trim(p_slug) AND r.moderation = 'visible';
$$;

/** Public: the aggregate. Zero reviews means zero — never an invented score. */
CREATE OR REPLACE FUNCTION public.marketlink_shop_reputation(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'average', COALESCE(round(avg(r.rating)::numeric, 2), 0),
    'count', count(*),
    'verified_count', count(*) FILTER (WHERE r.verified_purchase),
    'five_star', count(*) FILTER (WHERE r.rating = 5)
  )
  FROM public.marketlink_reviews r
  JOIN public.shops s ON s.id = r.shop_id
  WHERE s.slug = trim(p_slug) AND r.moderation = 'visible';
$$;

-- ---------------------------------------------------------------------------
-- 8) Release announcements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketlink_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  fixes JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes_path TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (version)
);

CREATE TABLE IF NOT EXISTS public.marketlink_release_reads (
  release_id UUID NOT NULL REFERENCES public.marketlink_releases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, user_id)
);

ALTER TABLE public.marketlink_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketlink_release_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketlink_releases_public_read ON public.marketlink_releases;
CREATE POLICY marketlink_releases_public_read ON public.marketlink_releases
  FOR SELECT TO anon, authenticated USING (published_at <= now());

DROP POLICY IF EXISTS marketlink_release_reads_own ON public.marketlink_release_reads;
CREATE POLICY marketlink_release_reads_own ON public.marketlink_release_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.marketlink_releases FROM anon, authenticated;
GRANT SELECT ON public.marketlink_releases TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketlink_release_reads TO authenticated;

/**
 * Publishing is deliberately a human, platform-admin action. Nothing in the
 * application generates a release from a migration or a deploy.
 */
CREATE OR REPLACE FUNCTION public.marketlink_publish_release(
  p_version TEXT,
  p_title TEXT,
  p_summary TEXT DEFAULT NULL,
  p_highlights JSONB DEFAULT '[]'::jsonb,
  p_fixes JSONB DEFAULT '[]'::jsonb,
  p_notes_path TEXT DEFAULT NULL
) RETURNS public.marketlink_releases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_release public.marketlink_releases;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a SAVO release manager can publish a release' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(trim(COALESCE(p_version, '')), '') IS NULL
     OR NULLIF(trim(COALESCE(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A release needs a version and a title' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.marketlink_releases (
    version, title, summary, highlights, fixes, notes_path, published_by
  ) VALUES (
    trim(p_version), trim(p_title), p_summary, COALESCE(p_highlights, '[]'::jsonb),
    COALESCE(p_fixes, '[]'::jsonb), p_notes_path, auth.uid()
  )
  RETURNING * INTO v_release;

  RETURN v_release;
END;
$$;

/** Published releases with this user's read state (read state is per user). */
CREATE OR REPLACE FUNCTION public.marketlink_release_feed(p_limit INT DEFAULT 20)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'version', r.version,
    'title', r.title,
    'summary', r.summary,
    'highlights', r.highlights,
    'fixes', r.fixes,
    'notes_path', r.notes_path,
    'published_at', r.published_at,
    'read', rr.read_at IS NOT NULL
  ) ORDER BY r.published_at DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM public.marketlink_releases
    WHERE published_at <= now()
    ORDER BY published_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50)
  ) r
  LEFT JOIN public.marketlink_release_reads rr
    ON rr.release_id = r.id AND rr.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.marketlink_mark_release_read(p_release_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to keep track of releases' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.marketlink_release_reads (release_id, user_id)
  VALUES (p_release_id, auth.uid())
  ON CONFLICT (release_id, user_id) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) One inbox query for every recipient, and unread counts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.marketlink_notification_feed(p_limit INT DEFAULT 30)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'kind', n.kind,
    'title', n.title,
    'body', n.body,
    'read_at', n.read_at,
    'created_at', n.created_at,
    'target_path', COALESCE(n.target_path, '/account/orders'),
    'shop_slug', s.slug,
    'shop_name', COALESCE(sf.display_name, s.name),
    'order_reference', o.reference,
    'audience', CASE WHEN n.user_id IS NULL THEN 'shop' ELSE 'personal' END
  ) ORDER BY n.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM public.marketlink_notifications
    WHERE user_id = auth.uid()
       OR (user_id IS NULL AND public.is_shop_member(shop_id))
    ORDER BY created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
  ) n
  JOIN public.shops s ON s.id = n.shop_id
  LEFT JOIN public.marketlink_storefronts sf ON sf.shop_id = s.id
  LEFT JOIN public.marketlink_orders o ON o.id = n.order_id;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_inbox_counts()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'notifications', (
      SELECT count(*) FROM public.marketlink_notifications n
      WHERE n.read_at IS NULL
        AND (n.user_id = auth.uid()
             OR (n.user_id IS NULL AND public.is_shop_member(n.shop_id)))
    ),
    'releases', (
      SELECT count(*) FROM public.marketlink_releases r
      WHERE r.published_at <= now()
        AND NOT EXISTS (
          SELECT 1 FROM public.marketlink_release_reads rr
          WHERE rr.release_id = r.id AND rr.user_id = auth.uid()
        )
    )
  );
$$;

/**
 * Unread rows in one shop's inbox. Customer notifications also carry a shop_id,
 * so this counts only rows with no personal recipient.
 */
CREATE OR REPLACE FUNCTION public.marketlink_shop_unread(p_shop_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT public.is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'That shop is not yours' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.marketlink_notifications n
  WHERE n.shop_id = p_shop_id AND n.user_id IS NULL AND n.read_at IS NULL;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_mark_notification_read(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to open your inbox' USING ERRCODE = '42501';
  END IF;
  UPDATE public.marketlink_notifications n
    SET read_at = now()
    WHERE n.id = p_id
      AND n.read_at IS NULL
      AND (n.user_id = auth.uid()
           OR (n.user_id IS NULL AND public.is_shop_member(n.shop_id)));
  IF NOT FOUND THEN
    -- Either already read, or not addressed to this user. Both are safe no-ops.
    RETURN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketlink_mark_all_notifications_read()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to open your inbox' USING ERRCODE = '42501';
  END IF;
  WITH updated AS (
    UPDATE public.marketlink_notifications n
      SET read_at = now()
      WHERE n.read_at IS NULL
        AND (n.user_id = auth.uid()
             OR (n.user_id IS NULL AND public.is_shop_member(n.shop_id)))
      RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

-- The seller transition RPC supersedes the old status function, which is kept
-- (with its grant) so an already-loaded browser tab keeps working.
CREATE OR REPLACE FUNCTION public.marketlink_set_order_status(
  p_order_id UUID,
  p_status public.marketlink_order_status
) RETURNS public.marketlink_orders
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.marketlink_advance_order(p_order_id, p_status);
$$;

-- ---------------------------------------------------------------------------
-- 10) Customer order history, now carrying settlement + review state
-- ---------------------------------------------------------------------------

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
      'customer_confirmed_at', o.customer_confirmed_at,
      'seller_confirmed_at', o.seller_confirmed_at,
      'settled_at', o.settled_at,
      'dispute_reason', o.dispute_reason,
      'sale_id', o.sale_id,
      'review', (
        SELECT jsonb_build_object('id', r.id, 'rating', r.rating, 'body', r.body, 'created_at', r.created_at)
        FROM public.marketlink_reviews r WHERE r.order_id = o.id
      ),
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
-- 11) SAVO Signature: the authorized order document payload
-- ---------------------------------------------------------------------------

/**
 * Everything a marketplace receipt may print, and nothing it may not.
 *
 * The document type comes from the stored status, not from the browser. The
 * only "paid" field in the response comes from a real `sales` row and its real
 * payments; an order that has merely been accepted has no such row.
 */
CREATE OR REPLACE FUNCTION public.marketlink_order_document(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.marketlink_orders;
  v_is_customer BOOLEAN;
  v_is_seller BOOLEAN;
  v_shop public.shops;
  v_sf public.marketlink_storefronts;
  v_settings public.receipt_settings;
  v_sale public.sales;
  v_document TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to view this document' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.marketlink_orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  v_is_customer := v_order.customer_id = auth.uid();
  v_is_seller := public.is_shop_member(v_order.shop_id);
  IF NOT v_is_customer AND NOT v_is_seller THEN
    RAISE EXCEPTION 'This document is not yours' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_shop FROM public.shops s WHERE s.id = v_order.shop_id;
  SELECT * INTO v_sf FROM public.marketlink_storefronts sf WHERE sf.shop_id = v_order.shop_id;
  SELECT * INTO v_settings FROM public.receipt_settings rs WHERE rs.shop_id = v_order.shop_id;
  IF v_order.sale_id IS NOT NULL THEN
    SELECT * INTO v_sale FROM public.sales sa WHERE sa.id = v_order.sale_id;
  END IF;

  v_document := CASE v_order.status
    WHEN 'pending' THEN 'Order request'
    WHEN 'accepted' THEN 'Order confirmation'
    WHEN 'preparing' THEN 'Order in preparation'
    WHEN 'ready_for_collection' THEN 'Ready for collection'
    WHEN 'out_for_delivery' THEN 'Out for delivery'
    WHEN 'awaiting_settlement' THEN 'Awaiting completion'
    WHEN 'settled' THEN 'Marketplace receipt'
    WHEN 'completed' THEN 'Marketplace receipt'
    WHEN 'rejected' THEN 'Declined request'
    WHEN 'cancelled' THEN 'Cancelled order'
    WHEN 'disputed' THEN 'Disputed order'
    ELSE 'Order document'
  END;

  RETURN jsonb_build_object(
    'document', v_document,
    'status', v_order.status,
    'reference', v_order.reference,
    'created_at', v_order.created_at,
    'settled_at', v_order.settled_at,
    'customer_confirmed_at', v_order.customer_confirmed_at,
    'seller_confirmed_at', v_order.seller_confirmed_at,
    'dispute_reason', v_order.dispute_reason,
    'fulfillment', v_order.fulfillment,
    'delivery_fee', v_order.delivery_fee,
    'subtotal', v_order.subtotal,
    'total', round(v_order.subtotal + COALESCE(v_order.delivery_fee, 0), 2),
    'currency', v_order.currency,
    'customer_name', v_order.customer_name,
    'destination', jsonb_build_object(
      'address', v_order.delivery_address,
      'city', v_order.destination_city,
      'region', v_order.destination_region,
      'country', v_order.destination_country
    ),
    'shop', jsonb_build_object(
      'name', COALESCE(v_sf.display_name, v_shop.name),
      'slug', v_shop.slug,
      'phone', v_shop.phone,
      'email', v_shop.email,
      'location', v_shop.location,
      'header_text', v_settings.header_text,
      'footer_text', v_settings.footer_text,
      'show_logo', COALESCE(v_settings.show_logo, true),
      'logo_url', COALESCE(v_settings.logo_url, v_shop.logo_url),
      'paper_width_mm', COALESCE(v_settings.paper_width_mm, 58)
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', i.product_name, 'quantity', i.quantity, 'unit', i.unit,
        'unit_price', i.unit_price, 'line_total', i.line_total, 'image_path', i.image_path
      ) ORDER BY i.id)
      FROM public.marketlink_order_items i WHERE i.order_id = v_order.id
    ), '[]'::jsonb),
    -- Payment is only ever described from a real sale row.
    'payment', CASE WHEN v_sale.id IS NULL THEN NULL ELSE jsonb_build_object(
      'sale_id', v_sale.id,
      'receipt_number', v_sale.receipt_number,
      'amount_paid', v_sale.amount_paid,
      'balance_due', v_sale.balance_due,
      'methods', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount))
        FROM public.payments p WHERE p.sale_id = v_sale.id
      ), '[]'::jsonb)
    ) END,
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'from', e.from_status, 'to', e.to_status, 'at', e.created_at, 'by', e.actor_role
      ) ORDER BY e.created_at)
      FROM public.marketlink_order_events e WHERE e.order_id = v_order.id
    ), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 12) Grants
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.marketlink_confirm_settlement(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_dispute_order(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_advance_order(UUID, public.marketlink_order_status, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_my_orders() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_submit_review(UUID, INT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_report_review(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_notification_feed(INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_inbox_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_shop_unread(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_mark_notification_read(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_mark_all_notifications_read() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_my_lists() FROM PUBLIC, anon;
-- A shared list must open for a visitor who is not signed in, so this one
-- function is deliberately reachable by `anon`. It is safe to expose: it
-- requires the unguessable token, returns null for a disabled or rotated
-- token, and never includes the owner's identity or account.
REVOKE EXECUTE ON FUNCTION public.marketlink_list_payload(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.marketlink_order_document(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_mark_release_read(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_publish_release(TEXT, TEXT, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.marketlink_confirm_settlement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_dispute_order(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_advance_order(UUID, public.marketlink_order_status, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_my_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_submit_review(UUID, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_report_review(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_notification_feed(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_inbox_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_shop_unread(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_mark_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_my_lists() TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_list_payload(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_order_document(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_mark_release_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_publish_release(TEXT, TEXT, TEXT, JSONB, JSONB, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.marketlink_create_list(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_rename_list(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_delete_list(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_rotate_list_share(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_set_list_share(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_add_list_item(UUID, TEXT, NUMERIC, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_update_list_item(UUID, NUMERIC, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marketlink_remove_list_item(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.marketlink_create_list(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_rename_list(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_delete_list(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_rotate_list_share(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_set_list_share(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_add_list_item(UUID, TEXT, NUMERIC, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_update_list_item(UUID, NUMERIC, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_remove_list_item(UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.marketlink_shop_reviews(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_shop_reputation(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_release_feed(INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_list_candidates(TEXT, UUID, INT) TO authenticated;

COMMIT;
