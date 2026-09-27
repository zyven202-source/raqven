-- ============================================================================
-- RAVQEN migration: role consolidation + spec alignment + RLS rewrite
--
-- Why this migration exists
--   The foundation migration shipped three staff roles (owner/manager/cashier).
--   The product spec is explicit: roles MUST be exactly `owner` and `employee`.
--   This migration rebuilds the role enum without a manager tier, remaps any
--   existing manager/cashier rows, renames columns to the spec names (the
--   database is young — renaming now is far safer than aliasing forever), and
--   rewrites every RLS policy so no elevated-manager path remains.
--
-- Safe to run against a database with existing data:
--   * `ALTER TYPE ... RENAME VALUE` rewrites the enum catalog, not row data.
--   * manager rows become employees (they lose elevated rights by design).
--   * `movement_type` 'purchase' becomes 'stock_in' (same rows, new label).
--   * Column renames preserve all data; no tables are dropped.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Drop authorization helpers first. CASCADE removes every policy that
--    references them; all of them are recreated below with owner/employee
--    semantics. This avoids dangling policy expressions mid-migration.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.has_shop_role(UUID, public.shop_role[]) CASCADE;
DROP FUNCTION IF EXISTS public.is_shop_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_shop_owner(UUID) CASCADE;

-- ---------------------------------------------------------------------------
-- 2) Role enum: exactly owner + employee.
-- ---------------------------------------------------------------------------
ALTER TYPE public.shop_role RENAME VALUE 'cashier' TO 'employee';

ALTER TABLE public.shop_members ALTER COLUMN role DROP DEFAULT;

ALTER TYPE public.shop_role RENAME TO shop_role_old;
CREATE TYPE public.shop_role AS ENUM ('owner', 'employee');

-- Remap: managers are staff, not owners. Data-preserving via text round-trip.
ALTER TABLE public.shop_members
  ALTER COLUMN role TYPE public.shop_role
  USING CASE WHEN role::text = 'manager' THEN 'employee' ELSE role::text END::public.shop_role;

ALTER TABLE public.shop_members ALTER COLUMN role SET DEFAULT 'employee';
DROP TYPE public.shop_role_old;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_members_role_valid') THEN
    ALTER TABLE public.shop_members
      ADD CONSTRAINT shop_members_role_valid
      CHECK (role::text IN ('owner','employee'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Movement types: stock_in / sale / refund / adjustment (+ useful extras).
--    'purchase' is renamed in place — historical rows keep their meaning.
-- ---------------------------------------------------------------------------
ALTER TYPE public.movement_type RENAME VALUE 'purchase' TO 'stock_in';

-- ---------------------------------------------------------------------------
-- 4) shops: refund configuration switch + physical location (owner-managed).
-- ---------------------------------------------------------------------------
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS accepts_refunds BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shops.location        IS 'Physical location of the shop, e.g. "Gikomba, Nairobi". Owner-managed.';
COMMENT ON COLUMN public.shops.accepts_refunds IS 'Owner-controlled switch. Gates refund creation for the whole shop.';

-- ---------------------------------------------------------------------------
-- 5) Column renames to the spec vocabulary (data-preserving).
-- ---------------------------------------------------------------------------
ALTER TABLE public.products             RENAME COLUMN cost_price     TO buying_price;
ALTER TABLE public.products             RENAME COLUMN stock_quantity TO quantity;
ALTER TABLE public.sale_items           RENAME COLUMN unit_cost      TO buying_price;
ALTER TABLE public.sale_items           RENAME COLUMN line_total     TO subtotal;
ALTER TABLE public.debtors              RENAME COLUMN balance        TO total_owed;
ALTER TABLE public.sales                RENAME COLUMN sold_by        TO user_id;
ALTER TABLE public.payments             RENAME COLUMN recorded_by    TO user_id;
ALTER TABLE public.debtor_payments      RENAME COLUMN recorded_by    TO user_id;
ALTER TABLE public.expenses             RENAME COLUMN recorded_by    TO user_id;
ALTER TABLE public.refunds              RENAME COLUMN requested_by   TO user_id;
ALTER TABLE public.inventory_movements  RENAME COLUMN created_by     TO user_id;
ALTER TABLE public.inventory_movements  RENAME COLUMN type           TO movement_type;
ALTER TABLE public.inventory_movements  RENAME COLUMN note           TO notes;

COMMENT ON COLUMN public.products.buying_price IS 'What the shop pays per unit. Snapshotted onto sale_items at sale time.';
COMMENT ON COLUMN public.debtors.total_owed    IS 'Outstanding credit balance. Maintained by credit sales and debtor payments.';

-- ---------------------------------------------------------------------------
-- 6) Lock the door for anonymous callers and add supporting indexes.
--    Table grants were already authenticated-only; this removes any residual
--    default privileges so anon can neither read nor write anything.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

CREATE INDEX IF NOT EXISTS shop_members_user_active_idx
  ON public.shop_members(user_id) WHERE status = 'active';

-- One live access code per member per shop (draft/inactive codes are free).
CREATE UNIQUE INDEX IF NOT EXISTS employee_access_codes_one_active_per_member
  ON public.employee_access_codes(shop_id, member_id)
  WHERE is_active AND member_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7) Authorization helpers (SECURITY DEFINER so policies on shop_members do
--    not recurse). Roles: owner | employee only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_shop_member(_shop_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_members m
    WHERE m.shop_id = _shop_id AND m.user_id = auth.uid() AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_shop_role(_shop_id UUID, _roles public.shop_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_members m
    WHERE m.shop_id = _shop_id AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shop_owner(_shop_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.shops s WHERE s.id = _shop_id AND s.owner_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_shop_member(UUID)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_shop_role(UUID, public.shop_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_shop_owner(UUID)                     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_shop_member(UUID)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_shop_role(UUID, public.shop_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_shop_owner(UUID)                     TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) RLS policies — owner/employee model.
--    owner:    full control of their shop (settings, team, refund config).
--    employee: operational work only (POS, stock, expenses, debtor ops).
--    Everything is deny-by-default; no role can touch another shop's rows.
-- ---------------------------------------------------------------------------

-- profiles (self-service only)
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- shops
DROP POLICY IF EXISTS "shops_select_members" ON public.shops;
DROP POLICY IF EXISTS "shops_insert_owner"   ON public.shops;
DROP POLICY IF EXISTS "shops_update_owner"   ON public.shops;
DROP POLICY IF EXISTS "shops_delete_owner"   ON public.shops;
CREATE POLICY "shops_select_members" ON public.shops FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_shop_member(id));
CREATE POLICY "shops_insert_owner" ON public.shops FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "shops_update_owner" ON public.shops FOR UPDATE TO authenticated
  USING (public.is_shop_owner(id)) WITH CHECK (public.is_shop_owner(id));
CREATE POLICY "shops_delete_owner" ON public.shops FOR DELETE TO authenticated
  USING (public.is_shop_owner(id));

-- shop_members: staff can see only their own membership; owners manage the team
DROP POLICY IF EXISTS "members_select"       ON public.shop_members;
DROP POLICY IF EXISTS "members_insert_owner" ON public.shop_members;
DROP POLICY IF EXISTS "members_update_owner" ON public.shop_members;
DROP POLICY IF EXISTS "members_delete_owner" ON public.shop_members;
CREATE POLICY "members_select" ON public.shop_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_shop_owner(shop_id));
CREATE POLICY "members_insert_owner" ON public.shop_members FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_owner(shop_id));
CREATE POLICY "members_update_owner" ON public.shop_members FOR UPDATE TO authenticated
  USING (public.is_shop_owner(shop_id)) WITH CHECK (public.is_shop_owner(shop_id));
CREATE POLICY "members_delete_owner" ON public.shop_members FOR DELETE TO authenticated
  USING (public.is_shop_owner(shop_id));

-- employee_access_codes: owner-only management
DROP POLICY IF EXISTS "codes_manage" ON public.employee_access_codes;
CREATE POLICY "codes_owner_all" ON public.employee_access_codes FOR ALL TO authenticated
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- categories + products: operational, any active member
DROP POLICY IF EXISTS "categories_member_all" ON public.categories;
CREATE POLICY "categories_member_all" ON public.categories FOR ALL TO authenticated
  USING (public.is_shop_member(shop_id)) WITH CHECK (public.is_shop_member(shop_id));

DROP POLICY IF EXISTS "products_member_all" ON public.products;
CREATE POLICY "products_member_all" ON public.products FOR ALL TO authenticated
  USING (public.is_shop_member(shop_id)) WITH CHECK (public.is_shop_member(shop_id));

-- inventory_movements: append-only ledger
DROP POLICY IF EXISTS "movements_select" ON public.inventory_movements;
DROP POLICY IF EXISTS "movements_insert" ON public.inventory_movements;
CREATE POLICY "movements_select" ON public.inventory_movements FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id));
CREATE POLICY "movements_insert" ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(shop_id) AND user_id = auth.uid());

-- sales: recorded by the signed-in staff member; historical rows are immutable
-- from the client (no UPDATE/DELETE grant — corrections happen via RPC later).
DROP POLICY IF EXISTS "sales_select" ON public.sales;
DROP POLICY IF EXISTS "sales_insert" ON public.sales;
DROP POLICY IF EXISTS "sales_update" ON public.sales;
CREATE POLICY "sales_select" ON public.sales FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id));
CREATE POLICY "sales_insert" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(shop_id) AND user_id = auth.uid());

-- sale_items: inserted with their sale; immutable afterwards
DROP POLICY IF EXISTS "sale_items_member_all" ON public.sale_items;
CREATE POLICY "sale_items_select" ON public.sale_items FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id));
CREATE POLICY "sale_items_insert" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(shop_id));

-- payments: money in, recorded by staff; immutable
DROP POLICY IF EXISTS "payments_select" ON public.payments;
DROP POLICY IF EXISTS "payments_insert" ON public.payments;
DROP POLICY IF EXISTS "payments_update" ON public.payments;
CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id));
CREATE POLICY "payments_insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(shop_id) AND user_id = auth.uid());

-- debtors: operational records for credit customers
DROP POLICY IF EXISTS "debtors_member_all" ON public.debtors;
CREATE POLICY "debtors_member_all" ON public.debtors FOR ALL TO authenticated
  USING (public.is_shop_member(shop_id)) WITH CHECK (public.is_shop_member(shop_id));

-- debtor_payments: append-only
DROP POLICY IF EXISTS "debtor_payments_select" ON public.debtor_payments;
DROP POLICY IF EXISTS "debtor_payments_insert" ON public.debtor_payments;
CREATE POLICY "debtor_payments_select" ON public.debtor_payments FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id));
CREATE POLICY "debtor_payments_insert" ON public.debtor_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(shop_id) AND user_id = auth.uid());

-- expenses: staff log spending; rows are never deleted from the client
DROP POLICY IF EXISTS "expenses_member_all" ON public.expenses;
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id));
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(shop_id) AND user_id = auth.uid());
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE TO authenticated
  USING (public.is_shop_member(shop_id) AND user_id = auth.uid())
  WITH CHECK (public.is_shop_member(shop_id) AND user_id = auth.uid());

-- refunds: staff can file one only if the shop accepts refunds; the OWNER
-- approves (no elevated manager path). The accepts_refunds switch is read
-- from shops inside the check — configuration is enforced, not just displayed.
DROP POLICY IF EXISTS "refunds_select"        ON public.refunds;
DROP POLICY IF EXISTS "refunds_insert"        ON public.refunds;
DROP POLICY IF EXISTS "refunds_update_manager" ON public.refunds;
CREATE POLICY "refunds_select" ON public.refunds FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id));
CREATE POLICY "refunds_insert" ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (
    public.is_shop_member(shop_id)
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id AND s.accepts_refunds = true
    )
  );
CREATE POLICY "refunds_update_owner" ON public.refunds FOR UPDATE TO authenticated
  USING (public.is_shop_owner(shop_id)) WITH CHECK (public.is_shop_owner(shop_id));

-- refund_items: written with their refund; immutable afterwards
DROP POLICY IF EXISTS "refund_items_member_all" ON public.refund_items;
CREATE POLICY "refund_items_select" ON public.refund_items FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id));
CREATE POLICY "refund_items_insert" ON public.refund_items FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_member(shop_id));

-- receipt_settings: readable by staff, owner-configured
DROP POLICY IF EXISTS "receipt_settings_select" ON public.receipt_settings;
DROP POLICY IF EXISTS "receipt_settings_write"  ON public.receipt_settings;
DROP POLICY IF EXISTS "receipt_settings_update" ON public.receipt_settings;
CREATE POLICY "receipt_settings_select" ON public.receipt_settings FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id));
CREATE POLICY "receipt_settings_insert" ON public.receipt_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_owner(shop_id));
CREATE POLICY "receipt_settings_update" ON public.receipt_settings FOR UPDATE TO authenticated
  USING (public.is_shop_owner(shop_id)) WITH CHECK (public.is_shop_owner(shop_id));

-- ---------------------------------------------------------------------------
-- 9) Grant surface: read/append for financial history, full CRUD for
--    operational tables. Deny DELETE everywhere history must survive.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.profiles, public.shops, public.shop_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories, public.products, public.debtors TO authenticated;
GRANT SELECT, INSERT ON public.inventory_movements, public.sales, public.sale_items,
  public.payments, public.debtor_payments, public.refunds, public.refund_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.receipt_settings, public.employee_access_codes TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

COMMIT;
