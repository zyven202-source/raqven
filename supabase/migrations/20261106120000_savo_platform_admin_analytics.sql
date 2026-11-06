-- 20261106120000_savo_platform_admin_analytics.sql
--
-- Adds a platform-wide analytics capability and a database-owned platform
-- administrator role. Non-destructive: existing tables, rows, auth users,
-- shop ownership and business records are untouched.
--
-- Design notes
--   * Authorization lives in Postgres, not in the browser. Every admin read is a
--     SECURITY DEFINER function that re-checks app.require_platform_admin().
--   * The analytics tables themselves grant nothing to anon/authenticated; they
--     are reachable only through the functions below.
--   * Event names and the property keys an event may carry are allowlisted in
--     tables, so a client cannot write arbitrary text into the warehouse.
--   * Nothing here invents data. Every dashboard figure is aggregated from rows
--     that already exist (auth.users, shops, sales, ...) or from events the app
--     actually recorded.

create schema if not exists app;
create schema if not exists analytics;

-- ---------------------------------------------------------------------------
-- Platform administrator roster
-- ---------------------------------------------------------------------------

create table if not exists app.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  note       text
);

alter table app.platform_admins enable row level security;
revoke all on app.platform_admins from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Event catalogue (allowlist)
-- ---------------------------------------------------------------------------

create table if not exists app.analytics_event_names (
  name     text primary key,
  label    text not null,
  category text not null
);

revoke all on app.analytics_event_names from public, anon, authenticated;

insert into app.analytics_event_names (name, label, category) values
  ('app_opened',              'App opened',              'acquisition'),
  ('screen_viewed',           'Screen viewed',           'acquisition'),
  ('account_registered',      'Account registered',      'auth'),
  ('login_success',           'Signed in',               'auth'),
  ('logout',                  'Signed out',              'auth'),
  ('password_reset_requested','Password reset asked for','auth'),
  ('account_deleted',         'Account deleted',         'auth'),
  ('shop_created',            'Shop created',            'shop'),
  ('shop_updated',            'Shop updated',            'shop'),
  ('shop_logo_updated',       'Shop logo updated',       'shop'),
  ('employee_joined',         'Employee joined',         'shop'),
  ('transaction_completed',   'Sale completed',          'pos'),
  ('transaction_cancelled',   'Sale cancelled',          'pos'),
  ('receipt_generated',       'Receipt generated',       'pos'),
  ('refund_created',          'Refund created',          'pos'),
  ('product_created',         'Product created',         'inventory'),
  ('product_updated',         'Product updated',         'inventory'),
  ('product_archived',        'Product archived',        'inventory'),
  ('stock_added',             'Stock added',             'inventory'),
  ('stock_adjusted',          'Stock adjusted',          'inventory'),
  ('low_stock_detected',      'Low stock detected',      'inventory'),
  ('expense_created',         'Expense recorded',        'money'),
  ('expense_updated',         'Expense updated',         'money'),
  ('expense_deleted',         'Expense deleted',         'money'),
  ('debtor_record_created',   'Debtor record created',   'money'),
  ('debtor_payment_recorded', 'Debt repayment recorded', 'money'),
  ('debtor_reminder_initiated','Debt reminder initiated','money'),
  ('report_exported',         'Report exported',         'insights'),
  ('smart_insight_viewed',    'Smart insight viewed',    'insights'),
  ('activity_log_viewed',     'Activity log viewed',     'insights'),
  ('settings_updated',        'Settings updated',        'insights'),
  ('data_export_requested',   'Data export requested',   'insights')
on conflict (name) do nothing;

-- Property keys an event may carry. Anything else is dropped server-side.
create table if not exists app.analytics_property_keys (
  key text primary key
);

revoke all on app.analytics_property_keys from public, anon, authenticated;

insert into app.analytics_property_keys (key) values
  ('route'), ('items'), ('quantity'), ('role'), ('source'), ('reason'),
  ('count'), ('currency'), ('status'), ('offline'), ('screen'), ('tab')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Telemetry tables
-- ---------------------------------------------------------------------------

create table if not exists analytics.visitors (
  id              uuid primary key,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  platform        text,
  device_category text,
  app_version     text
);

create table if not exists analytics.sessions (
  id              uuid primary key default gen_random_uuid(),
  visitor_id      uuid not null references analytics.visitors (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete set null,
  started_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  ended_at        timestamptz,
  platform        text,
  device_category text,
  app_version     text
);

create table if not exists analytics.events (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references analytics.sessions (id) on delete cascade,
  visitor_id uuid not null references analytics.visitors (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete set null,
  shop_id    uuid references public.shops (id) on delete set null,
  event_name text not null references app.analytics_event_names (name),
  category   text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists analytics.errors (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid references analytics.sessions (id) on delete set null,
  user_id         uuid references auth.users (id) on delete set null,
  severity        text not null check (severity in ('warning', 'error', 'fatal')),
  category        text not null,
  message         text not null,
  route           text,
  app_version     text,
  correlation_id  uuid,
  created_at      timestamptz not null default now()
);

alter table analytics.visitors enable row level security;
alter table analytics.sessions enable row level security;
alter table analytics.events   enable row level security;
alter table analytics.errors   enable row level security;

revoke all on analytics.visitors from public, anon, authenticated;
revoke all on analytics.sessions from public, anon, authenticated;
revoke all on analytics.events   from public, anon, authenticated;
revoke all on analytics.errors   from public, anon, authenticated;

create index if not exists analytics_events_created_at on analytics.events (created_at desc);
create index if not exists analytics_events_name_time  on analytics.events (event_name, created_at desc);
create index if not exists analytics_events_user_time  on analytics.events (user_id, created_at desc) where user_id is not null;
create index if not exists analytics_events_shop_time  on analytics.events (shop_id, created_at desc) where shop_id is not null;
create index if not exists analytics_events_session    on analytics.events (session_id);
create index if not exists analytics_events_visitor    on analytics.events (visitor_id, created_at desc);
create index if not exists analytics_sessions_started  on analytics.sessions (started_at desc);
create index if not exists analytics_sessions_visitor  on analytics.sessions (visitor_id);
create index if not exists analytics_sessions_user     on analytics.sessions (user_id, started_at desc) where user_id is not null;
create index if not exists analytics_visitors_last_seen on analytics.visitors (last_seen_at desc);
create index if not exists analytics_errors_created    on analytics.errors (created_at desc);
create index if not exists analytics_errors_category   on analytics.errors (category, created_at desc);

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

create or replace function app.current_user_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.platform_admins a
    where a.user_id = auth.uid()
  );
$$;

create or replace function app.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.current_user_is_platform_admin() then
    raise exception 'forbidden: platform admin access required'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function app.sanitize_event_properties(p_props jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(kv.key, kv.value),
    '{}'::jsonb
  )
  from jsonb_each(coalesce(p_props, '{}'::jsonb)) as kv
  where kv.key in (select k.key from app.analytics_property_keys k)
    and jsonb_typeof(kv.value) in ('string', 'number', 'boolean')
    and length(kv.value #>> '{}') <= 120;
$$;

-- ---------------------------------------------------------------------------
-- Ingestion (callable by signed-out and signed-in visitors)
-- ---------------------------------------------------------------------------

create or replace function public.analytics_start_session(
  p_visitor_id  uuid,
  p_platform    text default 'web',
  p_device      text default null,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_recent     int;
begin
  if p_visitor_id is null then
    raise exception 'analytics_start_session: visitor id is required'
      using errcode = '22023';
  end if;

  insert into analytics.visitors as v (id, platform, device_category, app_version)
  values (p_visitor_id, p_platform, p_device, p_app_version)
  on conflict (id) do update
    set last_seen_at = now(),
        platform        = coalesce(excluded.platform, v.platform),
        device_category = coalesce(excluded.device_category, v.device_category),
        app_version     = coalesce(excluded.app_version, v.app_version);

  -- Reuse the open session for this visitor when one exists.
  select s.id into v_session_id
  from analytics.sessions s
  where s.visitor_id = p_visitor_id
    and s.ended_at is null
  order by s.started_at desc
  limit 1;

  if v_session_id is not null then
    update analytics.sessions
       set last_seen_at = now(),
           user_id = coalesce(auth.uid(), user_id)
     where id = v_session_id;
    return v_session_id;
  end if;

  -- Cap session creation per visitor so a looping client cannot inflate visits.
  select count(*) into v_recent
  from analytics.sessions s
  where s.visitor_id = p_visitor_id
    and s.started_at > now() - interval '1 hour';

  if v_recent >= 20 then
    select s.id into v_session_id
    from analytics.sessions s
    where s.visitor_id = p_visitor_id
    order by s.started_at desc
    limit 1;
    return v_session_id;
  end if;

  insert into analytics.sessions (visitor_id, user_id, platform, device_category, app_version)
  values (p_visitor_id, auth.uid(), p_platform, p_device, p_app_version)
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.analytics_track_event(
  p_session_id uuid,
  p_event_name text,
  p_shop_id    uuid default null,
  p_props      jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session   analytics.sessions%rowtype;
  v_category  text;
  v_shop_id   uuid;
  v_count     int;
begin
  if p_session_id is null or p_event_name is null then
    return false;
  end if;

  select * into v_session
  from analytics.sessions s
  where s.id = p_session_id;

  if not found then
    return false;
  end if;

  -- A session idle for more than two hours is over; it must be restarted.
  if v_session.last_seen_at < now() - interval '2 hours' then
    return false;
  end if;

  select n.category into v_category
  from app.analytics_event_names n
  where n.name = p_event_name;

  if v_category is null then
    return false;
  end if;

  -- Shop attribution is only accepted for a shop the caller actually belongs to.
  if p_shop_id is not null and public.is_shop_member(p_shop_id) then
    v_shop_id := p_shop_id;
  end if;

  -- Collapse duplicate events emitted by a re-render within the same second.
  select count(*) into v_count
  from analytics.events e
  where e.session_id = p_session_id
    and e.event_name = p_event_name
    and e.created_at > now() - interval '2 seconds';

  if v_count > 0 then
    return false;
  end if;

  -- Per-session ceiling, so a broken client cannot flood the stream.
  select count(*) into v_count
  from analytics.events e
  where e.session_id = p_session_id
    and e.created_at > now() - interval '1 hour';

  if v_count >= 400 then
    return false;
  end if;

  insert into analytics.events (
    session_id, visitor_id, user_id, shop_id, event_name, category, properties
  ) values (
    p_session_id, v_session.visitor_id, auth.uid(), v_shop_id, p_event_name,
    v_category, app.sanitize_event_properties(p_props)
  );

  update analytics.sessions
     set last_seen_at = now(),
         user_id = coalesce(auth.uid(), user_id)
   where id = p_session_id;

  update analytics.visitors
     set last_seen_at = now()
   where id = v_session.visitor_id;

  return true;
end;
$$;

create or replace function public.analytics_end_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update analytics.sessions s
     set ended_at = now()
   where s.id = p_session_id
     and s.ended_at is null
     and (s.user_id is null or s.user_id = auth.uid());
end;
$$;

create or replace function public.analytics_record_error(
  p_session_id     uuid,
  p_severity       text,
  p_category       text,
  p_message        text,
  p_route          text default null,
  p_app_version    text default null,
  p_correlation_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if p_message is null or length(trim(p_message)) = 0 then
    return false;
  end if;

  if p_severity not in ('warning', 'error', 'fatal') then
    return false;
  end if;

  select s.id into v_session_id
  from analytics.sessions s
  where s.id = p_session_id
    and s.last_seen_at > now() - interval '2 hours';

  insert into analytics.errors (
    session_id, user_id, severity, category, message, route, app_version, correlation_id
  ) values (
    v_session_id, auth.uid(), p_severity,
    left(coalesce(nullif(trim(p_category), ''), 'client'), 40),
    left(trim(p_message), 500),
    left(p_route, 120), left(p_app_version, 40), p_correlation_id
  );

  return true;
end;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.current_user_is_platform_admin();
$$;

-- ---------------------------------------------------------------------------
-- Admin-only reads
-- ---------------------------------------------------------------------------

create or replace function public.admin_analytics_overview(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to   timestamptz;
begin
  perform app.require_platform_admin();

  if p_from is null or p_to is null then
    raise exception 'admin_analytics_overview: a date range is required'
      using errcode = '22023';
  end if;
  if p_to < p_from then
    raise exception 'admin_analytics_overview: the end date is before the start date'
      using errcode = '22023';
  end if;
  if (p_to - p_from) > 366 then
    raise exception 'admin_analytics_overview: the range is limited to 366 days'
      using errcode = '22023';
  end if;

  v_from := p_from::timestamptz;
  v_to   := (p_to + 1)::timestamptz;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,

    'users', jsonb_build_object(
      'total',       (select count(*) from auth.users u),
      'new_today',   (select count(*) from auth.users u where u.created_at >= current_date),
      'new_7d',      (select count(*) from auth.users u where u.created_at >= now() - interval '7 days'),
      'new_30d',     (select count(*) from auth.users u where u.created_at >= now() - interval '30 days'),
      'new_in_range',(select count(*) from auth.users u where u.created_at >= v_from and u.created_at < v_to)
    ),

    'shops', jsonb_build_object(
      'total',      (select count(*) from public.shops s),
      'active',     (select count(*) from public.shops s where s.is_active),
      'new_in_range',(select count(*) from public.shops s where s.created_at >= v_from and s.created_at < v_to),
      'selling',    (select count(distinct sa.shop_id) from public.sales sa
                      where sa.sold_at >= v_from and sa.sold_at < v_to)
    ),

    'audience', jsonb_build_object(
      'visits', (select count(*) from analytics.sessions s
                  where s.started_at >= v_from and s.started_at < v_to),
      'unique_visitors', (select count(*) from analytics.visitors v
                           where v.last_seen_at >= v_from and v.last_seen_at < v_to),
      'new_visitors', (select count(*) from analytics.visitors v
                        where v.first_seen_at >= v_from and v.first_seen_at < v_to),
      'returning_visitors', (select count(*) from analytics.visitors v
                              where v.first_seen_at < v_from
                                and v.last_seen_at >= v_from
                                and v.last_seen_at < v_to),
      'screens_viewed', (select count(*) from analytics.events e
                          where e.event_name = 'screen_viewed'
                            and e.created_at >= v_from and e.created_at < v_to),
      'avg_session_seconds', coalesce((
        select round(avg(extract(epoch from (coalesce(s.ended_at, s.last_seen_at) - s.started_at))))::int
        from analytics.sessions s
        where s.started_at >= v_from and s.started_at < v_to
      ), 0)
    ),

    'active_users', jsonb_build_object(
      'dau', (select count(distinct e.user_id) from analytics.events e
               where e.user_id is not null and e.created_at >= now() - interval '1 day'),
      'wau', (select count(distinct e.user_id) from analytics.events e
               where e.user_id is not null and e.created_at >= now() - interval '7 days'),
      'mau', (select count(distinct e.user_id) from analytics.events e
               where e.user_id is not null and e.created_at >= now() - interval '30 days'),
      'in_range', (select count(distinct e.user_id) from analytics.events e
                    where e.user_id is not null
                      and e.created_at >= v_from and e.created_at < v_to)
    ),

    'business', jsonb_build_object(
      'sales_count', (select count(*) from public.sales sa
                       where sa.sold_at >= v_from and sa.sold_at < v_to
                         and sa.status = 'completed'),
      'sales_total', (select coalesce(sum(sa.total_amount), 0) from public.sales sa
                       where sa.sold_at >= v_from and sa.sold_at < v_to
                         and sa.status = 'completed'),
      'refunds_count', (select count(*) from public.refunds r
                         where r.created_at >= v_from and r.created_at < v_to),
      'expenses_total', (select coalesce(sum(ex.amount), 0) from public.expenses ex
                          where ex.spent_at >= v_from and ex.spent_at < v_to),
      'debtor_payments_total', (select coalesce(sum(dp.amount), 0) from public.debtor_payments dp
                                 where dp.paid_at >= v_from and dp.paid_at < v_to),
      'products_created', (select count(*) from public.products p
                            where p.created_at >= v_from and p.created_at < v_to),
      'stock_moves', (select count(*) from public.inventory_movements im
                       where im.created_at >= v_from and im.created_at < v_to),
      'debtors_created', (select count(*) from public.debtors d
                           where d.created_at >= v_from and d.created_at < v_to),
      'expenses_count', (select count(*) from public.expenses ex
                          where ex.spent_at >= v_from and ex.spent_at < v_to)
    ),

    'events', jsonb_build_object(
      'total', (select count(*) from analytics.events e
                 where e.created_at >= v_from and e.created_at < v_to),
      'by_name', coalesce((
        select jsonb_agg(jsonb_build_object(
          'event', t.event_name,
          'label', t.label,
          'category', t.category,
          'count', t.c,
          'users', t.u
        ) order by t.c desc)
        from (
          select e.event_name,
                 coalesce(n.label, e.event_name) as label,
                 e.category,
                 count(*) as c,
                 count(distinct e.user_id) as u
          from analytics.events e
          left join app.analytics_event_names n on n.name = e.event_name
          where e.created_at >= v_from and e.created_at < v_to
          group by e.event_name, n.label, e.category
        ) t
      ), '[]'::jsonb),
      'by_category', coalesce((
        select jsonb_agg(jsonb_build_object('category', t.category, 'count', t.c) order by t.c desc)
        from (
          select e.category, count(*) as c
          from analytics.events e
          where e.created_at >= v_from and e.created_at < v_to
          group by e.category
        ) t
      ), '[]'::jsonb)
    ),

    'screens', coalesce((
      select jsonb_agg(jsonb_build_object('route', t.route, 'views', t.c) order by t.c desc)
      from (
        select coalesce(e.properties->>'route', 'unknown') as route, count(*) as c
        from analytics.events e
        where e.event_name = 'screen_viewed'
          and e.created_at >= v_from and e.created_at < v_to
        group by 1
        order by 2 desc
        limit 15
      ) t
    ), '[]'::jsonb),

    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', to_char(d.day, 'YYYY-MM-DD'),
        'visits', (select count(*) from analytics.sessions s
                    where s.started_at >= d.day and s.started_at < d.day + interval '1 day'),
        'visitors', (select count(*) from analytics.visitors v
                      where v.last_seen_at >= d.day and v.last_seen_at < d.day + interval '1 day'),
        'events', (select count(*) from analytics.events e
                    where e.created_at >= d.day and e.created_at < d.day + interval '1 day'),
        'sales', (select count(*) from public.sales sa
                   where sa.sold_at >= d.day and sa.sold_at < d.day + interval '1 day'
                     and sa.status = 'completed'),
        'signups', (select count(*) from auth.users u
                     where u.created_at >= d.day and u.created_at < d.day + interval '1 day')
      ) order by d.day)
      from generate_series(v_from, v_to - interval '1 day', interval '1 day') as d(day)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_activity_feed(
  p_limit       int default 50,
  p_offset      int default 0,
  p_event_names text[] default null,
  p_search      text default null,
  p_from        timestamptz default null,
  p_to          timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_total bigint;
begin
  perform app.require_platform_admin();

  select count(*) into v_total
  from analytics.events e
  left join public.profiles p on p.id = e.user_id
  left join public.shops s on s.id = e.shop_id
  where (p_event_names is null or e.event_name = any(p_event_names))
    and (p_from is null or e.created_at >= p_from)
    and (p_to is null or e.created_at < p_to)
    and (
      p_search is null
      or p_search = ''
      or e.event_name ilike '%' || p_search || '%'
      or coalesce(s.name, '') ilike '%' || p_search || '%'
      or coalesce(p.full_name, '') ilike '%' || p_search || '%'
    );

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_rows
  from (
    select
      e.id,
      e.created_at as occurred_at,
      e.event_name as event,
      coalesce(n.label, e.event_name) as title,
      e.category,
      case when e.user_id is null then null
           else coalesce(p.full_name, 'User ' || left(e.user_id::text, 8)) end as actor,
      s.name as shop,
      e.properties->>'route' as route,
      e.properties as details
    from analytics.events e
    left join app.analytics_event_names n on n.name = e.event_name
    left join public.profiles p on p.id = e.user_id
    left join public.shops s on s.id = e.shop_id
    where (p_event_names is null or e.event_name = any(p_event_names))
      and (p_from is null or e.created_at >= p_from)
      and (p_to is null or e.created_at < p_to)
      and (
        p_search is null
        or p_search = ''
        or e.event_name ilike '%' || p_search || '%'
        or coalesce(s.name, '') ilike '%' || p_search || '%'
        or coalesce(p.full_name, '') ilike '%' || p_search || '%'
      )
    order by e.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create or replace function public.admin_error_feed(
  p_limit    int default 50,
  p_offset   int default 0,
  p_severity text default null,
  p_category text default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_total bigint;
begin
  perform app.require_platform_admin();

  select count(*) into v_total
  from analytics.errors er
  where (p_severity is null or er.severity = p_severity)
    and (p_category is null or er.category = p_category)
    and (p_from is null or er.created_at >= p_from)
    and (p_to is null or er.created_at < p_to);

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_rows
  from (
    select
      er.id,
      er.created_at as occurred_at,
      er.severity,
      er.category,
      er.message,
      er.route,
      er.app_version,
      case when er.user_id is null then null
           else coalesce(p.full_name, 'User ' || left(er.user_id::text, 8)) end as actor
    from analytics.errors er
    left join public.profiles p on p.id = er.user_id
    where (p_severity is null or er.severity = p_severity)
      and (p_category is null or er.category = p_category)
      and (p_from is null or er.created_at >= p_from)
      and (p_to is null or er.created_at < p_to)
    order by er.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) t;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create or replace function app.csv_cell(value text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select '"' || replace(coalesce(value, ''), '"', '""') || '"';
$$;

create or replace function public.admin_export_activity_csv(
  p_from        timestamptz,
  p_to          timestamptz,
  p_event_names text[] default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_csv text;
begin
  perform app.require_platform_admin();

  if p_from is null or p_to is null then
    raise exception 'admin_export_activity_csv: a time range is required'
      using errcode = '22023';
  end if;

  select 'occurred_at,event,category,title,actor,shop,route' || coalesce(E'\n' || string_agg(line, E'\n'), '')
    into v_csv
  from (
    select format(
      '%s,%s,%s,%s,%s,%s,%s',
      to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      app.csv_cell(e.event_name),
      app.csv_cell(e.category),
      app.csv_cell(coalesce(n.label, e.event_name)),
      app.csv_cell(coalesce(p.full_name, '')),
      app.csv_cell(coalesce(s.name, '')),
      app.csv_cell(coalesce(e.properties->>'route', ''))
    ) as line
    from analytics.events e
    left join app.analytics_event_names n on n.name = e.event_name
    left join public.profiles p on p.id = e.user_id
    left join public.shops s on s.id = e.shop_id
    where e.created_at >= p_from
      and e.created_at < p_to
      and (p_event_names is null or e.event_name = any(p_event_names))
    order by e.created_at desc
    limit 20000
  ) rows;

  return v_csv;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.analytics_start_session(uuid, text, text, text) from public;
revoke all on function public.analytics_track_event(uuid, text, uuid, jsonb) from public;
revoke all on function public.analytics_end_session(uuid) from public;
revoke all on function public.analytics_record_error(uuid, text, text, text, text, text, uuid) from public;
revoke all on function public.is_platform_admin() from public;
revoke all on function public.admin_analytics_overview(date, date) from public;
revoke all on function public.admin_activity_feed(int, int, text[], text, timestamptz, timestamptz) from public;
revoke all on function public.admin_error_feed(int, int, text, text, timestamptz, timestamptz) from public;
revoke all on function public.admin_export_activity_csv(timestamptz, timestamptz, text[]) from public;

grant execute on function public.analytics_start_session(uuid, text, text, text) to anon, authenticated;
grant execute on function public.analytics_track_event(uuid, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.analytics_end_session(uuid) to anon, authenticated;
grant execute on function public.analytics_record_error(uuid, text, text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.is_platform_admin() to authenticated;

grant execute on function public.admin_analytics_overview(date, date) to authenticated;
grant execute on function public.admin_activity_feed(int, int, text[], text, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_error_feed(int, int, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_export_activity_csv(timestamptz, timestamptz, text[]) to authenticated;
