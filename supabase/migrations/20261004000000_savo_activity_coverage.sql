-- =====================================================================================
-- SAVO activity-log coverage
--
-- The audit log already follows sales, refunds, stock, expenses, staff changes
-- and shop policy switches. Three gaps this closes, all in the same spirit:
--
--   1. A debtor account being opened was invisible to the log.
--   2. A repayment against a debtor was invisible to the log — the single most
--      common money event after a sale, and the one an owner most needs to be
--      able to check after the fact.
--   3. Every successful access-code redemption rewrote `last_used_at`, which
--      fired the access-code trigger and logged a misleading
--      "access code was changed" line. The trigger now ignores updates that
--      only touch usage bookkeeping, so the log carries real changes only.
--
-- Like every audit function here: SECURITY DEFINER (runs as the table owner,
-- invisible to direct clients), takes the actor from auth.uid(), writes only
-- through audit_write (which strips personal data and skips shops that no
-- longer exist), and returns NULL so the triggering row is untouched.
-- =====================================================================================

-- --- 1) debtor accounts opened ---------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_debtor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      NEW.shop_id, 'debtor.created', 'debtor', NEW.id::TEXT,
      'A debtor account was opened',
      jsonb_build_object('has_phone', NEW.phone IS NOT NULL)
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS savo_audit_debtor ON public.debtors;
CREATE TRIGGER savo_audit_debtor AFTER INSERT ON public.debtors
  FOR EACH ROW EXECUTE FUNCTION public.audit_debtor();

-- --- 2) repayments recorded ------------------------------------------------
-- debtor_payments has no UPDATE/DELETE grants, so INSERT is the only event
-- that can ever fire this.
CREATE OR REPLACE FUNCTION public.audit_debtor_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      NEW.shop_id, 'debtor.payment_recorded', 'debtor_payment', NEW.id::TEXT,
      format('Payment of %s recorded against a debtor', NEW.amount),
      jsonb_build_object(
        'amount', NEW.amount,
        'method', NEW.method,
        'reference_given', NEW.reference IS NOT NULL,
        'debtor_id', NEW.debtor_id,
        'sale_id', NEW.sale_id
      )
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS savo_audit_debtor_payment ON public.debtor_payments;
CREATE TRIGGER savo_audit_debtor_payment AFTER INSERT ON public.debtor_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_debtor_payment();

-- --- 3) access codes: log real changes, not usage bookkeeping --------------
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
    -- Redemption rewrites last_used_at on every success. An update that moves
    -- only usage timestamps is not a change to the code, and logging it as
    -- one buries the entries that matter.
    IF NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.label IS DISTINCT FROM OLD.label
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.code_hash IS DISTINCT FROM OLD.code_hash THEN
      PERFORM public.audit_write(
        v_shop, 'access_code.updated', 'employee_access_code', NEW.id::TEXT,
        CASE WHEN NEW.is_active IS DISTINCT FROM OLD.is_active
             THEN CASE WHEN NEW.is_active THEN 'A staff access code was reactivated'
                       ELSE 'A staff access code was retired' END
             ELSE 'A staff access code was changed' END,
        jsonb_build_object('is_active_before', OLD.is_active, 'is_active_after', NEW.is_active)
      );
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
