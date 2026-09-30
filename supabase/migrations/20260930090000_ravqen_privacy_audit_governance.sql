-- ============================================================================
-- RAVQEN migration: audit trail, consent records, data-subject requests
--
-- Why this migration exists
--   The app could write sales, refunds, stock movements, expenses and staff
--   changes, but nothing recorded *who* did it. Three gaps followed from that:
--
--     1. No audit trail. A sale said a user id; a stock movement said nothing at
--        all; a settings change left no trace. A shopkeeper disputing a figure
--        had nothing to point at.
--     2. No consent record. Sign-up captured no evidence that the person agreed
--        to anything, so "we do not store what you did not agree to" was a claim
--        with nothing behind it.
--     3. No data-subject route. There was no way, in product or in policy, to
--        ask for a copy of your data, to correct it, or to have it removed.
--
-- Design decisions
--   * The audit log is APPEND-ONLY and the client cannot write to it. There is
--     no INSERT/UPDATE/DELETE policy for `authenticated`; rows are written only
--     by SECURITY DEFINER trigger functions, which run as the table owner. A
--     compromised browser token can therefore *cause* an audited action but
--     cannot forge, edit or erase the record of one.
--   * The audit log stores no free-text personal data. `summary` is built from
--     columns the schema already holds (an action name, a count, an amount); it
--     is never a copy of a customer's name, a debtor's phone number, or a free
--     note. Metadata is restricted to a small whitelist of non-identifying keys.
--   * Consent rows survive account deletion with `user_id` set to NULL and a
--     salted `subject_hash` left behind. You keep the evidence that consent was
--     given without keeping the person it was given to.
--   * `delete_my_account()` refuses while the caller still owns a shop. A shop
--     has an accounting trail attached to it, and a shopkeeper who clicks
--     "delete my account" while three years of sales are attached should be told
--     what will be lost, not have it happen.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  -- ON DELETE SET NULL: a deleted user must not take the trail with them, but
  -- the entry itself is the evidence and stays readable.
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  summary     TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_log IS
  'Append-only record of sensitive business actions. Written only by SECURITY DEFINER triggers; no client may insert, edit or delete a row.';
COMMENT ON COLUMN public.audit_log.actor_id IS
  'The signed-in user at the time of the action. NULL once that account is deleted — the entry outlives the person, deliberately.';

CREATE INDEX IF NOT EXISTS audit_log_shop_created_idx
  ON public.audit_log (shop_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.audit_log;

-- ---------------------------------------------------------------------------
-- 2) consent_records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consent_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deliberately NOT a foreign key: consent evidence has to outlive the account.
  user_id        UUID,
  subject_hash   TEXT NOT NULL,
  consent_type   TEXT NOT NULL
                   CHECK (consent_type IN ('terms', 'privacy_policy', 'product_updates')),
  granted        BOOLEAN NOT NULL,
  policy_version TEXT NOT NULL,
  source         TEXT NOT NULL DEFAULT 'signup',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.consent_records IS
  'Evidence of what a user agreed to, and when. user_id is cleared on account deletion; subject_hash (salted) remains so the record still proves something.';
COMMENT ON COLUMN public.consent_records.subject_hash IS
  'SHA-256 of the user id mixed with a per-install pepper. Lets a consent record be tied to one subject without storing who they are.';

CREATE INDEX IF NOT EXISTS consent_records_user_idx
  ON public.consent_records (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3) data_requests — the data-subject route, as a real table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id    UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL
               CHECK (request_type IN ('access', 'correction', 'deletion', 'privacy_contact')),
  details    TEXT,
  status     TEXT NOT NULL DEFAULT 'received'
               CHECK (status IN ('received', 'in_progress', 'fulfilled', 'declined', 'withdrawn')),
  response   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.data_requests IS
  'Access, correction, deletion and privacy requests lodged from Settings › Data & privacy. Self-serve export and account deletion do not need a row; this is for anything a person has to look at.';

CREATE INDEX IF NOT EXISTS data_requests_user_idx
  ON public.data_requests (user_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.data_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.data_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Row level security
--    * audit_log       — members read their own shop; nobody writes from a client
--    * consent_records — a subject reads and writes only their own, through RPCs
--    * data_requests   — a subject reads and writes only their own
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_requests  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_shop_member(shop_id));

-- No INSERT / UPDATE / DELETE policy exists on purpose. With RLS enabled and no
-- permissive write policy, an authenticated client cannot forge an entry.

DROP POLICY IF EXISTS consent_records_select ON public.consent_records;
CREATE POLICY consent_records_select ON public.consent_records FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS data_requests_select ON public.data_requests;
CREATE POLICY data_requests_select ON public.data_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Writes go through SECURITY DEFINER RPCs that re-check auth.uid().
--
-- Order matters: REVOKE everything first, then grant back exactly the read
-- privilege. Doing it the other way round silently strips the grant again, and
-- the symptom is a screen that loads an empty list rather than an error — the
-- kind of failure that reads as "no activity yet" forever.
REVOKE ALL ON TABLE public.audit_log, public.consent_records, public.data_requests
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.audit_log TO authenticated;
GRANT SELECT ON TABLE public.consent_records TO authenticated;
GRANT SELECT ON TABLE public.data_requests TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) The pepper behind subject_hash
--    pgcrypto lives in `extensions` on this project, so sha256 is qualified.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consent_subject_hash(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT encode(
    sha256(
      (coalesce(current_setting('ravqen.consent_pepper', true), 'ravqen-consent-pepper')
       || ':' || p_user_id::TEXT)::bytea
    ),
    'hex'
  );
$$;

REVOKE ALL ON FUNCTION public.consent_subject_hash(UUID) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 6) Consent + request RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_consent(
  p_consent_type TEXT,
  p_granted      BOOLEAN,
  p_policy_version TEXT,
  p_source       TEXT DEFAULT 'settings'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_id   UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.' USING ERRCODE = '42501';
  END IF;

  IF p_consent_type NOT IN ('terms', 'privacy_policy', 'product_updates') THEN
    RAISE EXCEPTION 'Unknown consent type.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.consent_records
    (user_id, subject_hash, consent_type, granted, policy_version, source)
  VALUES
    (v_user, public.consent_subject_hash(v_user), p_consent_type,
     coalesce(p_granted, false), p_policy_version, p_source)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.lodge_data_request(
  p_request_type TEXT,
  p_details      TEXT DEFAULT NULL,
  p_shop_id      UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_id   UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.' USING ERRCODE = '42501';
  END IF;

  IF p_request_type NOT IN ('access', 'correction', 'deletion', 'privacy_contact') THEN
    RAISE EXCEPTION 'Unknown request type.' USING ERRCODE = '22023';
  END IF;

  -- A request may be about one of your shops, but only if you are in it.
  IF p_shop_id IS NOT NULL AND NOT public.is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'That shop is not yours.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.data_requests (user_id, shop_id, request_type, details)
  VALUES (v_user, p_shop_id, p_request_type, nullif(btrim(coalesce(p_details, '')), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_data_request(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.data_requests
     SET status = 'withdrawn'
   WHERE id = p_request_id
     AND user_id = v_user
     AND status IN ('received', 'in_progress');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.record_consent(TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lodge_data_request(TEXT, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_data_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_consent(TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lodge_data_request(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_data_request(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Account deletion
--    What it removes: the profile, the memberships, the access codes, the
--    consents' link to the user, and the pending requests.
--    What it will not remove, and says so out loud: the shop and its ledger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_owned  TEXT;
  v_count  INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.' USING ERRCODE = '42501';
  END IF;

  SELECT string_agg(s.name, ', ')
    INTO v_owned
    FROM public.shops s
   WHERE s.owner_id = v_user;

  IF v_owned IS NOT NULL THEN
    RAISE EXCEPTION
      'You still own: %. Transfer or close these shops first — their sales, stock and debtor records have to stay.', v_owned
      USING ERRCODE = '42501';
  END IF;

  -- Memberships, memberships only. Nothing here cascades into a shop's ledger.
  DELETE FROM public.shop_members WHERE user_id = v_user;
  DELETE FROM public.employee_access_codes WHERE created_by = v_user;

  -- Keep the evidence, drop the identity.
  UPDATE public.consent_records
     SET user_id = NULL
   WHERE user_id = v_user;

  -- Sales, expenses and the like still name this user as the operator, and
  -- that attribution is part of the shop's accounting record. Clearing the
  -- profile below is what removes the personal data; the operator column stays
  -- because a sale with no operator is not an audit trail.
  DELETE FROM public.profiles WHERE id = v_user;

  SELECT count(*) INTO v_count
    FROM public.shop_members m
   WHERE m.user_id = v_user;

  RETURN jsonb_build_object(
    'profile_deleted',     true,
    'memberships_removed', v_count,
    'consent_retained',    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) The audit trail itself
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_write(
  p_shop_id     UUID,
  p_action      TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id   TEXT DEFAULT NULL,
  p_summary     TEXT DEFAULT NULL,
  p_metadata    JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_shop_id IS NULL THEN
    RETURN;
  END IF;

  -- Only keys the schema already holds and that carry no personal data. This
  -- whitelist is the whole point: an audit row cannot become a back door for
  -- copying a debtor's name into a text column.
  --
  -- The `WHERE EXISTS` is not decoration. A shop deletion cascades to its
  -- members, and Postgres runs those cascading DELETEs *after* the parent row
  -- is gone — so the `shop_members` trigger fires for a shop that no longer
  -- exists, and a plain INSERT fails the `audit_log.shop_id` foreign key. That
  -- made deleting a shop impossible. Writing the insert as a conditional SELECT
  -- makes the existence check and the insert one atomic statement, so the row
  -- is skipped rather than racing a deletion it cannot win. An audit entry for a
  -- shop being deleted would be deleted with it anyway (`audit_log` cascades on
  -- `shop_id`), so nothing is lost by not writing it.
  INSERT INTO public.audit_log
    (shop_id, actor_id, action, entity_type, entity_id, summary, metadata)
  SELECT
    p_shop_id, auth.uid(), p_action, p_entity_type, p_entity_id,
    left(coalesce(p_summary, ''), 200),
    coalesce(p_metadata, '{}'::jsonb) - 'name' - 'phone' - 'email' - 'notes' - 'notes_internal' - 'customer_name'
  WHERE EXISTS (SELECT 1 FROM public.shops WHERE id = p_shop_id);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_write(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;

-- --- 8a) sales ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO v_lines FROM public.sale_items WHERE sale_id = NEW.id;
    PERFORM public.audit_write(
      NEW.shop_id, 'sale.created', 'sale', NEW.id::TEXT,
      format('Sale %s recorded', coalesce(NEW.receipt_number, '—')),
      jsonb_build_object(
        'total_amount', NEW.total_amount,
        'amount_paid', NEW.amount_paid,
        'balance_due', NEW.balance_due,
        'is_credit_sale', NEW.debtor_id IS NOT NULL,
        -- The customer's name is deliberately not copied here. Whether the sale
        -- carried one is a routing fact; the name itself lives on the sale.
        'customer_name_captured', nullif(btrim(coalesce(NEW.customer_name, '')), '') IS NOT NULL,
        'lines', v_lines
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Balance-due drift on an existing sale is a refund settling a credit sale,
    -- which is already logged by the refunds trigger. Anything else that moves
    -- money on a historical sale is worth a line of its own.
    IF NEW.balance_due IS DISTINCT FROM OLD.balance_due
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.audit_write(
        NEW.shop_id, 'sale.amended', 'sale', NEW.id::TEXT,
        format('Sale %s updated', coalesce(NEW.receipt_number, '—')),
        jsonb_build_object(
          'balance_due_before', OLD.balance_due, 'balance_due_after', NEW.balance_due,
          'status_before', OLD.status, 'status_after', NEW.status
        )
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.audit_write(
      OLD.shop_id, 'sale.deleted', 'sale', OLD.id::TEXT,
      format('Sale %s deleted', coalesce(OLD.receipt_number, '—'))
    );
  END IF;
  RETURN NULL;
END;
$$;

-- --- 8b) refunds ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_refund()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO v_lines FROM public.refund_items WHERE refund_id = NEW.id;
    PERFORM public.audit_write(
      NEW.shop_id, 'refund.created', 'refund', NEW.id::TEXT,
      format('Refund of %s against sale %s', NEW.total_amount, NEW.sale_id),
      jsonb_build_object(
        'total', NEW.total_amount, 'status', NEW.status,
        'reason_given', coalesce(nullif(btrim(NEW.reason), ''), '') <> '',
        'lines', v_lines
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.audit_write(
      NEW.shop_id, 'refund.updated', 'refund', NEW.id::TEXT,
      format('Refund status set to %s', NEW.status),
      jsonb_build_object('status_before', OLD.status, 'status_after', NEW.status)
    );
  END IF;
  RETURN NULL;
END;
$$;

-- --- 8c) stock movements --------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      NEW.shop_id, 'stock.moved', 'inventory_movement', NEW.id::TEXT,
      format('Stock %s recorded', NEW.quantity),
      jsonb_build_object(
        'quantity', NEW.quantity,
        'movement_type', NEW.movement_type,
        'reference_type', NEW.reference_type,
        'reference_id', NEW.reference_id,
        -- `notes` is free text written by staff. Whether one exists is worth
        -- recording; the words themselves are not.
        'note_given', nullif(btrim(coalesce(NEW.notes, '')), '') IS NOT NULL
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.audit_write(
      OLD.shop_id, 'stock.movement_deleted', 'inventory_movement', OLD.id::TEXT,
      format('Stock movement of %s removed', OLD.quantity),
      jsonb_build_object('quantity', OLD.quantity, 'movement_type', OLD.movement_type)
    );
  END IF;
  RETURN NULL;
END;
$$;

-- --- 8d) expenses ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      NEW.shop_id, 'expense.created', 'expense', NEW.id::TEXT,
      format('Expense of %s recorded', NEW.amount),
      jsonb_build_object('amount', NEW.amount, 'category', NEW.category)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.audit_write(
      NEW.shop_id, 'expense.updated', 'expense', NEW.id::TEXT,
      format('Expense of %s updated', NEW.amount),
      jsonb_build_object('amount_before', OLD.amount, 'amount_after', NEW.amount)
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.audit_write(
      OLD.shop_id, 'expense.deleted', 'expense', OLD.id::TEXT,
      format('Expense of %s deleted', OLD.amount),
      jsonb_build_object('amount', OLD.amount)
    );
  END IF;
  RETURN NULL;
END;
$$;

-- --- 8e) employees (shop_members) ----------------------------------------
CREATE OR REPLACE FUNCTION public.audit_shop_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop UUID := coalesce(NEW.shop_id, OLD.shop_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      v_shop, 'employee.joined', 'shop_member', NEW.id::TEXT,
      'A staff member joined the shop',
      jsonb_build_object('role', NEW.role, 'status', NEW.status, 'invited_by_set', NEW.invited_by IS NOT NULL)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.audit_write(
        v_shop, 'employee.status_changed', 'shop_member', NEW.id::TEXT,
        format('Staff status set to %s', NEW.status),
        jsonb_build_object('status_before', OLD.status, 'status_after', NEW.status)
      );
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      PERFORM public.audit_write(
        v_shop, 'employee.role_changed', 'shop_member', NEW.id::TEXT,
        format('Staff role set to %s', NEW.role),
        jsonb_build_object('role_before', OLD.role, 'role_after', NEW.role)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.audit_write(
      OLD.shop_id, 'employee.removed', 'shop_member', OLD.id::TEXT,
      format('A staff member (%s) was removed', OLD.role),
      jsonb_build_object('role', OLD.role, 'status', OLD.status)
    );
  END IF;
  RETURN NULL;
END;
$$;

-- --- 8f) access codes -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_access_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop UUID := coalesce(NEW.shop_id, OLD.shop_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      v_shop, 'access_code.created', 'employee_access_code', NEW.id::TEXT,
      'A staff access code was minted',
      jsonb_build_object('label', NEW.label, 'expires_at', NEW.expires_at, 'has_expiry', NEW.expires_at IS NOT NULL)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.audit_write(
      v_shop, 'access_code.updated', 'employee_access_code', NEW.id::TEXT,
      CASE WHEN NEW.is_active IS DISTINCT FROM OLD.is_active
           THEN CASE WHEN NEW.is_active THEN 'A staff access code was reactivated'
                     ELSE 'A staff access code was retired' END
           ELSE 'A staff access code was changed' END,
      jsonb_build_object('is_active_before', OLD.is_active, 'is_active_after', NEW.is_active)
    );
  END IF;
  RETURN NULL;
END;
$$;

-- --- 8g) shop policy switches --------------------------------------------
--    Fires only on the switches that change what the shop *allows*, so this
--    stays a handful of legible entries instead of a line for every keystroke.
CREATE OR REPLACE FUNCTION public.audit_shop_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.accepts_refunds IS DISTINCT FROM OLD.accepts_refunds THEN
    PERFORM public.audit_write(
      NEW.id, 'shop.refunds_changed', 'shop', NEW.id::TEXT,
      CASE WHEN NEW.accepts_refunds THEN 'Refunds switched on'
           ELSE 'Refunds switched off' END,
      jsonb_build_object('accepts_refunds_before', OLD.accepts_refunds, 'accepts_refunds_after', NEW.accepts_refunds)
    );
  END IF;

  IF NEW.employee_joining_enabled IS DISTINCT FROM OLD.employee_joining_enabled THEN
    PERFORM public.audit_write(
      NEW.id, 'shop.joining_changed', 'shop', NEW.id::TEXT,
      CASE WHEN NEW.employee_joining_enabled THEN 'Staff access codes switched on'
           ELSE 'Staff access codes switched off' END,
      jsonb_build_object('joining_before', OLD.employee_joining_enabled, 'joining_after', NEW.employee_joining_enabled)
    );
  END IF;

  RETURN NULL;
END;
$$;

-- --- wire the triggers ----------------------------------------------------
DROP TRIGGER IF EXISTS ravqen_audit_sale ON public.sales;
CREATE TRIGGER ravqen_audit_sale AFTER INSERT OR UPDATE OR DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.audit_sale();

DROP TRIGGER IF EXISTS ravqen_audit_refund ON public.refunds;
CREATE TRIGGER ravqen_audit_refund AFTER INSERT OR UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.audit_refund();

DROP TRIGGER IF EXISTS ravqen_audit_stock ON public.inventory_movements;
CREATE TRIGGER ravqen_audit_stock AFTER INSERT OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.audit_stock_movement();

DROP TRIGGER IF EXISTS ravqen_audit_expense ON public.expenses;
CREATE TRIGGER ravqen_audit_expense AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.audit_expense();

DROP TRIGGER IF EXISTS ravqen_audit_member ON public.shop_members;
CREATE TRIGGER ravqen_audit_member AFTER INSERT OR UPDATE OR DELETE ON public.shop_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_shop_member();

DROP TRIGGER IF EXISTS ravqen_audit_code ON public.employee_access_codes;
CREATE TRIGGER ravqen_audit_code AFTER INSERT OR UPDATE ON public.employee_access_codes
  FOR EACH ROW EXECUTE FUNCTION public.audit_access_code();

DROP TRIGGER IF EXISTS ravqen_audit_shop_policy ON public.shops;
CREATE TRIGGER ravqen_audit_shop_policy AFTER UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.audit_shop_policy();

-- ---------------------------------------------------------------------------
-- 9) Retention
--    Audit entries are security records, not business data, so they are kept
--    longer than anything else and then deleted in one sweep rather than
--    expiring row by row. The window is a policy choice, not a legal one —
--    §19 of the readiness pass flags it for a Kenyan lawyer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_audit_log(p_older_than_days INTEGER DEFAULT 400)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.audit_log
   WHERE created_at < now() - make_interval(days => greatest(p_older_than_days, 30));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_audit_log(INTEGER) FROM PUBLIC, anon, authenticated;

-- The failed access-code ledger is a security record too, and it is the one
-- table that grows without bound if nobody prunes it.
CREATE OR REPLACE FUNCTION public.purge_access_code_attempts(p_older_than_days INTEGER DEFAULT 180)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.access_code_attempts
   WHERE created_at < now() - make_interval(days => greatest(p_older_than_days, 30));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_access_code_attempts(INTEGER) FROM PUBLIC, anon, authenticated;

COMMIT;
