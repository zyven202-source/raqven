-- 20261114120000_pith_comped_accounts.sql
--
-- Complimentary ("gold") accounts: people who get Pith Pro for life and are
-- never charged.
--
-- Why a table and not a list in the client: a hard-coded email in the bundle is
-- a suggestion — anyone can read it and nobody can revoke it. The list lives in
-- Postgres, in a schema the browser cannot reach, and the only thing an account
-- can learn is whether *its own* verified email is on it. There is no select
-- grant on the table at all, so one account cannot enumerate another's address.
--
-- Additive only: no existing table, policy or grant is changed.

create table if not exists app.comped_accounts (
  -- Stored lower-cased; the check makes that a rule rather than a convention,
  -- because a case-sensitive mismatch would silently start charging somebody.
  email      text primary key check (email = lower(email)),
  reason     text not null default 'complimentary',
  granted_at timestamptz not null default now()
);

alter table app.comped_accounts enable row level security;
revoke all on app.comped_accounts from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The only read path. Security definer because the caller has no grant on the
-- table; the function answers one question about one email — the one in the
-- caller's own JWT, which Supabase has already verified.
-- ---------------------------------------------------------------------------
create or replace function public.my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email  text;
  v_comped boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('email', null, 'comped', false, 'signed_in', false);
  end if;

  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  select exists (
    select 1 from app.comped_accounts c where c.email = v_email
  ) into v_comped;

  return jsonb_build_object(
    'email', v_email,
    'comped', coalesce(v_comped, false),
    'signed_in', true
  );
end;
$$;

revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- ---------------------------------------------------------------------------
-- The gold account. Deliberately inserted by migration so the grant is part of
-- the schema's history and survives a rebuild of any environment.
-- ---------------------------------------------------------------------------
insert into app.comped_accounts (email, reason)
values ('mahircade341@gmail.com', 'gold — complimentary for life')
on conflict (email) do nothing;
