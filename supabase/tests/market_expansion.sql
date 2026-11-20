-- ============================================================================
-- Market expansion verification — one transaction, ROLLED BACK.
--
-- Covers the order lifecycle, mutual settlement, exactly-once sale recording,
-- review eligibility, notification recipients, shared-circle isolation and the
-- release-publishing guard. Every fixture lives and dies inside the
-- transaction, so production keeps no test order, sale or review.
--
-- Run through the management query endpoint or psql. ROLLBACK is part of the
-- test and makes it safe to repeat.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE mx_results (name TEXT, ok BOOLEAN, detail TEXT) ON COMMIT DROP;

DO $$
DECLARE
  v_owner UUID;
  v_customer UUID;
  v_shop UUID;
  v_product UUID;
  v_listing UUID;
  v_order UUID;
  v_sale UUID;
  v_list UUID;
  v_token UUID;
  v_res JSONB;
  v_qty NUMERIC;
  v_n INT;
  v_text TEXT;
  v_sale_count INT;
  v_move_count INT;
  v_feed JSONB;
BEGIN
  SELECT id INTO v_owner FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_customer FROM auth.users WHERE id <> v_owner ORDER BY created_at LIMIT 1;
  IF v_owner IS NULL OR v_customer IS NULL THEN
    INSERT INTO mx_results VALUES ('two real accounts exist for the test', false, 'need at least 2 auth users');
    RETURN;
  END IF;
  INSERT INTO mx_results VALUES ('two real accounts exist for the test', true, '');

  INSERT INTO public.shops (owner_id, name, slug, currency)
  VALUES (v_owner, 'Expansion Test Shop', 'mx-test-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 'KES')
  RETURNING id INTO v_shop;

  INSERT INTO public.products (shop_id, name, unit, buying_price, selling_price, quantity, low_stock_threshold)
  VALUES (v_shop, 'Expansion Test Rice', 'bag', 700, 900, 5, 1)
  RETURNING id INTO v_product;

  INSERT INTO public.marketlink_storefronts (
    shop_id, display_name, public_phone, country, region, is_published, published_at
  ) VALUES (v_shop, 'Expansion Test Shop', '+254700000001', 'Kenya', 'Garissa', true, now());

  INSERT INTO public.marketlink_listings (
    shop_id, product_id, public_price, image_path, category, is_published, published_at
  ) VALUES (v_shop, v_product, 950, v_shop::text || '/rice.jpg', 'Groceries', true, now())
  RETURNING id INTO v_listing;

  INSERT INTO public.marketlink_orders (
    shop_id, customer_id, reference, client_token, customer_name, customer_phone,
    fulfillment, subtotal, delivery_fee, currency, status
  ) VALUES (
    v_shop, v_customer, 'MX-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    gen_random_uuid(), 'Expansion Buyer', '+254700000002', 'pickup', 1900, NULL, 'KES', 'pending'
  ) RETURNING id INTO v_order;

  INSERT INTO public.marketlink_order_items (
    order_id, shop_id, listing_id, product_id, product_name, unit, quantity, unit_price, line_total
  ) VALUES (v_order, v_shop, v_listing, v_product, 'Expansion Test Rice', 'bag', 2, 950, 1900);

  -- 1. The seller accepts.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.marketlink_advance_order(v_order, 'accepted');
  RESET ROLE;
  SELECT status::text INTO v_text FROM public.marketlink_orders WHERE id = v_order;
  INSERT INTO mx_results VALUES ('seller can accept a pending request', v_text = 'accepted', v_text);

  -- 2. Fulfilment-aware states: a collection order is never out for delivery.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_advance_order(v_order, 'out_for_delivery');
    RESET ROLE;
    INSERT INTO mx_results VALUES ('a collection order cannot go out for delivery', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mx_results VALUES ('a collection order cannot go out for delivery', true, SQLERRM);
  END;

  -- 3. The customer is not an actor on the seller's lifecycle.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_customer)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_advance_order(v_order, 'preparing');
    RESET ROLE;
    INSERT INTO mx_results VALUES ('a customer cannot move the seller''s order', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mx_results VALUES ('a customer cannot move the seller''s order', true, SQLERRM);
  END;

  -- 4. A direct update cannot jump straight to settled.
  BEGIN
    UPDATE public.marketlink_orders SET status = 'settled' WHERE id = v_order;
    INSERT INTO mx_results VALUES ('an order cannot jump straight to settled', false, 'update succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO mx_results VALUES ('an order cannot jump straight to settled', true, SQLERRM);
  END;

  -- 5. Walk the real path to awaiting completion.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.marketlink_advance_order(v_order, 'preparing');
  PERFORM public.marketlink_advance_order(v_order, 'ready_for_collection');
  PERFORM public.marketlink_advance_order(v_order, 'awaiting_settlement');
  RESET ROLE;
  SELECT status::text INTO v_text FROM public.marketlink_orders WHERE id = v_order;
  INSERT INTO mx_results VALUES ('the full pickup path reaches awaiting completion', v_text = 'awaiting_settlement', v_text);

  -- 6. First confirmation alone changes nothing financial.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_customer)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.marketlink_confirm_settlement(v_order);
  RESET ROLE;
  SELECT count(*) INTO v_sale_count FROM public.sales WHERE marketplace_order_id = v_order;
  INSERT INTO mx_results VALUES (
    'one confirmation does not settle the order',
    v_res->>'status' = 'awaiting_settlement' AND v_res->>'customer_confirmed_at' IS NOT NULL AND v_sale_count = 0,
    v_res->>'status'
  );
  INSERT INTO mx_results VALUES ('one confirmation records no sale', v_sale_count = 0, v_sale_count::text);

  -- 7. The second valid confirmation settles and records exactly one sale.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.marketlink_confirm_settlement(v_order);
  RESET ROLE;
  SELECT status::text, sale_id INTO v_text, v_sale FROM public.marketlink_orders WHERE id = v_order;
  INSERT INTO mx_results VALUES ('both confirmations settle the order', v_text = 'settled' AND v_sale IS NOT NULL, v_text);

  SELECT count(*), max(channel), max(amount_paid), max(total_amount)
    INTO v_sale_count, v_text, v_qty, v_n
    FROM public.sales WHERE marketplace_order_id = v_order;
  INSERT INTO mx_results VALUES ('the settled order becomes one marketplace sale', v_sale_count = 1, v_sale_count::text);
  INSERT INTO mx_results VALUES ('the sale is marked as marketplace, not POS', v_text = 'marketplace', v_text);
  INSERT INTO mx_results VALUES (
    'mutual settlement does not claim money was paid',
    v_qty = 0 AND v_n = 1900, v_qty::text || ' paid / ' || v_n::text || ' total'
  );

  -- 8. Stock moved once, through the existing ledger.
  SELECT quantity INTO v_qty FROM public.products WHERE id = v_product;
  INSERT INTO mx_results VALUES ('settlement deducts the ordered stock once', v_qty = 3, v_qty::text);
  SELECT count(*) INTO v_move_count FROM public.inventory_movements
    WHERE product_id = v_product AND movement_type = 'sale';
  INSERT INTO mx_results VALUES ('exactly one sale movement is written', v_move_count = 1, v_move_count::text);

  -- 9. Repeating the confirmation changes nothing.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.marketlink_confirm_settlement(v_order);
  RESET ROLE;
  SELECT count(*) INTO v_sale_count FROM public.sales WHERE marketplace_order_id = v_order;
  SELECT quantity INTO v_qty FROM public.products WHERE id = v_product;
  INSERT INTO mx_results VALUES (
    'a repeated confirmation is idempotent',
    v_sale_count = 1 AND v_qty = 3, v_sale_count::text || ' sale / ' || v_qty::text || ' left'
  );

  -- 10. A second sale for the same order is refused by the database.
  BEGIN
    INSERT INTO public.sales (shop_id, receipt_number, subtotal, total_amount, channel, marketplace_order_id)
    VALUES (v_shop, 'MX-DUP-' || substr(gen_random_uuid()::text, 1, 6), 1900, 1900, 'marketplace', v_order);
    INSERT INTO mx_results VALUES ('a duplicate marketplace sale is refused', false, 'insert succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO mx_results VALUES ('a duplicate marketplace sale is refused', true, SQLERRM);
  END;

  -- 11. Reviews: only the buyer, only once, only after settlement.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_submit_review(v_order, 5, 'Owner trying to review.');
    RESET ROLE;
    INSERT INTO mx_results VALUES ('the seller cannot review their own order', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mx_results VALUES ('the seller cannot review their own order', true, SQLERRM);
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_customer)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.marketlink_submit_review(v_order, 4, 'Arrived as described.');
  RESET ROLE;
  SELECT count(*) INTO v_n FROM public.marketlink_reviews WHERE order_id = v_order;
  INSERT INTO mx_results VALUES ('the buyer can review a settled order', v_n = 1, v_n::text);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_customer)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_submit_review(v_order, 5, 'Second review.');
    RESET ROLE;
    INSERT INTO mx_results VALUES ('a second review for the same order is refused', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mx_results VALUES ('a second review for the same order is refused', true, SQLERRM);
  END;

  v_res := public.marketlink_shop_reputation((SELECT slug FROM public.shops WHERE id = v_shop));
  INSERT INTO mx_results VALUES (
    'reputation is calculated from the real review',
    (v_res->>'count')::int = 1 AND (v_res->>'average')::numeric = 4
      AND (v_res->>'verified_count')::int = 1,
    v_res::text
  );

  -- 12. Notification recipients stay separate.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_customer)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_feed := public.marketlink_notification_feed(50);
  RESET ROLE;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_feed) e
    WHERE e->>'audience' = 'shop';
  INSERT INTO mx_results VALUES ('a customer never sees shop-inbox notifications', v_n = 0, v_n::text);
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_feed) e
    WHERE e->>'kind' = 'order_settled';
  INSERT INTO mx_results VALUES ('the customer receives the settlement notification', v_n = 1, v_n::text);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_feed := public.marketlink_notification_feed(50);
  RESET ROLE;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_feed) e
    WHERE e->>'audience' = 'personal';
  INSERT INTO mx_results VALUES ('a shop owner never sees a customer''s personal rows', v_n = 0, v_n::text);

  -- 13. Circles: owner payload vs shared token payload.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_customer)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_list := public.marketlink_create_list('Expansion Test List');
  PERFORM public.marketlink_add_list_item(v_list, 'Expansion Test Rice', 2, v_listing, NULL, NULL);
  v_res := public.marketlink_list_payload(v_list, NULL);
  SELECT share_token INTO v_token FROM public.marketlink_lists WHERE id = v_list;
  RESET ROLE;

  INSERT INTO mx_results VALUES (
    'the owner sees the list with its real matching product',
    (v_res->>'is_owner')::boolean AND jsonb_array_length(v_res->'items') = 1
      AND jsonb_array_length(v_res->'items'->0->'candidates') >= 1,
    jsonb_array_length(v_res->'items')::text
  );
  INSERT INTO mx_results VALUES (
    'the owner payload carries the share token',
    v_res->>'share_token' = v_token::text, COALESCE(v_res->>'share_token', 'null')
  );

  PERFORM set_config('request.jwt.claims', NULL, true);
  EXECUTE 'SET LOCAL ROLE anon';
  v_res := public.marketlink_list_payload(NULL, v_token);
  RESET ROLE;
  INSERT INTO mx_results VALUES (
    'a signed-out visitor can open a shared list',
    jsonb_array_length(v_res->'items') = 1 AND (v_res->>'is_owner')::boolean = false,
    jsonb_array_length(v_res->'items')::text
  );
  INSERT INTO mx_results VALUES (
    'a shared list never reveals the share token',
    v_res->>'share_token' IS NULL, COALESCE(v_res->>'share_token', 'null')
  );

  BEGIN
    PERFORM set_config('request.jwt.claims', NULL, true);
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM public.marketlink_list_payload(NULL, gen_random_uuid());
    RESET ROLE;
    INSERT INTO mx_results VALUES ('an unknown share token is refused', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mx_results VALUES ('an unknown share token is refused', true, SQLERRM);
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_list_payload(v_list, NULL);
    RESET ROLE;
    INSERT INTO mx_results VALUES ('another account cannot open the list by id', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mx_results VALUES ('another account cannot open the list by id', true, SQLERRM);
  END;

  -- 14. Release publishing is a platform-admin action.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_publish_release('0.0.0-test', 'Should not publish', NULL);
    RESET ROLE;
    INSERT INTO mx_results VALUES ('an ordinary account cannot publish a release', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mx_results VALUES ('an ordinary account cannot publish a release', true, SQLERRM);
  END;

  -- 15. The transition history was recorded by the database itself.
  SELECT count(*) INTO v_n FROM public.marketlink_order_events WHERE order_id = v_order;
  INSERT INTO mx_results VALUES ('the order keeps a transition history', v_n >= 4, v_n::text);

  -- 16. Nothing was created outside this transaction's fixtures.
  INSERT INTO mx_results VALUES ('no sale is left with a zero-value total', NOT EXISTS (
    SELECT 1 FROM public.sales WHERE marketplace_order_id = v_order AND total_amount <= 0
  ), '');
END $$;

SELECT name, ok, detail FROM mx_results ORDER BY ok, name;

ROLLBACK;
