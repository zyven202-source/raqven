-- 20261114140000_remove_subscription_billing.sql
--
-- SAVO is free: no subscription, no Pro plan, no paid gate.
--
-- This reverses the entitlement work that has just been removed from the app.
-- It is written with IF EXISTS throughout so it is safe on a database that
-- never saw those objects, and it restores the access-code function to its
-- ungated behaviour so adding staff works for every shop again.
--
-- Nothing belonging to a shop, a member or a sale is touched.

drop function if exists public.my_plan();
drop function if exists app.has_pro(uuid);

drop table if exists app.pro_entitlements;
drop table if exists app.comped_accounts;

-- ---------------------------------------------------------------------------
-- Staff access codes, ungated. This is the definition from
-- 20260928000500_ravqen_access_secrets.sql, kept here so applying the removal
-- also removes the gate from the function body.
-- ---------------------------------------------------------------------------
create or replace function public.create_employee_access_code(
  p_shop_id uuid,
  p_label   text,
  p_code    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_id    uuid;
  v_salt  text;
  v_plain text := upper(trim(coalesce(p_code, '')));
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_shop_owner(p_shop_id) then
    raise exception 'Only the shop owner can create access codes' using errcode = '42501';
  end if;

  if length(v_plain) < 6 then
    raise exception 'An access code needs at least 6 characters' using errcode = '22023';
  end if;

  v_salt := public.ensure_shop_access_salt(p_shop_id);

  -- Retiring first also clears the partial unique index, so a shop can never
  -- hold two live codes that both work.
  update public.employee_access_codes
     set is_active = false, updated_at = now()
   where shop_id = p_shop_id and member_id is null and is_active;

  insert into public.employee_access_codes (shop_id, member_id, label, code_hash, created_by)
       values (
         p_shop_id, null, coalesce(nullif(trim(p_label), ''), 'Staff access code'),
         encode(sha256((v_salt || ':' || v_plain)::bytea), 'hex'), v_user
       )
    returning id into v_id;

  return jsonb_build_object('code_id', v_id, 'label', p_label);
end;
$$;

revoke all on function public.create_employee_access_code(uuid, text, text) from public, anon;
grant execute on function public.create_employee_access_code(uuid, text, text) to authenticated;
