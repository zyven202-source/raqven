-- SAVO 2.0 — offline idempotency for create_sale.
--
-- The offline outbox persists a sale on the device and retries it across
-- connectivity gaps, so the server must treat a retry as the same operation
-- it already applied. The device generates one UUID per checkout attempt
-- (p_client_tx_id); the first attempt records it on the sale row through a
-- unique partial index, and any later attempt with the same id returns the
-- original outcome instead of recording a second sale.
--
-- Migration safety: additive and backward compatible.
--   * No table is created, dropped or rewritten — one nullable column and
--     one partial unique index on sales.
--   * p_client_tx_id defaults to NULL, so clients that predate the outbox
--     behave exactly as before.
--   * The 8-argument function is dropped only after its 9-argument
--     replacement exists, so there is no window without create_sale.
--   * Old clients keep calling with the same named arguments; the default
--     fills the ninth parameter.
-- Rollback: drop the column and index, then re-apply the original
-- create_sale from 20260928000000_ravqen_sales_engine.sql.

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_tx_id UUID;

COMMENT ON COLUMN public.sales.client_tx_id IS
  'Client-generated identity of an offline outbox sale attempt; a retry with the same id returns the original sale instead of recording a duplicate.';

CREATE UNIQUE INDEX IF NOT EXISTS sales_client_tx_id_key
  ON public.sales (client_tx_id)
  WHERE client_tx_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_sale(
  p_shop_id           UUID,
  p_items             JSONB,
  p_payment_method    public.payment_method,
  p_amount_tendered   NUMERIC DEFAULT 0,
  p_discount_amount   NUMERIC DEFAULT 0,
  p_debtor_name       TEXT DEFAULT NULL,
  p_debtor_phone       TEXT DEFAULT NULL,
  p_note               TEXT DEFAULT NULL,
  -- The offline outbox's identity for this sale attempt: one UUID per
  -- checkout, generated on the device. NULL for every caller that predates
  -- it, so old clients keep working untouched.
  p_client_tx_id       UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user         UUID := auth.uid();
  v_item         JSONB;
  v_product      public.products;
  v_qty          NUMERIC;
  v_unit_price   NUMERIC;
  v_line_disc    NUMERIC;
  v_line_total   NUMERIC;
  v_items_total  NUMERIC := 0;
  v_total        NUMERIC;
  v_applied      NUMERIC;
  v_balance      NUMERIC;
  v_status       public.sale_status;
  v_change       NUMERIC := 0;
  v_debtor_id    UUID;
  v_sale_id      UUID;
  v_receipt      TEXT;
  v_name         TEXT;
  v_existing     public.sales;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A sale needs at least one item' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_discount_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: a retry of an operation the server already applied must
  -- return the original outcome, not record a second sale. Checked before
  -- the receipt number is borrowed, so a replayed sale does not burn a
  -- receipt number either. The unique partial index on client_tx_id is the
  -- backstop for two devices racing the same id: the loser gets 23505,
  -- nothing partial commits, and its retry lands here.
  IF p_client_tx_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.sales
     WHERE client_tx_id = p_client_tx_id
       AND shop_id = p_shop_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'sale_id',        v_existing.id,
        'receipt_number', v_existing.receipt_number,
        'subtotal',       v_existing.subtotal,
        'discount',       v_existing.discount_amount,
        'total',          v_existing.total_amount,
        'amount_paid',    v_existing.amount_paid,
        'balance_due',    v_existing.balance_due,
        'change_due',     GREATEST(v_existing.amount_paid - v_existing.total_amount, 0),
        'status',         v_existing.status,
        'debtor_id',      v_existing.debtor_id,
        'deduplicated',   true
      );
    END IF;
  END IF;

  -- Borrow the receipt number before anything else so a failure rolls it back
  -- together with the rest of the transaction.
  v_receipt := public.next_receipt_number(p_shop_id);

  -- Pass 1: lock each product, validate stock, price the lines.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::numeric;
    v_line_disc := COALESCE((v_item->>'discount_amount')::numeric, 0);
    v_unit_price := COALESCE((v_item->>'unit_price')::numeric, NULL);

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Every line needs a quantity above zero' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_product
      FROM public.products
     WHERE id = (v_item->>'product_id')::uuid
       AND shop_id = p_shop_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found in this shop' USING ERRCODE = 'P0002';
    END IF;

    IF v_product.quantity < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for %: % on hand, % requested',
        v_product.name, v_product.quantity, v_qty USING ERRCODE = 'P0001';
    END IF;

    v_unit_price := COALESCE(v_unit_price, v_product.selling_price);
    v_line_total := ROUND(v_qty * v_unit_price - v_line_disc, 2);
    IF v_line_total < 0 THEN
      RAISE EXCEPTION 'A line discount cannot exceed the line value' USING ERRCODE = '22023';
    END IF;

    v_items_total := v_items_total + v_line_total;
  END LOOP;

  IF COALESCE(p_discount_amount, 0) > v_items_total THEN
    RAISE EXCEPTION 'The discount cannot exceed the sale total' USING ERRCODE = '22023';
  END IF;

  v_total := ROUND(v_items_total - COALESCE(p_discount_amount, 0), 2);

  -- Payment rules, per method.
  IF p_payment_method = 'credit' THEN
    v_name := NULLIF(trim(COALESCE(p_debtor_name, '')), '');
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'A credit sale needs the debtor''s name' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(p_amount_tendered, 0) < 0 OR COALESCE(p_amount_tendered, 0) > v_total THEN
      RAISE EXCEPTION 'The amount paid now cannot exceed the sale total' USING ERRCODE = '22023';
    END IF;
    v_applied := ROUND(COALESCE(p_amount_tendered, 0), 2);
  ELSIF p_payment_method = 'cash' THEN
    IF COALESCE(p_amount_tendered, 0) < v_total THEN
      RAISE EXCEPTION 'Cash received (%) is less than the total (%)', p_amount_tendered, v_total
        USING ERRCODE = '22023';
    END IF;
    v_applied := v_total;
    v_change  := ROUND(COALESCE(p_amount_tendered, 0) - v_total, 2);
  ELSE
    v_applied := v_total;
  END IF;

  v_balance := ROUND(v_total - v_applied, 2);

  v_status := CASE
    WHEN v_balance <= 0 THEN 'completed'::public.sale_status
    WHEN v_applied > 0  THEN 'partial'::public.sale_status
    ELSE 'pending'::public.sale_status
  END;

  -- The debtor is created/updated before the sale so the FK is satisfied and
  -- the balance moves inside the same transaction as the sale itself.
  IF p_payment_method = 'credit' THEN
    IF p_debtor_phone IS NOT NULL AND trim(p_debtor_phone) <> '' THEN
      INSERT INTO public.debtors (shop_id, name, phone, total_owed)
           VALUES (p_shop_id, v_name, trim(p_debtor_phone), v_balance)
      ON CONFLICT (shop_id, phone) DO UPDATE
              SET total_owed = public.debtors.total_owed + v_balance,
                  name       = COALESCE(NULLIF(trim(public.debtors.name), ''), EXCLUDED.name),
                  updated_at = now()
        RETURNING id INTO v_debtor_id;
    ELSE
      SELECT id INTO v_debtor_id
        FROM public.debtors
       WHERE shop_id = p_shop_id AND lower(name) = lower(v_name)
       LIMIT 1;

      IF v_debtor_id IS NULL THEN
        INSERT INTO public.debtors (shop_id, name, total_owed)
             VALUES (p_shop_id, v_name, v_balance)
          RETURNING id INTO v_debtor_id;
      ELSE
        UPDATE public.debtors
           SET total_owed = total_owed + v_balance, updated_at = now()
         WHERE id = v_debtor_id;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.sales (
    shop_id, receipt_number, debtor_id, customer_name, customer_phone,
    subtotal, discount_amount, total_amount, amount_paid, balance_due,
    status, note, user_id, client_tx_id
  ) VALUES (
    p_shop_id, v_receipt, v_debtor_id, NULLIF(trim(COALESCE(p_debtor_name, '')), ''),
    NULLIF(trim(COALESCE(p_debtor_phone, '')), ''),
    v_items_total, COALESCE(p_discount_amount, 0), v_total, v_applied, v_balance,
    v_status, NULLIF(trim(COALESCE(p_note, '')), ''), v_user, p_client_tx_id
  ) RETURNING id INTO v_sale_id;

  -- Pass 2: the lines, the stock ledger and the stock itself.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::numeric;
    v_line_disc := COALESCE((v_item->>'discount_amount')::numeric, 0);

    SELECT * INTO v_product
      FROM public.products
     WHERE id = (v_item->>'product_id')::uuid AND shop_id = p_shop_id;

    v_unit_price := COALESCE((v_item->>'unit_price')::numeric, v_product.selling_price);
    v_line_total := ROUND(v_qty * v_unit_price - v_line_disc, 2);

    INSERT INTO public.sale_items (
      shop_id, sale_id, product_id, product_name, quantity,
      unit_price, buying_price, discount_amount, subtotal
    ) VALUES (
      p_shop_id, v_sale_id, v_product.id, v_product.name, v_qty,
      v_unit_price, v_product.buying_price, v_line_disc, v_line_total
    );

    UPDATE public.products
       SET quantity = quantity - v_qty
     WHERE id = v_product.id
    RETURNING * INTO v_product;

    INSERT INTO public.inventory_movements (
      shop_id, product_id, movement_type, quantity, unit_cost, balance_after,
      reference_type, reference_id, notes, user_id
    ) VALUES (
      p_shop_id, v_product.id, 'sale', -v_qty, v_product.buying_price, v_product.quantity,
      'sale', v_sale_id, 'Sold on ' || v_receipt, v_user
    );
  END LOOP;

  IF v_applied > 0 THEN
    INSERT INTO public.payments (shop_id, sale_id, method, amount, reference, note, user_id)
    VALUES (
      p_shop_id, v_sale_id, p_payment_method, v_applied, v_receipt,
      CASE WHEN p_payment_method = 'credit' THEN 'Paid at sale time for ' || v_receipt ELSE NULL END,
      v_user
    );
  END IF;

  RETURN jsonb_build_object(
    'sale_id',        v_sale_id,
    'receipt_number', v_receipt,
    'subtotal',       v_items_total,
    'discount',       COALESCE(p_discount_amount, 0),
    'total',          v_total,
    'amount_paid',    v_applied,
    'balance_due',    v_balance,
    'change_due',     v_change,
    'status',         v_status,
    'debtor_id',      v_debtor_id
  );
END;
$$;

-- The old 8-argument overload is dropped AFTER the new one exists, so
-- create_sale is never unavailable mid-migration. PostgREST then resolves
-- both the old callers (all named args, defaults fill the ninth) and the
-- new outbox (all nine) against this single signature.
DROP FUNCTION IF EXISTS public.create_sale(UUID, JSONB, public.payment_method, NUMERIC, NUMERIC, TEXT, TEXT, TEXT);

REVOKE ALL ON FUNCTION public.create_sale(UUID, JSONB, public.payment_method, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(UUID, JSONB, public.payment_method, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID) TO authenticated;
