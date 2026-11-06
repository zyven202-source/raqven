-- 20261106150000_savo_ai_usage_and_knowledge.sql
--
-- Support tables for SAVO AI. Additive only: nothing here touches existing
-- shop data, and no existing grant or policy is changed.
--
--   app.ai_usage      per-account daily request/token counter. The AI edge
--                     function calls app.ai_consume() before every provider
--                     request, so a single account cannot drain the shared
--                     Groq quota. Rows contain counts only — never prompts,
--                     replies, shop data or conversation history.
--   app.ai_knowledge  editable help content the assistant quotes. Seeded from
--                     the same verified copy that ships in the function, and
--                     overridable by the platform admin at runtime.

create table if not exists app.ai_usage (
  user_id         uuid not null references auth.users (id) on delete cascade,
  day             date not null default current_date,
  requests        integer not null default 0,
  input_tokens    bigint not null default 0,
  output_tokens   bigint not null default 0,
  last_request_at timestamptz,
  primary key (user_id, day)
);

alter table app.ai_usage enable row level security;
revoke all on app.ai_usage from public, anon, authenticated;

create index if not exists ai_usage_day on app.ai_usage (day desc);

create table if not exists app.ai_knowledge (
  slug        text primary key,
  title       text not null,
  body        text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

alter table app.ai_knowledge enable row level security;
revoke all on app.ai_knowledge from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Quota gate, called only by the edge function (service role) with the caller's
-- user id resolved from a verified JWT. Not callable from a browser.
-- ---------------------------------------------------------------------------

create or replace function app.ai_consume(
  p_user_id uuid,
  p_requests integer default 1,
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_request_limit integer default 80,
  p_token_limit bigint default 120000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requests integer;
  v_tokens bigint;
begin
  if p_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_user');
  end if;

  insert into app.ai_usage as u (user_id, day, requests, input_tokens, output_tokens, last_request_at)
  values (p_user_id, current_date, greatest(p_requests, 0), greatest(p_input_tokens, 0), greatest(p_output_tokens, 0), now())
  on conflict (user_id, day) do update
    set requests        = u.requests + greatest(excluded.requests, 0),
        input_tokens    = u.input_tokens + greatest(excluded.input_tokens, 0),
        output_tokens   = u.output_tokens + greatest(excluded.output_tokens, 0),
        last_request_at = now()
  returning requests, input_tokens + output_tokens into v_requests, v_tokens;

  return jsonb_build_object(
    'allowed', v_requests <= p_request_limit and v_tokens <= p_token_limit,
    'requests', v_requests,
    'request_limit', p_request_limit,
    'tokens', v_tokens,
    'token_limit', p_token_limit
  );
end;
$$;

revoke all on function app.ai_consume(uuid, integer, bigint, bigint, integer, bigint) from public, anon, authenticated;

-- The edge function reaches PostgREST, which only exposes `public`. These two
-- wrappers are the service-role seam: executable by service_role only, never by
-- a browser, and they expose nothing beyond the counter and help text.
create or replace function public.ai_consume_quota(
  p_user_id uuid,
  p_requests integer default 1,
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_request_limit integer default 80,
  p_token_limit bigint default 120000
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.ai_consume(p_user_id, p_requests, p_input_tokens, p_output_tokens, p_request_limit, p_token_limit);
$$;

create or replace function public.ai_knowledge_overrides()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('slug', k.slug, 'title', k.title, 'body', k.body) order by k.slug),
    '[]'::jsonb
  )
  from app.ai_knowledge k;
$$;

revoke all on function public.ai_consume_quota(uuid, integer, bigint, bigint, integer, bigint) from public, anon, authenticated;
revoke all on function public.ai_knowledge_overrides() from public, anon, authenticated;
grant execute on function public.ai_consume_quota(uuid, integer, bigint, bigint, integer, bigint) to service_role;
grant execute on function public.ai_knowledge_overrides() to service_role;

-- ---------------------------------------------------------------------------
-- Admin-only operational view + knowledge editing
-- ---------------------------------------------------------------------------

create or replace function public.admin_ai_usage(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();

  return jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 365)),
    'total_requests', (
      select coalesce(sum(u.requests), 0) from app.ai_usage u
      where u.day >= current_date - greatest(1, least(coalesce(p_days, 30), 365))
    ),
    'total_tokens', (
      select coalesce(sum(u.input_tokens + u.output_tokens), 0) from app.ai_usage u
      where u.day >= current_date - greatest(1, least(coalesce(p_days, 30), 365))
    ),
    'accounts_today', (
      select count(*) from app.ai_usage u where u.day = current_date and u.requests > 0
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', to_char(u.day, 'YYYY-MM-DD'),
        'requests', u.requests,
        'tokens', u.tokens
      ) order by u.day)
      from (
        select day, sum(requests) as requests, sum(input_tokens + output_tokens) as tokens
        from app.ai_usage
        where day >= current_date - greatest(1, least(coalesce(p_days, 30), 365))
        group by day
      ) u
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_list_knowledge()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', k.slug,
      'title', k.title,
      'body', k.body,
      'updated_at', k.updated_at
    ) order by k.slug)
    from app.ai_knowledge k
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_knowledge(
  p_slug text,
  p_title text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();

  if p_slug is null or length(trim(p_slug)) = 0 then
    raise exception 'admin_set_knowledge: a slug is required' using errcode = '22023';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'admin_set_knowledge: body text is required' using errcode = '22023';
  end if;

  insert into app.ai_knowledge as k (slug, title, body, updated_at, updated_by)
  values (left(trim(p_slug), 60), left(coalesce(p_title, trim(p_slug)), 120), left(p_body, 8000), now(), auth.uid())
  on conflict (slug) do update
    set title = excluded.title,
        body = excluded.body,
        updated_at = now(),
        updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.admin_ai_usage(integer) from public, anon;
revoke all on function public.admin_list_knowledge() from public, anon;
revoke all on function public.admin_set_knowledge(text, text, text) from public, anon;

grant execute on function public.admin_ai_usage(integer) to authenticated;
grant execute on function public.admin_list_knowledge() to authenticated;
grant execute on function public.admin_set_knowledge(text, text, text) to authenticated;
