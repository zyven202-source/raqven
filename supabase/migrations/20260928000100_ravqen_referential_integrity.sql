-- ============================================================================
-- RAVQEN: referential integrity for user-owned rows
--
-- Why this migration exists
--   Phase 1 gave `profiles`, `shops` and `shop_members` user columns but no
--   foreign key to `auth.users`. Deleting an account therefore left the profile
--   row behind (seven such orphans existed in the live database) and would have
--   left a shop owned by nobody, with no way to tell it apart from real data.
--
--   The three relationships are intentionally different:
--     * profiles.id -> auth.users       ON DELETE CASCADE
--       The profile IS the user's own record; it must not outlive the account.
--     * shop_members.user_id -> auth.users ON DELETE CASCADE
--       A membership has no meaning without the member.
--     * shops.owner_id -> auth.users    ON DELETE RESTRICT
--       A shop carries years of financial history. Losing it as a silent
--       side-effect of deleting an account is unacceptable, so the database
--       refuses and the owner must transfer or delete the shop explicitly.
-- ============================================================================

BEGIN;

-- Clean up rows that already lost their user, so the constraints can be added.
DELETE FROM public.profiles p
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

DELETE FROM public.shop_members m
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id);

-- A shop whose owner no longer exists cannot be administered by anyone.
DELETE FROM public.shops s
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.owner_id);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.shop_members
  DROP CONSTRAINT IF EXISTS shop_members_user_id_fkey;
ALTER TABLE public.shop_members
  ADD CONSTRAINT shop_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.shops
  DROP CONSTRAINT IF EXISTS shops_owner_id_fkey;
ALTER TABLE public.shops
  ADD CONSTRAINT shops_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- The audit-trail columns should point at real people too, but a staff member
-- leaving must never delete the sales they rang up — hence SET NULL.
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_user_id_fkey;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_user_id_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_user_id_fkey;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.debtor_payments
  DROP CONSTRAINT IF EXISTS debtor_payments_user_id_fkey;
ALTER TABLE public.debtor_payments
  ADD CONSTRAINT debtor_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.refunds
  DROP CONSTRAINT IF EXISTS refunds_user_id_fkey;
ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_user_id_fkey;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- PostgREST needs to know it can join products -> categories for the
-- embedded category name the stock screen selects.
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON public.sale_items(product_id);
CREATE INDEX IF NOT EXISTS expenses_shop_category_idx ON public.expenses(shop_id, category);

COMMIT;
