-- ============================================================================
-- Marketlink verification — runs inside one transaction and ROLLS BACK.
--
-- Every fixture (two shops, a product, a listing, a delivery zone, an order) is
-- created and destroyed in the same transaction, so production never keeps a
-- test order or a fake product. The last SELECT returns one row per check.
--
-- Run through the Supabase management query endpoint or psql. The final
-- ROLLBACK is part of the test: it is what makes the run safe to repeat.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE mk_results (name TEXT, ok BOOLEAN, detail TEXT) ON COMMIT DROP;

DO $$
DECLARE
  v_owner UUID;
  v_other UUID;
  v_shop UUID;
  v_shop2 UUID;
  v_product UUID;
  v_listing UUID;
  v_zone UUID;
  v_order UUID;
  v_ref TEXT;
  v_before NUMERIC;
  v_after NUMERIC;
  v_n INT;
  v_res JSONB;
  v_token UUID := gen_random_uuid();
  v_items JSONB;
  v_slug TEXT;
  v_zone_mismatch UUID;
  v_err TEXT;
  v_listing_old UUID;
  v_listing_hidden UUID;
  v_product2 UUID;
  v_flag BOOLEAN;
BEGIN
  SELECT id INTO v_owner FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_other FROM auth.users WHERE id <> v_owner ORDER BY created_at LIMIT 1;
  IF v_owner IS NULL OR v_other IS NULL THEN
    INSERT INTO mk_results VALUES ('two real accounts exist for the test', false, 'need at least 2 auth users');
    RETURN;
  END IF;
  INSERT INTO mk_results VALUES ('two real accounts exist for the test', true, '');

  v_slug := 'mk-test-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.shops (owner_id, name, slug, currency)
  VALUES (v_owner, 'Marketlink Test Shop', v_slug, 'KES')
  RETURNING id INTO v_shop;

  INSERT INTO public.shops (owner_id, name, slug, currency)
  VALUES (v_other, 'Marketlink Other Shop', v_slug || '-b', 'KES')
  RETURNING id INTO v_shop2;

  INSERT INTO public.products (shop_id, name, unit, buying_price, selling_price, quantity, low_stock_threshold)
  VALUES (v_shop, 'Test Maize Flour', 'packet', 80, 100, 5, 2)
  RETURNING id INTO v_product;

  INSERT INTO public.marketlink_storefronts (
    shop_id, display_name, description, public_phone, country, region, is_published, published_at
  ) VALUES (
    v_shop, 'Marketlink Test Shop', 'A test storefront.', '+254700000000', 'Kenya', 'Garissa', true, now()
  );

  INSERT INTO public.marketlink_listings (
    shop_id, product_id, description, public_price, image_path, category, is_published, published_at
  ) VALUES (
    v_shop, v_product, 'A 2kg packet of maize flour.', 120,
    v_shop::text || '/test-photo.jpg', 'Groceries', true, now()
  ) RETURNING id INTO v_listing;

  INSERT INTO public.marketlink_delivery_zones (shop_id, kind, country, region, fee)
  VALUES (v_shop, 'local', 'Kenya', 'Garissa', 150)
  RETURNING id INTO v_zone;

  INSERT INTO public.marketlink_delivery_zones (shop_id, kind, country, fee)
  VALUES (v_shop, 'nationwide', 'Kenya', NULL);

  INSERT INTO public.marketlink_delivery_zones (shop_id, kind, country, fee)
  VALUES (v_shop, 'worldwide', NULL, NULL);

  -- ---------------------------------------------------------------- public read
  v_res := public.marketlink_feed(NULL, NULL, NULL, NULL, NULL, v_slug, NULL, NULL, NULL, NULL, 24, 0);
  INSERT INTO mk_results
  VALUES ('published listing appears in the public feed', jsonb_array_length(v_res->'items') = 1, v_res::text);
  INSERT INTO mk_results
  VALUES ('public payload has no cost price', NOT (v_res::text LIKE '%buying_price%' OR v_res::text LIKE '%cost_price%'), '');
  INSERT INTO mk_results
  VALUES ('public payload uses the public price', (v_res->'items'->0->>'price')::numeric = 120, v_res->'items'->0->>'price');
  INSERT INTO mk_results
  VALUES ('public payload exposes a stock state, not the ledger', (v_res->'items'->0->>'stock_state') = 'in' AND (v_res->'items'->0 ? 'max_quantity'), v_res->'items'->0->>'stock_state');

  v_res := public.marketlink_feed('maize', NULL, NULL, NULL, NULL, v_slug, NULL, NULL, NULL, NULL, 24, 0);
  INSERT INTO mk_results VALUES ('search finds by product name', jsonb_array_length(v_res->'items') = 1, '');
  v_res := public.marketlink_feed('nothing-matches-this', NULL, NULL, NULL, NULL, v_slug, NULL, NULL, NULL, NULL, 24, 0);
  INSERT INTO mk_results VALUES ('search returns nothing for a non-match', jsonb_array_length(v_res->'items') = 0, '');

  v_res := public.marketlink_shop(v_slug);
  INSERT INTO mk_results VALUES ('unpublished shop lookup is empty for the other shop', public.marketlink_shop(v_slug || '-b') IS NULL, '');

  -- --------------------------------------------------------------- validation
  BEGIN
    INSERT INTO public.marketlink_listings (shop_id, product_id, image_path, is_published)
    VALUES (v_shop, v_product, '', true);
    INSERT INTO mk_results VALUES ('a listing cannot be saved without an image', false, 'insert succeeded');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO mk_results VALUES ('a listing cannot be saved without an image', true, 'database refused');
  END;

  BEGIN
    INSERT INTO public.marketlink_listings (shop_id, product_id, image_path, is_published)
    VALUES (v_shop2, v_product, v_shop2::text || '/x.jpg', true);
    INSERT INTO mk_results VALUES ('a listing cannot borrow another shop''s product', false, 'insert succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO mk_results VALUES ('a listing cannot borrow another shop''s product', true, 'database refused');
  END;

  -- ------------------------------------------------------------------- anon
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    SELECT count(*) INTO v_n FROM public.marketlink_orders;
    RESET ROLE;
    INSERT INTO mk_results VALUES ('anon cannot read order rows', v_n = 0, v_n::text);
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('anon cannot read order rows', true, 'permission denied');
  END;

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    SELECT count(*) INTO v_n FROM public.marketlink_customer_profiles;
    RESET ROLE;
    INSERT INTO mk_results VALUES ('anon cannot read customer profiles', v_n = 0, v_n::text);
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('anon cannot read customer profiles', true, 'permission denied');
  END;

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.marketlink_submit_order(v_slug, gen_random_uuid(), 'Anon', '+254700000001', NULL, 'phone', 'pickup', NULL, NULL, NULL, NULL, NULL, NULL, jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)));
    RESET ROLE;
    INSERT INTO mk_results VALUES ('anon cannot submit an order', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('anon cannot submit an order', true, SQLERRM);
  END;

  INSERT INTO mk_results
  VALUES ('anon has no execute grant on the order RPC',
    NOT has_function_privilege('anon', 'public.marketlink_submit_order(text,uuid,text,text,text,text,text,uuid,text,text,text,text,text,jsonb)', 'EXECUTE'), '');

  -- ------------------------------------------------------- customer orders
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 2));

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_res := public.marketlink_submit_order(
      v_slug, v_token, 'Test Customer', '+254711111111', NULL, 'phone',
      'delivery', v_zone, 'Kenya', 'Garissa', 'Garissa', 'Town centre shop', 'Please call first', v_items
    );
    v_order := (v_res->>'order_id')::uuid;
    v_ref := v_res->>'reference';
    RESET ROLE;
    INSERT INTO mk_results VALUES ('a signed-in customer can submit an order', v_order IS NOT NULL, v_res::text);
    INSERT INTO mk_results VALUES ('the order gets a readable reference', v_ref LIKE 'ML-%', v_ref);
    INSERT INTO mk_results VALUES ('the server snapshots the public price', (v_res->>'subtotal')::numeric = 240, v_res->>'subtotal');
    INSERT INTO mk_results VALUES ('the delivery fee comes from the zone', (v_res->>'delivery_fee')::numeric = 150, v_res->>'delivery_fee');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('a signed-in customer can submit an order', false, SQLERRM);
  END;

  SELECT count(*) INTO v_n FROM public.marketlink_order_items WHERE order_id = v_order;
  INSERT INTO mk_results VALUES ('order lines are persisted against the order', v_n = 1, v_n::text);

  SELECT count(*) INTO v_n FROM public.marketlink_notifications
    WHERE shop_id = v_shop AND order_id = v_order AND read_at IS NULL;
  INSERT INTO mk_results VALUES ('the seller gets a real in-app notification', v_n = 1, v_n::text);

  SELECT quantity INTO v_before FROM public.products WHERE id = v_product;
  INSERT INTO mk_results VALUES ('submitting a request does not deduct stock', v_before = 5, v_before::text);

  -- duplicate token
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_res := public.marketlink_submit_order(
      v_slug, v_token, 'Test Customer', '+254711111111', NULL, 'phone',
      'delivery', v_zone, 'Kenya', 'Garissa', 'Garissa', 'Town centre shop', 'Please call first', v_items
    );
    RESET ROLE;
    INSERT INTO mk_results VALUES ('the same submission token cannot create a second order',
      (v_res->>'duplicate')::boolean AND (v_res->>'reference') = v_ref, v_res::text);
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('the same submission token cannot create a second order', false, SQLERRM);
  END;

  SELECT count(*) INTO v_n FROM public.marketlink_orders WHERE shop_id = v_shop;
  INSERT INTO mk_results VALUES ('only one order exists for the token', v_n = 1, v_n::text);

  -- over-stock
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_submit_order(
      v_slug, gen_random_uuid(), 'Test Customer', '+254711111111', NULL, 'phone',
      'pickup', NULL, NULL, NULL, NULL, NULL, NULL,
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 99))
    );
    RESET ROLE;
    INSERT INTO mk_results VALUES ('a request above the shelf quantity is rejected', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('a request above the shelf quantity is rejected', true, SQLERRM);
  END;

  -- delivery mismatch
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_submit_order(
      v_slug, gen_random_uuid(), 'Test Customer', '+254711111112', NULL, 'phone',
      'delivery', v_zone, 'Kenya', 'Mombasa', 'Mombasa', 'A street address', NULL,
      jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1))
    );
    RESET ROLE;
    INSERT INTO mk_results VALUES ('delivery outside the zone is rejected', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('delivery outside the zone is rejected', true, SQLERRM);
  END;

  -- ------------------------------------------------------------- isolation
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.marketlink_orders WHERE shop_id = v_shop;
  RESET ROLE;
  INSERT INTO mk_results VALUES ('the customer sees their own order', v_n = 1, v_n::text);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.marketlink_orders WHERE shop_id = v_shop;
  RESET ROLE;
  INSERT INTO mk_results VALUES ('the seller sees the order in their inbox', v_n = 1, v_n::text);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.marketlink_orders WHERE shop_id = v_shop2;
  RESET ROLE;
  INSERT INTO mk_results VALUES ('a seller cannot read another shop''s orders', v_n = 0, v_n::text);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.marketlink_order_items WHERE shop_id = v_shop2;
  RESET ROLE;
  INSERT INTO mk_results VALUES ('a seller cannot read another shop''s order lines', v_n = 0, v_n::text);

  -- ---------------------------------------------------------- status paths
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_set_order_status(v_order, 'completed');
    RESET ROLE;
    INSERT INTO mk_results VALUES ('pending cannot jump straight to completed', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('pending cannot jump straight to completed', true, SQLERRM);
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_set_order_status(v_order, 'accepted');
    RESET ROLE;
    INSERT INTO mk_results VALUES ('a customer cannot change their own order status', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('a customer cannot change their own order status', true, SQLERRM);
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_set_order_status(v_order, 'accepted');
    PERFORM public.marketlink_set_order_status(v_order, 'completed');
    RESET ROLE;
    SELECT count(*) INTO v_n FROM public.marketlink_orders WHERE id = v_order AND status = 'completed';
    INSERT INTO mk_results VALUES ('the seller can accept and then complete', v_n = 1, '');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('the seller can accept and then complete', false, SQLERRM);
  END;

  SELECT count(*) INTO v_n FROM public.audit_log
    WHERE entity_id = v_order::text AND action = 'marketlink.order_status';
  INSERT INTO mk_results VALUES ('status changes are auditable', v_n >= 2, v_n::text);

  -- -------------------------------------------------------------- slugs
  BEGIN
    INSERT INTO mk_results VALUES ('a taken slug is not available', NOT public.marketlink_slug_available(v_slug), '');
    INSERT INTO mk_results VALUES ('a reserved slug is not available', NOT public.marketlink_slug_available('app'), '');
    INSERT INTO mk_results VALUES ('a readable new slug is available', public.marketlink_slug_available(v_slug || '-new'), '');
  EXCEPTION WHEN others THEN
    INSERT INTO mk_results VALUES ('slug checks run', false, SQLERRM);
  END;

  -- -------------------------------------------------------------- sort modes
  INSERT INTO public.products (shop_id, name, unit, buying_price, selling_price, quantity)
  VALUES (v_shop, 'Test Rice', 'kg', 90, 130, 0)
  RETURNING id INTO v_product2;

  INSERT INTO public.marketlink_listings (
    shop_id, product_id, image_path, category, is_published, published_at
  ) VALUES (
    v_shop, v_product2, v_shop::text || '/test-rice.jpg', 'Groceries', true, now() - interval '2 days'
  ) RETURNING id INTO v_listing_old;

  v_res := public.marketlink_feed(NULL, NULL, NULL, NULL, NULL, v_slug, NULL, NULL, NULL, NULL, 24, 0, 'newest');
  INSERT INTO mk_results VALUES (
    'new arrivals puts the most recently published product first',
    (v_res->'items'->0->>'id')::uuid = v_listing, v_res->'items'->0->>'id'
  );
  INSERT INTO mk_results VALUES (
    'sorting by newest still returns every published product',
    jsonb_array_length(v_res->'items') = 2, jsonb_array_length(v_res->'items')::text
  );

  v_res := public.marketlink_feed(NULL, NULL, NULL, NULL, NULL, v_slug, NULL, NULL, NULL, NULL, 24, 0, 'nearby');
  INSERT INTO mk_results VALUES (
    'nearby sorting invents no distance without coordinates',
    (v_res->'items'->0->'distance_km') = 'null'::jsonb, v_res->'items'->0->>'distance_km'
  );
  INSERT INTO mk_results VALUES (
    'recommended sorting returns buyable products first',
    (public.marketlink_feed(NULL, NULL, NULL, NULL, TRUE, v_slug, NULL, NULL, NULL, NULL, 24, 0)->'items'->0->>'stock_state') <> 'out', ''
  );

  -- -------------------------------------------------------------- favourites
  INSERT INTO mk_results VALUES (
    'anon has no execute grant on the save RPC',
    NOT has_function_privilege('anon', 'public.marketlink_toggle_favourite(uuid)', 'EXECUTE'), ''
  );
  INSERT INTO mk_results VALUES (
    'anon cannot read saved products',
    NOT has_table_privilege('anon', 'public.marketlink_favourites', 'SELECT'), ''
  );

  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.marketlink_toggle_favourite(v_listing);
    RESET ROLE;
    INSERT INTO mk_results VALUES ('anon cannot save a product', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('anon cannot save a product', true, SQLERRM);
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_flag := public.marketlink_toggle_favourite(v_listing);
    RESET ROLE;
    INSERT INTO mk_results VALUES ('a signed-in customer can save a public product', v_flag, v_flag::text);
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('a signed-in customer can save a public product', false, SQLERRM);
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.marketlink_favourites;
  RESET ROLE;
  INSERT INTO mk_results VALUES ('the customer reads back their own saved row', v_n = 1, v_n::text);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.marketlink_my_favourites();
  RESET ROLE;
  INSERT INTO mk_results VALUES (
    'saved products return the same public card payload',
    jsonb_array_length(v_res) = 1 AND (v_res->0->>'id')::uuid = v_listing AND (v_res->0->>'price')::numeric = 120,
    v_res::text
  );

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_flag := public.marketlink_toggle_favourite(v_listing);
  RESET ROLE;
  INSERT INTO mk_results VALUES ('toggling the same product removes it', NOT v_flag, v_flag::text);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.marketlink_toggle_favourite(v_listing);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.marketlink_favourites;
  RESET ROLE;
  INSERT INTO mk_results VALUES ('another account cannot read the customer''s saved rows', v_n = 0, v_n::text);

  UPDATE public.marketlink_listings SET is_published = false WHERE id = v_listing_old;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.marketlink_toggle_favourite(v_listing_old);
    RESET ROLE;
    INSERT INTO mk_results VALUES ('a hidden product cannot be saved', false, 'rpc succeeded');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    INSERT INTO mk_results VALUES ('a hidden product cannot be saved', true, SQLERRM);
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.marketlink_my_favourites();
  RESET ROLE;
  INSERT INTO mk_results VALUES (
    'a saved product disappears from the saved list when it is unpublished',
    jsonb_array_length(v_res) = 1 AND (v_res->0->>'id')::uuid = v_listing, jsonb_array_length(v_res)::text
  );

  SELECT quantity INTO v_after FROM public.products WHERE id = v_product;
  INSERT INTO mk_results VALUES ('stock is still unchanged after every test', v_after = 5, v_after::text);
END $$;

SELECT name, ok, detail FROM mk_results ORDER BY ok, name;

ROLLBACK;
