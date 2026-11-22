-- ===========================================================================
-- SAVO Market — open sellers and mutual settlement
-- ===========================================================================
--
-- Two additions, both additive:
--
--   1. Open seller onboarding. Until now a seller had to run a shop: a name,
--      a business type, a location, a staff code, a dashboard. Someone who
--      simply has something to sell could not join. `marketlink_become_seller`
--      gives that person a personal stall in one step — a shop row (so every
--      existing order, listing, stock and review rule keeps working unchanged),
--      their owner membership, a published storefront, and a seller profile
--      that records how they joined.
--
--   2. Settlement from either side, at any working stage. Both parties must
--      still confirm before an order becomes a sale. The change is that the
--      buyer no longer has to wait for the seller to press "mark done": either
--      confirmation moves a live order into `awaiting_settlement`, and the
--      other party is told to confirm. The second confirmation closes the sale
--      exactly as before — one sale row, one stock movement, no claim of
--      payment.
--
-- Nothing here reads or rewrites existing rows, and every function keeps its
-- SECURITY DEFINER + explicit grant pattern.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Seller profiles — how an account joined the market as a seller
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketlink_sellers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL UNIQUE REFERENCES public.shops(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 80),
  about TEXT CHECK (about IS NULL OR length(about) <= 600),
  contact_phone TEXT CHECK (contact_phone IS NULL OR length(contact_phone) <= 40),
  city TEXT CHECK (city IS NULL OR length(city) <= 80),
  -- 'open' means a personal stall created from the onboarding form. A shop that
  -- later went through the full shop setup keeps the same row; the value only
  -- records where the stall came from.
  origin TEXT NOT NULL DEFAULT 'open' CHECK (origin IN ('open', 'shop')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketlink_sellers_shop_idx
  ON public.marketlink_sellers (shop_id);

DROP TRIGGER IF EXISTS marketlink_sellers_updated_at ON public.marketlink_sellers;
CREATE TRIGGER marketlink_sellers_updated_at
  BEFORE UPDATE ON public.marketlink_sellers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.marketlink_sellers ENABLE ROW LEVEL SECURITY;

-- A seller sees their own profile. Nobody inserts directly: the columns are
-- written by the SECURITY DEFINER function below, so a browser cannot point a
-- profile at somebody else's shop.
DROP POLICY IF EXISTS marketlink_sellers_own ON public.marketlink_sellers;
CREATE POLICY marketlink_sellers_own ON public.marketlink_sellers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.marketlink_sellers FROM anon, authenticated;
GRANT SELECT ON public.marketlink_sellers TO authenticated;

/** A URL-safe stall slug, derived from the public name with a random suffix. */
CREATE OR REPLACE FUNCTION public.marketlink_open_seller_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base TEXT;
  v_candidate TEXT;
  v_attempt INT := 0;
BEGIN
  v_base := lower(regexp_replace(trim(COALESCE(p_name, '')), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(BOTH '-' FROM v_base);
  v_base := left(v_base, 40);
  IF v_base IS NULL OR length(v_base) < 3 THEN
    v_base := 'seller';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := left(v_base, 54) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
    IF length(v_candidate) < 3 THEN
      v_candidate := 'seller-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    END IF;
    IF public.marketlink_slug_reserved(v_candidate) THEN
      v_candidate := v_candidate || '-' || v_attempt;
    END IF;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.shops s WHERE s.slug = v_candidate);
    IF v_attempt >= 8 THEN
      RAISE EXCEPTION 'Could not reserve a public address for this stall. Try a different name.'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.marketlink_open_seller_slug(TEXT) FROM PUBLIC, anon, authenticated;

/**
 * Open a personal stall for the signed-in account.
 *
 * Idempotent: calling it twice returns the stall that already exists instead of
 * creating a second one. The stall is a real shop — the same row the rest of
 * SAVO uses — so listings, orders, stock movements, settlement, reviews and RLS
 * all behave exactly as they do for an established shop. What changes is only
 * how much the seller had to fill in: a name, and optionally a phone, a town and
 * a short description.
 */
CREATE OR REPLACE FUNCTION public.marketlink_become_seller(
  p_display_name TEXT,
  p_contact_phone TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_about TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'KES'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_name TEXT := NULLIF(trim(COALESCE(p_display_name, '')), '');
  v_phone TEXT := NULLIF(trim(COALESCE(p_contact_phone, '')), '');
  v_city TEXT := NULLIF(trim(COALESCE(p_city, '')), '');
  v_about TEXT := NULLIF(trim(COALESCE(p_about, '')), '');
  v_currency TEXT := upper(NULLIF(trim(COALESCE(p_currency, '')), ''));
  v_existing public.marketlink_sellers;
  v_shop public.shops;
  v_slug TEXT;
  v_attempt INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to start selling' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Give your stall a public name of 2 to 80 characters' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND length(v_phone) > 40 THEN
    RAISE EXCEPTION 'Keep the phone number under 40 characters' USING ERRCODE = '22023';
  END IF;
  IF v_city IS NOT NULL AND length(v_city) > 80 THEN
    RAISE EXCEPTION 'Keep the town under 80 characters' USING ERRCODE = '22023';
  END IF;
  IF v_about IS NOT NULL AND length(v_about) > 600 THEN
    RAISE EXCEPTION 'Keep the description under 600 characters' USING ERRCODE = '22023';
  END IF;
  IF v_currency IS NULL OR v_currency !~ '^[A-Z]{3}$' THEN
    v_currency := 'KES';
  END IF;

  SELECT * INTO v_existing FROM public.marketlink_sellers s WHERE s.user_id = v_uid;
  IF FOUND THEN
    SELECT * INTO v_shop FROM public.shops s WHERE s.id = v_existing.shop_id;
    RETURN jsonb_build_object(
      'shop_id', v_existing.shop_id,
      'slug', v_shop.slug,
      'display_name', v_existing.display_name,
      'currency', COALESCE(v_shop.currency, v_currency),
      'created', false
    );
  END IF;

  -- Insert the shop. The `on_shop_created` trigger enrols this account as the
  -- owner and seeds receipt settings, exactly as a full shop setup does.
  LOOP
    v_attempt := v_attempt + 1;
    v_slug := public.marketlink_open_seller_slug(v_name);
    BEGIN
      INSERT INTO public.shops (owner_id, name, slug, currency, phone, city, is_active)
      VALUES (v_uid, v_name, v_slug, v_currency, v_phone, v_city, true)
      RETURNING * INTO v_shop;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE EXCEPTION 'Could not reserve a public address for this stall. Try again.'
          USING ERRCODE = 'P0001';
      END IF;
    END;
  END LOOP;

  -- The public window. Published immediately: the point of open onboarding is
  -- that the seller can put something on the market the same minute they join.
  INSERT INTO public.marketlink_storefronts (
    shop_id, display_name, description, public_phone, city, is_published, published_at
  ) VALUES (
    v_shop.id, v_name, v_about, v_phone, v_city, true, now()
  )
  ON CONFLICT (shop_id) DO UPDATE
    SET display_name = EXCLUDED.display_name
    WHERE public.marketlink_storefronts.display_name IS NULL;

  INSERT INTO public.marketlink_sellers (
    user_id, shop_id, display_name, about, contact_phone, city, origin
  ) VALUES (
    v_uid, v_shop.id, v_name, v_about, v_phone, v_city, 'open'
  );

  INSERT INTO public.audit_log (shop_id, actor_id, action, entity_type, entity_id, summary, metadata)
  VALUES (
    v_shop.id, v_uid, 'marketlink.seller_opened', 'shop', v_shop.id::text,
    'Open seller stall created',
    jsonb_build_object('slug', v_shop.slug, 'display_name', v_name)
  );

  RETURN jsonb_build_object(
    'shop_id', v_shop.id,
    'slug', v_shop.slug,
    'display_name', v_name,
    'currency', v_shop.currency,
    'created', true
  );
END;
$$;

/** The signed-in account's seller profile, or null when they have not joined. */
CREATE OR REPLACE FUNCTION public.marketlink_my_seller()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'shop_id', s.shop_id,
    'slug', sh.slug,
    'display_name', s.display_name,
    'about', s.about,
    'contact_phone', s.contact_phone,
    'city', s.city,
    'origin', s.origin,
    'created_at', s.created_at
  )
  FROM public.marketlink_sellers s
  JOIN public.shops sh ON sh.id = s.shop_id
  WHERE s.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.marketlink_become_seller(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marketlink_my_seller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketlink_become_seller(TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketlink_my_seller() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Settlement from either side, at any working stage
-- ---------------------------------------------------------------------------

/**
 * The order transition guard, rewritten so a live order can settle.
 *
 * The rule that matters is unchanged and is now stated once instead of being
 * repeated in every branch: reaching `settled` requires both confirmation
 * timestamps, and only `marketlink_confirm_settlement` writes those. Every
 * other transition below is the same lifecycle as before.
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
      -- 'completed' stays reachable from 'accepted' for compatibility with a
      -- browser tab loaded before this migration; it is a terminal state and
      -- records no sale, so it cannot fake settlement.
      WHEN 'accepted' THEN NEW.status IN (
        'preparing', 'ready_for_collection', 'out_for_delivery',
        'awaiting_settlement', 'cancelled', 'completed', 'settled')
      WHEN 'preparing' THEN NEW.status IN (
        'ready_for_collection', 'out_for_delivery', 'awaiting_settlement', 'cancelled', 'settled')
      WHEN 'ready_for_collection' THEN NEW.status IN ('awaiting_settlement', 'cancelled', 'settled')
      WHEN 'out_for_delivery' THEN NEW.status IN ('awaiting_settlement', 'cancelled', 'settled')
      WHEN 'awaiting_settlement' THEN NEW.status IN ('disputed', 'cancelled', 'settled')
      WHEN 'disputed' THEN NEW.status IN ('awaiting_settlement', 'cancelled', 'settled')
      ELSE false
    END;
    IF NOT allowed THEN
      RAISE EXCEPTION 'An order cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;

    IF NEW.status = 'settled'
       AND (NEW.customer_confirmed_at IS NULL OR NEW.seller_confirmed_at IS NULL) THEN
      RAISE EXCEPTION 'Both the buyer and the seller must confirm before an order is settled'
        USING ERRCODE = '42501';
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

/**
 * One party confirms completion.
 *
 * - Either the buyer or the seller may confirm as soon as the order is accepted.
 * - The first confirmation moves a live order into `awaiting_settlement` and
 *   tells the other party. It does not finish anything on its own.
 * - The second confirmation creates exactly one marketplace sale and one stock
 *   movement, and marks the order settled.
 * - Calling again as the same party is a no-op that returns the current state.
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
  v_first_confirmation BOOLEAN := false;
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

  -- A request the shop has not answered yet is not a completed order. Every
  -- accepted-but-unfinished stage is.
  IF v_order.status NOT IN (
    'accepted', 'preparing', 'ready_for_collection', 'out_for_delivery',
    'awaiting_settlement', 'disputed'
  ) THEN
    RAISE EXCEPTION 'This order is not ready to be settled yet' USING ERRCODE = '23514';
  END IF;

  IF v_is_customer AND v_order.customer_confirmed_at IS NULL THEN
    UPDATE public.marketlink_orders SET customer_confirmed_at = now() WHERE id = p_order_id;
    v_first_confirmation := true;
  ELSIF v_is_seller AND v_order.seller_confirmed_at IS NULL THEN
    UPDATE public.marketlink_orders SET seller_confirmed_at = now() WHERE id = p_order_id;
    v_first_confirmation := true;
  END IF;

  SELECT * INTO v_order FROM public.marketlink_orders o WHERE o.id = p_order_id FOR UPDATE;
  v_both := v_order.customer_confirmed_at IS NOT NULL AND v_order.seller_confirmed_at IS NOT NULL;

  -- A buyer who confirms straight after receiving the goods should not be stuck
  -- waiting for the seller to press "mark done": their confirmation lifts the
  -- order into the settlement stage, which is what the seller's screen watches.
  IF NOT v_both
     AND v_order.status IN ('accepted', 'preparing', 'ready_for_collection', 'out_for_delivery') THEN
    UPDATE public.marketlink_orders SET status = 'awaiting_settlement' WHERE id = p_order_id;
    SELECT * INTO v_order FROM public.marketlink_orders o WHERE o.id = p_order_id FOR UPDATE;
  END IF;

  -- Tell the other party their confirmation landed.
  IF v_is_customer THEN
    PERFORM public.marketlink_notify(
      NULL, v_order.shop_id, v_order.id, 'settlement_confirmed',
      'The buyer confirmed order ' || v_order.reference,
      'Confirm on your side and the sale is complete.',
      '/app/marketlink', 'settle-seller-' || v_order.id::text
    );
  ELSE
    PERFORM public.marketlink_notify(
      v_order.customer_id, v_order.shop_id, v_order.id, 'settlement_confirmed',
      'The seller confirmed order ' || v_order.reference,
      'Confirm on your side and the sale is complete.',
      '/account/orders', 'settle-customer-' || v_order.id::text
    );
  END IF;

  IF v_both AND v_order.status <> 'settled' THEN
    -- Re-check stock before recognising revenue: if inventory moved since the
    -- order was placed, the order stays open rather than overselling. Products
    -- are locked in id order so two settlements can never deadlock each other.
    FOR v_item IN
      SELECT i.product_id, i.quantity, i.unit_price, i.line_total, i.product_name
      FROM public.marketlink_order_items i
      WHERE i.order_id = v_order.id
      ORDER BY i.product_id
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
        ORDER BY i.product_id
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
    'sale_id', v_order.sale_id, 'duplicate', false,
    'first_confirmation', v_first_confirmation
  );
END;
$$;

REVOKE ALL ON FUNCTION public.marketlink_confirm_settlement(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marketlink_confirm_settlement(UUID) TO authenticated;

COMMIT;
