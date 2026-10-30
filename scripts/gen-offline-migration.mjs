#!/usr/bin/env node
// Builds supabase/migrations/20261028000000_savo_offline_idempotency.sql from
// the original create_sale definition in the sales-engine migration.
//
// The offline outbox needs the server to recognise a retry of a sale it has
// already applied. Rather than retyping ~200 lines of plpgsql (where a single
// wrong character silently breaks checkout), this extracts the original
// function verbatim and applies four surgical edits:
//   1. add `p_client_tx_id UUID DEFAULT NULL` to the signature
//   2. short-circuit at the top when that id already exists in the shop
//   3. persist the id on the sale row
//   4. grant the new signature
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "supabase/migrations/20260928000000_ravqen_sales_engine.sql";
const OUT = "supabase/migrations/20261028000000_savo_offline_idempotency.sql";

const text = readFileSync(SRC, "utf8");
const start = text.indexOf("CREATE OR REPLACE FUNCTION public.create_sale(");
if (start < 0) throw new Error("create_sale not found in source migration");
const endMarker = "$$;";
const end = text.indexOf(endMarker, start);
if (end < 0) throw new Error("function end not found");
// Include the revoke/grant block that immediately follows the function — it
// names the signature and must be rewritten with it.
const grantsFrom = end + endMarker.length;
const grantsEnd = text.indexOf("GRANT EXECUTE ON FUNCTION public.create_sale", grantsFrom);
if (grantsEnd < 0) throw new Error("grant not found");
const grantsLine = text.indexOf("\n", grantsEnd);
let fn = text.slice(start, grantsLine);

const replaceOnce = (hay, from, to) => {
  const i = hay.indexOf(from);
  if (i < 0) throw new Error(`anchor not found: ${from.slice(0, 60)}`);
  if (hay.indexOf(from, i + 1) >= 0) throw new Error(`anchor ambiguous: ${from.slice(0, 60)}`);
  return hay.slice(0, i) + to + hay.slice(i + from.length);
};

// 1. signature
fn = replaceOnce(
  fn,
  `  p_debtor_phone      TEXT DEFAULT NULL,
  p_note              TEXT DEFAULT NULL
)
RETURNS JSONB`,
  `  p_debtor_phone       TEXT DEFAULT NULL,
  p_note               TEXT DEFAULT NULL,
  -- The offline outbox's identity for this sale attempt: one UUID per
  -- checkout, generated on the device. NULL for every caller that predates
  -- it, so old clients keep working untouched.
  p_client_tx_id       UUID DEFAULT NULL
)
RETURNS JSONB`,
);

// 2. declaration + dedupe short-circuit, anchored on the discount guard
fn = replaceOnce(
  fn,
  `  v_name         TEXT;
BEGIN`,
  `  v_name         TEXT;
  v_existing     public.sales;
BEGIN`,
);
fn = replaceOnce(
  fn,
  `  IF COALESCE(p_discount_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative' USING ERRCODE = '22023';
  END IF;
`,
  `  IF COALESCE(p_discount_amount, 0) < 0 THEN
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
`,
);

// 3. persist the id
fn = replaceOnce(
  fn,
  `    subtotal, discount_amount, total_amount, amount_paid, balance_due,
    status, note, user_id
  ) VALUES (`,
  `    subtotal, discount_amount, total_amount, amount_paid, balance_due,
    status, note, user_id, client_tx_id
  ) VALUES (`,
);
fn = replaceOnce(
  fn,
  `    v_status, NULLIF(trim(COALESCE(p_note, '')), ''), v_user
  ) RETURNING id INTO v_sale_id;`,
  `    v_status, NULLIF(trim(COALESCE(p_note, '')), ''), v_user, p_client_tx_id
  ) RETURNING id INTO v_sale_id;`,
);

// 4. grants: the original 8-arg function is dropped so PostgREST never sees
//    two overloads of the same name, and the 9-arg signature is granted.
const grants = `
REVOKE ALL ON FUNCTION public.create_sale(UUID, JSONB, public.payment_method, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(UUID, JSONB, public.payment_method, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
`
  .trim()
  .split("\n")
  .join("\n");
if (!fn.includes(grants)) throw new Error("grant block not found in extracted function");
fn = fn.replace(
  grants,
  `-- The old 8-argument overload is dropped AFTER the new one exists, so
-- create_sale is never unavailable mid-migration. PostgREST then resolves
-- both the old callers (all named args, defaults fill the ninth) and the
-- new outbox (all nine) against this single signature.
DROP FUNCTION IF EXISTS public.create_sale(UUID, JSONB, public.payment_method, NUMERIC, NUMERIC, TEXT, TEXT, TEXT);

REVOKE ALL ON FUNCTION public.create_sale(UUID, JSONB, public.payment_method, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(UUID, JSONB, public.payment_method, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID) TO authenticated;`,
);

const header = `-- SAVO 2.0 — offline idempotency for create_sale.
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

`;

writeFileSync(OUT, header + fn + "\n");
console.log(`wrote ${OUT} (${header.length + fn.length} bytes)`);
