-- ============================================================================
--  Owner-initiated shop deletion
--
--  Why this needed its own migration rather than a client-side `delete from
--  shops`: every shop-scoped table in the schema cascades from `shops`. One row
--  out means the shop's entire financial history goes with it — sales, the lines
--  and payments on them, refunds, debtors and what they have paid, products,
--  stock movements, expenses and the receipt counters. There is no soft delete
--  anywhere in this schema and there is not going to be one: a "deleted" shop
--  whose ledger is still readable is not deleted, it is just hidden.
--
--  That makes this the most destructive operation the product performs, so it is
--  the one that has to be guarded the hardest and described the most honestly:
--
--    * Owner only, enforced in the database. `shops.owner_id` is the single
--      source of truth for "owner" in this schema, so the check reads that
--      column rather than a membership row — a staff member with the `owner`
--      role could not delete the shop, and an owner who has been demoted by
--      hand still could.
--    * The shop name must be typed back exactly. The database compares the
--      string it is given against the name it holds, so a client bug, a stale
--      confirm dialog or a crafted request cannot satisfy it by accident.
--    * The shop row is locked `FOR UPDATE` before it is read, so the name and
--      the ownership that were checked are the name and the ownership that get
--      deleted. Without the lock a rename between the check and the delete would
--      delete a shop the caller had never confirmed.
--    * What will be lost is counted *before* anything is deleted, and returned,
--      so the app can put real numbers in front of the owner instead of the word
--      "permanent".
--
--  What is NOT deleted, and is written down here so nobody has to infer it:
--    * The owner's account. `shops.owner_id → auth.users` is ON DELETE RESTRICT,
--      and nothing here deletes from `auth.users`, so the person stays signed in
--      and can open another shop immediately.
--    * `data_requests` rows. That table's `shop_id` is ON DELETE SET NULL, so a
--      privacy request lodged against this shop survives with the link cleared.
--    * A record that the deletion happened — see `shop_deletions` below.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) shop_deletions — the tombstone
--
--    Deliberately has **no foreign key to shops**, and that is the entire point
--    of the table. `audit_log` is the project's record of sensitive actions, but
--    `audit_log.shop_id` cascades: an entry written for a shop being deleted is
--    deleted along with it, which makes it useless as evidence for the one
--    action where evidence matters most.
--
--    So this row is written by hand, holds no customer data — the counts and the
--    shop's own name, never a debtor's — and outlives the shop. It exists to
--    answer one question honestly: "what happened to the records of the shop
--    that used to be called X?"
--
--    No client reads or writes it. That is deliberate too: an owner who could
--    read the tombstone table could enumerate other shops' deletion history, and
--    a client that could write it could forge one.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_deletions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No REFERENCES on purpose. See above.
  shop_id       UUID NOT NULL,
  shop_name     TEXT NOT NULL,
  shop_slug     TEXT,
  owner_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  member_count  INTEGER NOT NULL DEFAULT 0,
  counts        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shop_deletions IS
  'Record of shops deleted by their owner. Survives the deletion by design; holds no customer data and is readable only with service-role credentials.';

CREATE INDEX IF NOT EXISTS shop_deletions_created_idx
  ON public.shop_deletions (created_at DESC);

ALTER TABLE public.shop_deletions ENABLE ROW LEVEL SECURITY;

-- No policies at all, and the privilege revoked: this table is server-only.
REVOKE ALL ON TABLE public.shop_deletions FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) shop_deletion_counts — what a deletion would take with it
--
--    Written as a set of subqueries in one statement so the numbers cannot be
--    read half-old and half-new. SECURITY DEFINER because the counts span tables
--    an employee may not be able to read; the caller is checked by the two
--    functions that wrap this one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shop_deletion_counts(p_shop_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'sales',              (SELECT count(*) FROM public.sales               WHERE shop_id = p_shop_id),
    'sale_items',         (SELECT count(*) FROM public.sale_items          WHERE shop_id = p_shop_id),
    'payments',           (SELECT count(*) FROM public.payments            WHERE shop_id = p_shop_id),
    'refunds',            (SELECT count(*) FROM public.refunds             WHERE shop_id = p_shop_id),
    'refund_items',       (SELECT count(*) FROM public.refund_items        WHERE shop_id = p_shop_id),
    'debtors',            (SELECT count(*) FROM public.debtors             WHERE shop_id = p_shop_id),
    'debtor_payments',    (SELECT count(*) FROM public.debtor_payments     WHERE shop_id = p_shop_id),
    'products',           (SELECT count(*) FROM public.products            WHERE shop_id = p_shop_id),
    'categories',         (SELECT count(*) FROM public.categories          WHERE shop_id = p_shop_id),
    'inventory_movements',(SELECT count(*) FROM public.inventory_movements WHERE shop_id = p_shop_id),
    'expenses',           (SELECT count(*) FROM public.expenses            WHERE shop_id = p_shop_id),
    'staff',              (SELECT count(*) FROM public.shop_members        WHERE shop_id = p_shop_id),
    'access_codes',       (SELECT count(*) FROM public.employee_access_codes WHERE shop_id = p_shop_id),
    'activity_entries',   (SELECT count(*) FROM public.audit_log            WHERE shop_id = p_shop_id)
  );
$$;

REVOKE ALL ON FUNCTION public.shop_deletion_counts(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) shop_deletion_preview — what the owner is about to lose
--
--    Owner-only, same as the delete itself. An employee must not be able to
--    call this to read a shop's ledger size either, so the ownership check comes
--    before anything is counted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shop_deletion_preview(p_shop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_shop public.shops%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That shop does not exist.' USING ERRCODE = 'P0002';
  END IF;

  IF v_shop.owner_id <> v_user THEN
    RAISE EXCEPTION 'Only the owner can delete this shop.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'shop_id',    v_shop.id,
    'shop_name',  v_shop.name,
    'created_at', v_shop.created_at,
    'counts',     public.shop_deletion_counts(p_shop_id),
    -- Named separately from the counts above because it is the one number that
    -- does *not* fall to zero. A privacy request lodged against this shop stays
    -- on file with its shop link cleared, and the owner deserves to be told that
    -- rather than to assume everything vanished.
    'data_requests_retained',
      (SELECT count(*) FROM public.data_requests WHERE shop_id = p_shop_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.shop_deletion_preview(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shop_deletion_preview(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) delete_shop — the deletion
--
--    Three guards, in this order, and all three in the database:
--      signed in → owner of this shop → name typed back exactly.
--    Nothing is deleted until all three pass, and the tombstone is written before
--    the DELETE rather than after it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_shop(p_shop_id UUID, p_confirm_shop_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    UUID := auth.uid();
  v_shop    public.shops%ROWTYPE;
  v_counts  JSONB;
  v_members INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE holds the row for the rest of the transaction, so the name and
  -- the owner read here are the ones deleted below. A rename that lands between
  -- the check and the delete would otherwise delete a shop nobody confirmed.
  SELECT * INTO v_shop FROM public.shops WHERE id = p_shop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That shop does not exist.' USING ERRCODE = 'P0002';
  END IF;

  IF v_shop.owner_id <> v_user THEN
    RAISE EXCEPTION
      'Only the owner can delete this shop. Ask the owner to do it.'
      USING ERRCODE = '42501';
  END IF;

  -- Compared case-insensitively and with surrounding space ignored, because a
  -- shopkeeper typing on a phone keyboard should not lose their shop to a
  -- trailing space — and compared at all, because "delete my shop" is not a
  -- confirmation, it is a button press.
  IF p_confirm_shop_name IS NULL
     OR btrim(p_confirm_shop_name) = ''
     OR lower(btrim(p_confirm_shop_name)) <> lower(btrim(v_shop.name)) THEN
    RAISE EXCEPTION
      'Type the shop name exactly to confirm: %', v_shop.name
      USING ERRCODE = '42501';
  END IF;

  v_counts := public.shop_deletion_counts(p_shop_id);
  SELECT count(*) INTO v_members FROM public.shop_members WHERE shop_id = p_shop_id;

  INSERT INTO public.shop_deletions
    (shop_id, shop_name, shop_slug, owner_id, deleted_by, member_count, counts)
  VALUES
    (v_shop.id, v_shop.name, v_shop.slug, v_shop.owner_id, v_user, v_members, v_counts);

  -- The cascade takes the ledger, the members, the stock, the receipt settings
  -- and the audit entries with it. The audit triggers fired by that cascade
  -- write nothing: `audit_write` guards its INSERT with a `WHERE EXISTS` on the
  -- shop row precisely so a deletion does not fail on its own audit trail.
  DELETE FROM public.shops WHERE id = p_shop_id AND owner_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That shop could not be deleted.' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'deleted',         true,
    'shop_id',         v_shop.id,
    'shop_name',       v_shop.name,
    'counts',          v_counts,
    'members_removed', v_members
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_shop(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_shop(UUID, TEXT) TO authenticated;

COMMIT;
