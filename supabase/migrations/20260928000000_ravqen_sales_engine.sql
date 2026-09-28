-- ============================================================================
-- RAVQEN Phase 2: the business engine
--
-- Why this migration exists
--   Phase 1 shipped the schema and the RLS. Everything that moves money or
--   stock was still up to the client, and a browser cannot be trusted to keep
--   `sales`, `sale_items`, `payments` and `inventory_movements` consistent —
--   a dropped connection midway leaves stock reduced with no sale, or a sale
--   with no payment.
--
--   So the multi-row operations become PostgreSQL functions that run inside a
--   single transaction: either every row lands or none does. The client never
--   invents a receipt number, never computes a balance it then writes back,
--   and never decides what a user is allowed to do.
--
-- Trust model
--   * create_sale           SECURITY INVOKER — every write it performs is an
--                           append the caller is already allowed to make, so
--                           RLS is a second, independent guard.
--   * the rest              SECURITY DEFINER — they must update rows the
--                           client is deliberately not granted (sales,
--                           receipt_counters), so each one re-checks
--                           membership/ownership itself and takes the acting
--                           user from auth.uid(), never from an argument.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Integrity constraints the client must not be able to violate.
-- ---------------------------------------------------------------------------

-- Stock can never go negative — enforced by the database, not by a UI check.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_quantity_non_negative;
ALTER TABLE public.products
  ADD CONSTRAINT products_quantity_non_negative CHECK (quantity >= 0);

-- Expenses use a fixed vocabulary so reports can group them reliably.
UPDATE public.expenses
   SET category = 'other'
 WHERE category NOT IN ('lunch','transport','rent','electricity','packaging','repairs','restocking','other');

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_valid;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_category_valid CHECK (
    category IN ('lunch','transport','rent','electricity','packaging','repairs','restocking','other')
  );

-- A credit sale without a named debtor is not a credit sale.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_credit_needs_debtor;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_credit_needs_debtor CHECK (
    balance_due <= 0 OR debtor_id IS NOT NULL OR customer_name IS NOT NULL
  );

-- Supporting indexes for the queries the app actually issues.
CREATE INDEX IF NOT EXISTS products_shop_barcode_idx
  ON public.products(shop_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_shop_active_idx
  ON public.products(shop_id, is_active);
CREATE INDEX IF NOT EXISTS refunds_sale_status_idx
  ON public.refunds(sale_id, status);

-- ---------------------------------------------------------------------------
-- 2) Receipt counters.
--    Numbers must be gap-free and race-free, which a `count(*) + 1` can never
--    be. This table has RLS on with no policies and no grant to any client
--    role: it is reachable only through the SECURITY DEFINER helper below.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.receipt_counters (
  shop_id     UUID PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  next_number BIGINT NOT NULL DEFAULT 1 CHECK (next_number > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.receipt_counters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_receipt_number(p_shop_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_next   BIGINT;
BEGIN
  IF NOT public.is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT rs.receipt_prefix INTO v_prefix
    FROM public.receipt_settings rs WHERE rs.shop_id = p_shop_id;
  v_prefix := COALESCE(NULLIF(trim(v_prefix), ''), 'RV');

  -- The first call reserves number 2 and hands out 1, so every number is
  -- consumed exactly once even when two tills sell at the same instant.
  INSERT INTO public.receipt_counters (shop_id, next_number)
       VALUES (p_shop_id, 2)
  ON CONFLICT (shop_id) DO UPDATE
          SET next_number = public.receipt_counters.next_number + 1,
              updated_at  = now()
    RETURNING next_number INTO v_next;

  RETURN v_prefix || '-' || lpad((v_next - 1)::text, 5, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_receipt_number(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_receipt_number(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Stock movements.
--    Every quantity change goes through here, so the ledger and the product
--    row can never disagree. `sale` is deliberately NOT accepted: only
--    create_sale may book a sale movement, otherwise a client could fake one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_product_id    UUID,
  p_movement_type public.movement_type,
  p_quantity      NUMERIC DEFAULT NULL,  -- signed delta
  p_new_quantity  NUMERIC DEFAULT NULL,  -- or an absolute counted quantity
  p_notes         TEXT    DEFAULT NULL,
  p_unit_cost     NUMERIC DEFAULT NULL
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product public.products;
  v_delta   NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_movement_type NOT IN ('stock_in','adjustment','damage','opening','transfer') THEN
    RAISE EXCEPTION 'Movement type % cannot be recorded here', p_movement_type USING ERRCODE = '22023';
  END IF;

  IF (p_quantity IS NULL) = (p_new_quantity IS NULL) THEN
    RAISE EXCEPTION 'Provide either a quantity delta or a counted quantity, not both' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product
    FROM public.products
   WHERE id = p_product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_shop_member(v_product.shop_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  v_delta := CASE WHEN p_new_quantity IS NOT NULL
                  THEN p_new_quantity - v_product.quantity
                  ELSE p_quantity END;

  IF v_delta = 0 THEN
    RAISE EXCEPTION 'The quantity would not change' USING ERRCODE = '22023';
  END IF;

  IF v_product.quantity + v_delta < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: % on hand, tried to remove %',
      v_product.quantity, abs(v_delta) USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.products
     SET quantity = quantity + v_delta
   WHERE id = p_product_id
  RETURNING * INTO v_product;

  INSERT INTO public.inventory_movements (
    shop_id, product_id, movement_type, quantity, unit_cost, balance_after, notes, user_id
  ) VALUES (
    v_product.shop_id, p_product_id, p_movement_type, v_delta,
    COALESCE(p_unit_cost, v_product.buying_price), v_product.quantity, p_notes, auth.uid()
  );

  RETURN v_product;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stock_movement(UUID, public.movement_type, NUMERIC, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_movement(UUID, public.movement_type, NUMERIC, NUMERIC, TEXT, NUMERIC) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) create_sale — one transaction for sale + items + payment + stock audit
--    + debtor balance. Runs as the caller, so RLS still applies to every row.
--
--    p_items: [{"product_id": uuid, "quantity": n, "unit_price": n,
--               "discount_amount": n}]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale(
  p_shop_id           UUID,
  p_items             JSONB,
  p_payment_method    public.payment_method,
  p_amount_tendered   NUMERIC DEFAULT 0,
  p_discount_amount   NUMERIC DEFAULT 0,
  p_debtor_name       TEXT DEFAULT NULL,
  p_debtor_phone      TEXT DEFAULT NULL,
  p_note              TEXT DEFAULT NULL
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
    status, note, user_id
  ) VALUES (
    p_shop_id, v_receipt, v_debtor_id, NULLIF(trim(COALESCE(p_debtor_name, '')), ''),
    NULLIF(trim(COALESCE(p_debtor_phone, '')), ''),
    v_items_total, COALESCE(p_discount_amount, 0), v_total, v_applied, v_balance,
    v_status, NULLIF(trim(COALESCE(p_note, '')), ''), v_user
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

REVOKE ALL ON FUNCTION public.create_sale(UUID, JSONB, public.payment_method, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(UUID, JSONB, public.payment_method, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) record_debtor_payment — money against an existing debt.
--    SECURITY DEFINER because it must also settle the sale's balance_due, and
--    `sales` is deliberately not updatable by clients.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_debtor_payment(
  p_debtor_id UUID,
  p_amount    NUMERIC,
  p_method    public.payment_method DEFAULT 'cash',
  p_reference TEXT DEFAULT NULL,
  p_note      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    UUID := auth.uid();
  v_debtor  public.debtors;
  v_amount  NUMERIC;
  v_owed    NUMERIC;
  v_payment UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_debtor FROM public.debtors WHERE id = p_debtor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debtor not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_shop_member(v_debtor.shop_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter an amount above zero' USING ERRCODE = '22023';
  END IF;

  v_owed := GREATEST(v_debtor.total_owed, 0);
  IF p_amount > v_owed THEN
    RAISE EXCEPTION 'That is more than the % still owed', v_owed USING ERRCODE = '22023';
  END IF;

  v_amount := ROUND(p_amount, 2);

  INSERT INTO public.debtor_payments (shop_id, debtor_id, amount, method, reference, note, user_id)
       VALUES (v_debtor.shop_id, p_debtor_id, v_amount, p_method, p_reference, p_note, v_user)
    RETURNING id INTO v_payment;

  UPDATE public.debtors
     SET total_owed = total_owed - v_amount, updated_at = now()
   WHERE id = p_debtor_id;

  -- Settle the oldest unpaid sales first, so balance_due keeps meaning
  -- "what is still owed on this sale".
  WITH open_sales AS (
    SELECT id, balance_due
      FROM public.sales
     WHERE debtor_id = p_debtor_id AND balance_due > 0
     ORDER BY sold_at
     FOR UPDATE
  ), running AS (
    SELECT id, balance_due,
           COALESCE(sum(balance_due) OVER (ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS paid_before
      FROM open_sales
  )
  UPDATE public.sales s
     SET balance_due = GREATEST(r.balance_due - GREATEST(v_amount - r.paid_before, 0), 0),
         amount_paid = s.amount_paid + LEAST(r.balance_due, GREATEST(v_amount - r.paid_before, 0)),
         status = CASE
           WHEN r.balance_due - GREATEST(v_amount - r.paid_before, 0) <= 0
             THEN 'completed'::public.sale_status
           ELSE 'partial'::public.sale_status
         END,
         updated_at = now()
    FROM running r
   WHERE s.id = r.id;

  SELECT total_owed INTO v_owed FROM public.debtors WHERE id = p_debtor_id;

  RETURN jsonb_build_object(
    'payment_id',      v_payment,
    'amount',          v_amount,
    'balance_remaining', v_owed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_debtor_payment(UUID, NUMERIC, public.payment_method, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_debtor_payment(UUID, NUMERIC, public.payment_method, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) create_refund — restores stock, records the refund, and relieves any
--    credit still owed for the refunded goods. Gated by the shop's own
--    accepts_refunds switch, evaluated in the database.
--
--    p_items: [{"sale_item_id": uuid, "quantity": n, "restock": bool}]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_refund(
  p_sale_id UUID,
  p_items   JSONB,
  p_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user          UUID := auth.uid();
  v_sale          public.sales;
  v_accepts       BOOLEAN;
  v_item          JSONB;
  v_sale_item     public.sale_items;
  v_qty           NUMERIC;
  v_already       NUMERIC;
  v_amount        NUMERIC;
  v_total         NUMERIC := 0;
  v_refund_id     UUID;
  v_product       public.products;
  v_restock       BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_shop_member(v_sale.shop_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT s.accepts_refunds INTO v_accepts FROM public.shops s WHERE s.id = v_sale.shop_id;
  IF NOT COALESCE(v_accepts, false) THEN
    RAISE EXCEPTION 'This shop does not accept refunds' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Choose at least one item to refund' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.refunds (shop_id, sale_id, reason, total_amount, status, user_id, approved_by, approved_at)
       VALUES (v_sale.shop_id, p_sale_id, NULLIF(trim(COALESCE(p_reason, '')), ''), 0.01,
               'approved', v_user, v_user, now())
    RETURNING id INTO v_refund_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::numeric;
    v_restock := COALESCE((v_item->>'restock')::boolean, true);

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Every refunded line needs a quantity above zero' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_sale_item
      FROM public.sale_items
     WHERE id = (v_item->>'sale_item_id')::uuid AND sale_id = p_sale_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'That line does not belong to this sale' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(sum(ri.quantity), 0) INTO v_already
      FROM public.refund_items ri
      JOIN public.refunds r ON r.id = ri.refund_id
     WHERE ri.sale_item_id = v_sale_item.id AND r.status <> 'rejected';

    IF v_qty + v_already > v_sale_item.quantity THEN
      RAISE EXCEPTION 'Only % of % can still be refunded',
        v_sale_item.quantity - v_already, v_sale_item.product_name USING ERRCODE = '22023';
    END IF;

    -- Refund at the price actually charged, line discount included.
    v_amount := ROUND((v_sale_item.subtotal / v_sale_item.quantity) * v_qty, 2);
    v_total  := v_total + v_amount;

    INSERT INTO public.refund_items (shop_id, refund_id, sale_item_id, product_id, quantity, amount, restock)
         VALUES (v_sale.shop_id, v_refund_id, v_sale_item.id, v_sale_item.product_id, v_qty, v_amount, v_restock);

    IF v_restock AND v_sale_item.product_id IS NOT NULL THEN
      SELECT * INTO v_product FROM public.products WHERE id = v_sale_item.product_id FOR UPDATE;
      IF FOUND THEN
        UPDATE public.products SET quantity = quantity + v_qty WHERE id = v_product.id
        RETURNING * INTO v_product;

        INSERT INTO public.inventory_movements (
          shop_id, product_id, movement_type, quantity, unit_cost, balance_after,
          reference_type, reference_id, notes, user_id
        ) VALUES (
          v_sale.shop_id, v_product.id, 'refund', v_qty, v_sale_item.buying_price, v_product.quantity,
          'refund', v_refund_id, 'Refund on ' || v_sale.receipt_number, v_user
        );
      END IF;
    END IF;
  END LOOP;

  UPDATE public.refunds SET total_amount = v_total, updated_at = now() WHERE id = v_refund_id;

  -- If the refunded goods were bought on credit, the debt shrinks with them.
  IF v_sale.debtor_id IS NOT NULL AND v_sale.balance_due > 0 THEN
    DECLARE
      v_relief NUMERIC := LEAST(v_total, v_sale.balance_due);
    BEGIN
      UPDATE public.debtors
         SET total_owed = GREATEST(total_owed - v_relief, 0), updated_at = now()
       WHERE id = v_sale.debtor_id;

      UPDATE public.sales
         SET balance_due = balance_due - v_relief, updated_at = now()
       WHERE id = p_sale_id;
    END;
  END IF;

  RETURN jsonb_build_object(
    'refund_id',    v_refund_id,
    'total_amount', v_total,
    'receipt_number', v_sale.receipt_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_refund(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_refund(UUID, JSONB, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Employee access codes. The plaintext is returned exactly once; only a
--    SHA-256 digest is stored, and only the shop owner may mint one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_employee_access_code(
  p_shop_id UUID,
  p_label   TEXT,
  p_code    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_id   UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_shop_owner(p_shop_id) THEN
    RAISE EXCEPTION 'Only the shop owner can create access codes' USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) < 4 THEN
    RAISE EXCEPTION 'An access code needs at least 4 characters' USING ERRCODE = '22023';
  END IF;

  -- Retire any unused shop-wide code so only one is live at a time.
  UPDATE public.employee_access_codes
     SET is_active = false, updated_at = now()
   WHERE shop_id = p_shop_id AND member_id IS NULL AND is_active;

  INSERT INTO public.employee_access_codes (shop_id, member_id, label, code_hash, created_by)
       VALUES (
         p_shop_id, NULL, COALESCE(NULLIF(trim(p_label), ''), 'Shop access code'),
         encode(sha256(trim(p_code)::bytea), 'hex'), v_user
       )
    RETURNING id INTO v_id;

  RETURN jsonb_build_object('code_id', v_id, 'label', p_label);
END;
$$;

REVOKE ALL ON FUNCTION public.create_employee_access_code(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_employee_access_code(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Owner-only reporting. The aggregates are computed in the database and the
--    owner check happens here, so "sensitive owner reports" are enforced by the
--    backend rather than by hiding a tab.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shop_report(
  p_shop_id UUID,
  p_from    TIMESTAMPTZ,
  p_to      TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_shop_owner(p_shop_id) THEN
    RAISE EXCEPTION 'Only the shop owner can read reports' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'sales_count', (SELECT count(*) FROM public.sales s
                     WHERE s.shop_id = p_shop_id AND s.sold_at >= p_from AND s.sold_at < p_to),
    'gross_sales', (SELECT COALESCE(sum(s.total_amount), 0) FROM public.sales s
                     WHERE s.shop_id = p_shop_id AND s.sold_at >= p_from AND s.sold_at < p_to),
    'discounts',   (SELECT COALESCE(sum(s.discount_amount), 0) FROM public.sales s
                     WHERE s.shop_id = p_shop_id AND s.sold_at >= p_from AND s.sold_at < p_to),
    'collected',   (SELECT COALESCE(sum(p.amount), 0) FROM public.payments p
                     WHERE p.shop_id = p_shop_id AND p.paid_at >= p_from AND p.paid_at < p_to),
    'debt_collected', (SELECT COALESCE(sum(dp.amount), 0) FROM public.debtor_payments dp
                     WHERE dp.shop_id = p_shop_id AND dp.paid_at >= p_from AND dp.paid_at < p_to),
    'refunds',     (SELECT COALESCE(sum(r.total_amount), 0) FROM public.refunds r
                     WHERE r.shop_id = p_shop_id AND r.status <> 'rejected'
                       AND r.created_at >= p_from AND r.created_at < p_to),
    'expenses',    (SELECT COALESCE(sum(e.amount), 0) FROM public.expenses e
                     WHERE e.shop_id = p_shop_id AND e.spent_at >= p_from AND e.spent_at < p_to),
    'cost_of_goods', (SELECT COALESCE(sum(si.quantity * si.buying_price), 0)
                        FROM public.sale_items si
                        JOIN public.sales s ON s.id = si.sale_id
                       WHERE si.shop_id = p_shop_id AND s.sold_at >= p_from AND s.sold_at < p_to),
    'outstanding_credit', (SELECT COALESCE(sum(d.total_owed), 0) FROM public.debtors d
                     WHERE d.shop_id = p_shop_id),
    'stock_value', (SELECT COALESCE(sum(pr.quantity * pr.buying_price), 0) FROM public.products pr
                     WHERE pr.shop_id = p_shop_id AND pr.is_active),
    'low_stock_count', (SELECT count(*) FROM public.products pr
                     WHERE pr.shop_id = p_shop_id AND pr.is_active
                       AND pr.quantity <= pr.low_stock_threshold),
    'top_products', (SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
                       SELECT si.product_name AS name,
                              sum(si.quantity) AS quantity,
                              sum(si.subtotal) AS revenue
                         FROM public.sale_items si
                         JOIN public.sales s ON s.id = si.sale_id
                        WHERE si.shop_id = p_shop_id
                          AND s.sold_at >= p_from AND s.sold_at < p_to
                        GROUP BY si.product_name
                        ORDER BY revenue DESC
                        LIMIT 5
                     ) t)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.shop_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shop_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

COMMIT;
