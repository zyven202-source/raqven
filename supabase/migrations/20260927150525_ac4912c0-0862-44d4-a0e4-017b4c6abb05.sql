-- ============ ENUMS ============
CREATE TYPE public.shop_role AS ENUM ('owner','manager','cashier');
CREATE TYPE public.member_status AS ENUM ('active','suspended','removed');
CREATE TYPE public.movement_type AS ENUM ('purchase','sale','adjustment','refund','damage','transfer','opening');
CREATE TYPE public.sale_status AS ENUM ('completed','partial','pending','cancelled');
CREATE TYPE public.payment_method AS ENUM ('cash','mpesa','card','bank','credit');
CREATE TYPE public.refund_status AS ENUM ('pending','approved','rejected');

-- ============ UTILITIES ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ SHOPS ============
CREATE TABLE public.shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,60}$'),
  business_type TEXT,
  currency TEXT NOT NULL DEFAULT 'KES' CHECK (length(currency) = 3),
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  kra_pin TEXT,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX shops_owner_id_idx ON public.shops(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shops TO authenticated;
GRANT ALL ON public.shops TO service_role;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER shops_updated_at BEFORE UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SHOP MEMBERS ============
CREATE TABLE public.shop_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.shop_role NOT NULL DEFAULT 'cashier',
  status public.member_status NOT NULL DEFAULT 'active',
  display_name TEXT,
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, user_id)
);
CREATE INDEX shop_members_user_idx ON public.shop_members(user_id);
CREATE INDEX shop_members_shop_idx ON public.shop_members(shop_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_members TO authenticated;
GRANT ALL ON public.shop_members TO service_role;
ALTER TABLE public.shop_members ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER shop_members_updated_at BEFORE UPDATE ON public.shop_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ACCESS HELPERS (security definer, avoid RLS recursion) ============
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

-- shops policies
CREATE POLICY "shops_select_members" ON public.shops FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_shop_member(id));
CREATE POLICY "shops_insert_owner" ON public.shops FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "shops_update_owner" ON public.shops FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "shops_delete_owner" ON public.shops FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- shop_members policies
CREATE POLICY "members_select" ON public.shop_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_shop_owner(shop_id) OR public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]));
CREATE POLICY "members_insert_owner" ON public.shop_members FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_owner(shop_id) OR public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]));
CREATE POLICY "members_update_owner" ON public.shop_members FOR UPDATE TO authenticated
  USING (public.is_shop_owner(shop_id) OR public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]))
  WITH CHECK (public.is_shop_owner(shop_id) OR public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]));
CREATE POLICY "members_delete_owner" ON public.shop_members FOR DELETE TO authenticated
  USING (public.is_shop_owner(shop_id));

-- auto-enroll shop creator as owner member
CREATE OR REPLACE FUNCTION public.handle_new_shop()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.shop_members (shop_id, user_id, role, status)
  VALUES (NEW.id, NEW.owner_id, 'owner', 'active')
  ON CONFLICT (shop_id, user_id) DO NOTHING;
  INSERT INTO public.receipt_settings (shop_id) VALUES (NEW.id) ON CONFLICT (shop_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- ============ EMPLOYEE ACCESS CODES ============
CREATE TABLE public.employee_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.shop_members(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, code_hash)
);
CREATE INDEX employee_access_codes_shop_idx ON public.employee_access_codes(shop_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_access_codes TO authenticated;
GRANT ALL ON public.employee_access_codes TO service_role;
ALTER TABLE public.employee_access_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "codes_manage" ON public.employee_access_codes FOR ALL TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]))
  WITH CHECK (public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]));
CREATE TRIGGER employee_access_codes_updated_at BEFORE UPDATE ON public.employee_access_codes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CATEGORIES ============
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name)
);
CREATE INDEX categories_shop_idx ON public.categories(shop_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_member_all" ON public.categories FOR ALL TO authenticated
  USING (public.is_shop_member(shop_id)) WITH CHECK (public.is_shop_member(shop_id));
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  sku TEXT,
  barcode TEXT,
  unit TEXT NOT NULL DEFAULT 'pc',
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  stock_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(12,3) NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, sku),
  UNIQUE (shop_id, barcode)
);
CREATE INDEX products_shop_idx ON public.products(shop_id);
CREATE INDEX products_category_idx ON public.products(category_id);
CREATE INDEX products_shop_name_idx ON public.products(shop_id, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_member_all" ON public.products FOR ALL TO authenticated
  USING (public.is_shop_member(shop_id)) WITH CHECK (public.is_shop_member(shop_id));
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ INVENTORY MOVEMENTS ============
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type public.movement_type NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity <> 0),
  unit_cost NUMERIC(12,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  balance_after NUMERIC(12,3),
  reference_type TEXT,
  reference_id UUID,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_shop_idx ON public.inventory_movements(shop_id, created_at DESC);
CREATE INDEX inventory_movements_product_idx ON public.inventory_movements(product_id, created_at DESC);
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movements_select" ON public.inventory_movements FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY "movements_insert" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (public.is_shop_member(shop_id));

-- ============ DEBTORS ============
CREATE TABLE public.debtors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  phone TEXT,
  email TEXT,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(12,2) CHECK (credit_limit IS NULL OR credit_limit >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, phone)
);
CREATE INDEX debtors_shop_idx ON public.debtors(shop_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.debtors TO authenticated;
GRANT ALL ON public.debtors TO service_role;
ALTER TABLE public.debtors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debtors_member_all" ON public.debtors FOR ALL TO authenticated
  USING (public.is_shop_member(shop_id)) WITH CHECK (public.is_shop_member(shop_id));
CREATE TRIGGER debtors_updated_at BEFORE UPDATE ON public.debtors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SALES ============
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  debtor_id UUID REFERENCES public.debtors(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.sale_status NOT NULL DEFAULT 'completed',
  note TEXT,
  sold_by UUID,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, receipt_number)
);
CREATE INDEX sales_shop_date_idx ON public.sales(shop_id, sold_at DESC);
CREATE INDEX sales_debtor_idx ON public.sales(debtor_id);
GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_select" ON public.sales FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY "sales_insert" ON public.sales FOR INSERT TO authenticated WITH CHECK (public.is_shop_member(shop_id));
CREATE POLICY "sales_update" ON public.sales FOR UPDATE TO authenticated
  USING (public.is_shop_member(shop_id)) WITH CHECK (public.is_shop_member(shop_id));
CREATE TRIGGER sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SALE ITEMS ============
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sale_items_sale_idx ON public.sale_items(sale_id);
CREATE INDEX sale_items_shop_idx ON public.sale_items(shop_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_items_member_all" ON public.sale_items FOR ALL TO authenticated
  USING (public.is_shop_member(shop_id)) WITH CHECK (public.is_shop_member(shop_id));

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL DEFAULT 'cash',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reference TEXT,
  note TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_shop_idx ON public.payments(shop_id, paid_at DESC);
CREATE INDEX payments_sale_idx ON public.payments(sale_id);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY "payments_insert" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.is_shop_member(shop_id));
CREATE POLICY "payments_update" ON public.payments FOR UPDATE TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]))
  WITH CHECK (public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]));

-- ============ DEBTOR PAYMENTS ============
CREATE TABLE public.debtor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  debtor_id UUID NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method public.payment_method NOT NULL DEFAULT 'cash',
  reference TEXT,
  note TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX debtor_payments_shop_idx ON public.debtor_payments(shop_id, paid_at DESC);
CREATE INDEX debtor_payments_debtor_idx ON public.debtor_payments(debtor_id);
GRANT SELECT, INSERT ON public.debtor_payments TO authenticated;
GRANT ALL ON public.debtor_payments TO service_role;
ALTER TABLE public.debtor_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debtor_payments_select" ON public.debtor_payments FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY "debtor_payments_insert" ON public.debtor_payments FOR INSERT TO authenticated WITH CHECK (public.is_shop_member(shop_id));

-- ============ EXPENSES ============
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method public.payment_method NOT NULL DEFAULT 'cash',
  receipt_url TEXT,
  spent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_shop_idx ON public.expenses(shop_id, spent_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_member_all" ON public.expenses FOR ALL TO authenticated
  USING (public.is_shop_member(shop_id)) WITH CHECK (public.is_shop_member(shop_id));
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ REFUNDS ============
CREATE TABLE public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  reason TEXT,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  status public.refund_status NOT NULL DEFAULT 'pending',
  requested_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refunds_shop_idx ON public.refunds(shop_id, created_at DESC);
CREATE INDEX refunds_sale_idx ON public.refunds(sale_id);
GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refunds_select" ON public.refunds FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY "refunds_insert" ON public.refunds FOR INSERT TO authenticated WITH CHECK (public.is_shop_member(shop_id));
CREATE POLICY "refunds_update_manager" ON public.refunds FOR UPDATE TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]))
  WITH CHECK (public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]));
CREATE TRIGGER refunds_updated_at BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ REFUND ITEMS ============
CREATE TABLE public.refund_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  refund_id UUID NOT NULL REFERENCES public.refunds(id) ON DELETE CASCADE,
  sale_item_id UUID REFERENCES public.sale_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  restock BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refund_items_refund_idx ON public.refund_items(refund_id);
CREATE INDEX refund_items_shop_idx ON public.refund_items(shop_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refund_items TO authenticated;
GRANT ALL ON public.refund_items TO service_role;
ALTER TABLE public.refund_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refund_items_member_all" ON public.refund_items FOR ALL TO authenticated
  USING (public.is_shop_member(shop_id)) WITH CHECK (public.is_shop_member(shop_id));

-- ============ RECEIPT SETTINGS ============
CREATE TABLE public.receipt_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL UNIQUE REFERENCES public.shops(id) ON DELETE CASCADE,
  header_text TEXT,
  footer_text TEXT DEFAULT 'Asante kwa biashara!',
  show_logo BOOLEAN NOT NULL DEFAULT true,
  logo_url TEXT,
  show_tax BOOLEAN NOT NULL DEFAULT false,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  receipt_prefix TEXT NOT NULL DEFAULT 'RV',
  paper_width_mm INTEGER NOT NULL DEFAULT 58 CHECK (paper_width_mm IN (58, 80)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.receipt_settings TO authenticated;
GRANT ALL ON public.receipt_settings TO service_role;
ALTER TABLE public.receipt_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipt_settings_select" ON public.receipt_settings FOR SELECT TO authenticated USING (public.is_shop_member(shop_id));
CREATE POLICY "receipt_settings_write" ON public.receipt_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]));
CREATE POLICY "receipt_settings_update" ON public.receipt_settings FOR UPDATE TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]))
  WITH CHECK (public.has_shop_role(shop_id, ARRAY['owner','manager']::public.shop_role[]));
CREATE TRIGGER receipt_settings_updated_at BEFORE UPDATE ON public.receipt_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- shop bootstrap trigger (after receipt_settings exists)
CREATE TRIGGER on_shop_created AFTER INSERT ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_shop();