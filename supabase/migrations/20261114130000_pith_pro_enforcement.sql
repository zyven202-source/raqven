-- 20261114130000_pith_pro_enforcement.sql
--
-- Server-side Pro enforcement, starting with the least destructive paid
-- feature: adding staff accounts.
--
-- Why this shape. A browser cannot be trusted to say whether an account pays,
-- and RevenueCat's entitlement lives outside Postgres. So the database keeps
-- its own copy of the truth:
--
--   app.pro_entitlements  written ONLY by the RevenueCat webhook (service
--                         role), never by a client. One row per account.
--   app.has_pro()         the single question enforcement asks: is this
--                         account on the gold list, or does it hold an active
--                         entitlement? Comped accounts never depend on the
--                         store, so a gold account keeps working even if the
--                         webhook is not configured yet.
--
-- The gate is additive in the sense that matters: existing staff keep working,
-- existing codes keep redeeming, and nothing is deleted or hidden. Only the
-- creation of a *new* staff access code requires Pro.

create table if not exists app.pro_entitlements (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  active      boolean not null default false,
  product_id  text,
  expires_at  timestamptz,
  -- Where the row came from: 'revenuecat' from the webhook, 'manual' if an
  -- operator ever has to correct one by hand.
  source      text not null default 'revenuecat',
  updated_at  timestamptz not null default now()
);

alter table app.pro_entitlements enable row level security;

-- No client grant at all: the browser reads its status through my_plan(), and
-- only the service role (the webhook) may write a row.
revoke all on app.pro_entitlements from public, anon, authenticated;

create index if not exists pro_entitlements_active
  on app.pro_entitlements (user_id)
  where active;

-- ---------------------------------------------------------------------------
-- The single source of truth enforcement asks.
--
-- `security definer` because the caller has no grant on either table. It
-- answers only about the id it is given, and callers in this codebase only ever
-- pass `auth.uid()`.
-- ---------------------------------------------------------------------------
create or replace function app.has_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select true
      from app.comped_accounts c
      join auth.users u on u.id = p_user_id
      where c.email = lower(u.email)
      limit 1
    ), false)
    or
    coalesce((
      select true
      from app.pro_entitlements e
      where e.user_id = p_user_id
        and e.active
        and (e.expires_at is null or e.expires_at > now())
      limit 1
    ), false);
$$;

revoke all on function app.has_pro(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the account itself may know. Extended, not replaced in spirit: the
-- client previously asked only "am I comped?" and now asks "what is my plan?".
-- ---------------------------------------------------------------------------
create or replace function public.my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
  v_comped boolean := false;
  v_pro    boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object(
      'email', null, 'comped', false, 'pro', false, 'signed_in', false
    );
  end if;

  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  select exists (select 1 from app.comped_accounts c where c.email = v_email)
    into v_comped;

  v_pro := app.has_pro(v_uid);

  return jsonb_build_object(
    'email', v_email,
    'comped', coalesce(v_comped, false),
    'pro', coalesce(v_pro, false),
    'signed_in', true
  );
end;
$$;

revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- ---------------------------------------------------------------------------
-- The gate. Same function, same arguments, same behaviour for a Pro account;
-- a non-Pro account is refused before anything is written.
--
-- Regenerating an existing code is deliberately NOT gated: that is how a free
-- shop maintains the staff it already has, and taking it away would strand
-- people who are already working at the counter.
-- ---------------------------------------------------------------------------
create or replace function public.create_employee_access_code(
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
  v_user  UUID := auth.uid();
  v_id    UUID;
  v_salt  TEXT;
  v_plain TEXT := upper(trim(coalesce(p_code, '')));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_shop_owner(p_shop_id) THEN
    RAISE EXCEPTION 'Only the shop owner can create access codes' USING ERRCODE = '42501';
  END IF;

  -- Pro gate: staff accounts are the paid feature. The message is a stable
  -- marker the client maps to an upgrade prompt; it is not shown raw.
  IF NOT app.has_pro(v_user) THEN
    RAISE EXCEPTION 'PITH_PRO_REQUIRED: Adding staff accounts is a Pith Pro feature'
      USING ERRCODE = '42501';
  END IF;

  IF length(v_plain) < 6 THEN
    RAISE EXCEPTION 'An access code needs at least 6 characters' USING ERRCODE = '22023';
  END IF;

  v_salt := public.ensure_shop_access_salt(p_shop_id);

  -- Retiring first also clears the partial unique index, so a shop can never
  -- hold two live codes that both work.
  UPDATE public.employee_access_codes
     SET is_active = false, updated_at = now()
   WHERE shop_id = p_shop_id AND member_id IS NULL AND is_active;

  INSERT INTO public.employee_access_codes (shop_id, member_id, label, code_hash, created_by)
       VALUES (
         p_shop_id, NULL, COALESCE(NULLIF(trim(p_label), ''), 'Staff access code'),
         encode(sha256((v_salt || ':' || v_plain)::bytea), 'hex'), v_user
       )
    RETURNING id INTO v_id;

  RETURN jsonb_build_object('code_id', v_id, 'label', p_label);
END;
$$;

REVOKE ALL ON FUNCTION public.create_employee_access_code(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_employee_access_code(UUID, TEXT, TEXT) TO authenticated;
