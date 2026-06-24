-- Tripo 공용 사용 관리 툴 v2
-- 기존 테이블은 삭제하지 않습니다.
-- 브라우저는 publishable key만 사용하며 모든 쓰기/조회는 검증 RPC를 통합니다.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.tripo_v2_members (
  id uuid primary key,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  team_name text not null check (team_name in ('1팀','2팀','3팀','4팀','선생님')),
  enabled boolean not null default true,
  link_code_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tripo_v2_installations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.tripo_v2_members(id) on delete cascade,
  install_id text not null unique,
  install_secret_hash text not null,
  browser_name text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tripo_v2_shared_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.tripo_v2_members(id),
  install_id text not null,
  room_code text not null,
  baseline_tripo_login_id text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason in ('manual_off','account_changed','browser_closed','disabled','error'))
);

create table if not exists public.tripo_v2_usage_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.tripo_v2_members(id),
  shared_session_id uuid references public.tripo_v2_shared_sessions(id),
  display_name_snapshot text not null,
  usage_amount numeric not null check (usage_amount >= 0),
  action_type text not null,
  shared_mode_enabled boolean not null,
  baseline_tripo_login_id text,
  actual_tripo_login_id text,
  account_match boolean,
  blocked boolean not null default false,
  browser_name text,
  install_id text not null,
  source text not null default 'button_click',
  account_verified boolean not null default true,
  user_verified boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tripo_v2_account_mismatch_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.tripo_v2_members(id),
  shared_session_id uuid references public.tripo_v2_shared_sessions(id),
  baseline_tripo_login_id text,
  actual_tripo_login_id text,
  attempted_action text not null,
  browser_name text,
  install_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tripo_v2_credit_state (
  room_code text primary key,
  current_credit integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.tripo_v2_migrations (
  migration_id uuid primary key,
  member_id uuid not null references public.tripo_v2_members(id),
  install_id text not null,
  migrated_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tripo_v2_members enable row level security;
alter table public.tripo_v2_installations enable row level security;
alter table public.tripo_v2_shared_sessions enable row level security;
alter table public.tripo_v2_usage_records enable row level security;
alter table public.tripo_v2_account_mismatch_logs enable row level security;
alter table public.tripo_v2_credit_state enable row level security;
alter table public.tripo_v2_migrations enable row level security;

revoke all on public.tripo_v2_members from anon, authenticated;
revoke all on public.tripo_v2_installations from anon, authenticated;
revoke all on public.tripo_v2_shared_sessions from anon, authenticated;
revoke all on public.tripo_v2_usage_records from anon, authenticated;
revoke all on public.tripo_v2_account_mismatch_logs from anon, authenticated;
revoke all on public.tripo_v2_credit_state from anon, authenticated;
revoke all on public.tripo_v2_migrations from anon, authenticated;

create or replace function public.tripo_v2_verify_install(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tripo_v2_installations i
    join public.tripo_v2_members m on m.id = i.member_id
    where i.member_id = p_member_id
      and i.install_id = p_install_id
      and i.install_secret_hash = encode(extensions.digest(convert_to(p_install_secret, 'UTF8'), 'sha256'), 'hex')
      and i.enabled
      and m.enabled
  );
$$;

create or replace function public.tripo_v2_register_member(
  p_member_id uuid,
  p_display_name text,
  p_team_name text,
  p_install_id text,
  p_install_secret text,
  p_browser_name text
)
returns table(member_id uuid, display_name text, team_name text, link_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link_code text := upper(substr(encode(extensions.gen_random_bytes(12), 'hex'), 1, 16));
begin
  insert into public.tripo_v2_members(id, display_name, team_name, link_code_hash)
  values (
    p_member_id,
    btrim(p_display_name),
    p_team_name,
    encode(extensions.digest(convert_to(v_link_code, 'UTF8'), 'sha256'), 'hex')
  );

  insert into public.tripo_v2_installations(
    member_id, install_id, install_secret_hash, browser_name
  )
  values (
    p_member_id,
    p_install_id,
    encode(extensions.digest(convert_to(p_install_secret, 'UTF8'), 'sha256'), 'hex'),
    p_browser_name
  );

  return query select p_member_id, btrim(p_display_name), p_team_name, v_link_code;
end;
$$;

create or replace function public.tripo_v2_link_install(
  p_member_id uuid,
  p_link_code text,
  p_install_id text,
  p_install_secret text,
  p_browser_name text
)
returns table(member_id uuid, display_name text, team_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tripo_v2_members m
    where m.id = p_member_id
      and m.enabled
      and m.link_code_hash = encode(extensions.digest(convert_to(upper(btrim(p_link_code)), 'UTF8'), 'sha256'), 'hex')
  ) then
    raise exception 'invalid member link code';
  end if;

  insert into public.tripo_v2_installations(
    member_id, install_id, install_secret_hash, browser_name
  )
  values (
    p_member_id,
    p_install_id,
    encode(extensions.digest(convert_to(p_install_secret, 'UTF8'), 'sha256'), 'hex'),
    p_browser_name
  );

  return query
  select m.id, m.display_name, m.team_name
  from public.tripo_v2_members m
  where m.id = p_member_id;
end;
$$;

create or replace function public.tripo_v2_start_session(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text,
  p_baseline_login_id text,
  p_room_code text,
  p_browser_name text
)
returns table(session_id uuid, started_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_started timestamptz := now();
begin
  if not public.tripo_v2_verify_install(p_member_id,p_install_id,p_install_secret) then
    raise exception 'invalid installation';
  end if;

  insert into public.tripo_v2_shared_sessions(
    member_id, install_id, room_code, baseline_tripo_login_id, started_at
  )
  values (p_member_id,p_install_id,p_room_code,lower(btrim(p_baseline_login_id)),v_started)
  returning id into v_id;

  return query select v_id, v_started;
end;
$$;

create or replace function public.tripo_v2_end_session(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text,
  p_session_id uuid,
  p_end_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tripo_v2_verify_install(p_member_id,p_install_id,p_install_secret) then
    raise exception 'invalid installation';
  end if;

  update public.tripo_v2_shared_sessions
  set ended_at = coalesce(ended_at, now()),
      end_reason = coalesce(end_reason, p_end_reason)
  where id = p_session_id
    and member_id = p_member_id
    and install_id = p_install_id;
end;
$$;

create or replace function public.tripo_v2_record_usage(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text,
  p_session_id uuid,
  p_display_name_snapshot text,
  p_usage_amount numeric,
  p_action_type text,
  p_shared_mode_enabled boolean,
  p_baseline_login_id text,
  p_actual_login_id text,
  p_account_match boolean,
  p_blocked boolean,
  p_browser_name text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.tripo_v2_verify_install(p_member_id,p_install_id,p_install_secret) then
    raise exception 'invalid installation';
  end if;
  if not p_shared_mode_enabled or not p_account_match or p_blocked then
    raise exception 'invalid normal usage record';
  end if;

  insert into public.tripo_v2_usage_records(
    member_id, shared_session_id, display_name_snapshot, usage_amount,
    action_type, shared_mode_enabled, baseline_tripo_login_id,
    actual_tripo_login_id, account_match, blocked, browser_name,
    install_id, source
  )
  values (
    p_member_id,p_session_id,p_display_name_snapshot,p_usage_amount,
    p_action_type,true,lower(p_baseline_login_id),lower(p_actual_login_id),
    true,false,p_browser_name,p_install_id,p_source
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.tripo_v2_log_mismatch(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text,
  p_session_id uuid,
  p_baseline_login_id text,
  p_actual_login_id text,
  p_attempted_action text,
  p_browser_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.tripo_v2_verify_install(p_member_id,p_install_id,p_install_secret) then
    raise exception 'invalid installation';
  end if;

  insert into public.tripo_v2_account_mismatch_logs(
    member_id, shared_session_id, baseline_tripo_login_id,
    actual_tripo_login_id, attempted_action, browser_name, install_id
  )
  values (
    p_member_id,p_session_id,lower(p_baseline_login_id),
    lower(p_actual_login_id),p_attempted_action,p_browser_name,p_install_id
  )
  returning id into v_id;

  update public.tripo_v2_shared_sessions
  set ended_at = coalesce(ended_at, now()), end_reason = 'account_changed'
  where id = p_session_id and member_id = p_member_id;

  return v_id;
end;
$$;

create or replace function public.tripo_v2_update_credit_if_lower(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text,
  p_room_code text,
  p_new_credit integer
)
returns table(current_credit integer)
language plpgsql
security definer
set search_path = public
as $$
declare v_current integer;
begin
  if not public.tripo_v2_verify_install(p_member_id,p_install_id,p_install_secret) then
    raise exception 'invalid installation';
  end if;

  insert into public.tripo_v2_credit_state(room_code,current_credit)
  values(p_room_code,p_new_credit)
  on conflict(room_code) do nothing;

  select c.current_credit into v_current
  from public.tripo_v2_credit_state c
  where c.room_code=p_room_code
  for update;

  if v_current is null or p_new_credit < v_current then
    update public.tripo_v2_credit_state
    set current_credit=p_new_credit, updated_at=now()
    where room_code=p_room_code;
    v_current := p_new_credit;
  end if;

  return query select v_current;
end;
$$;

create or replace function public.tripo_v2_force_credit(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text,
  p_room_code text,
  p_new_credit integer
)
returns table(current_credit integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tripo_v2_verify_install(p_member_id,p_install_id,p_install_secret) then
    raise exception 'invalid installation';
  end if;

  insert into public.tripo_v2_credit_state(room_code,current_credit,updated_at)
  values(p_room_code,p_new_credit,now())
  on conflict(room_code) do update
    set current_credit=excluded.current_credit, updated_at=now();

  return query select p_new_credit;
end;
$$;

create or replace function public.tripo_v2_get_dashboard(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text,
  p_room_code text
)
returns table(
  my_records jsonb,
  team_totals jsonb,
  mismatch_logs jsonb,
  current_credit integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tripo_v2_verify_install(p_member_id,p_install_id,p_install_secret) then
    raise exception 'invalid installation';
  end if;

  return query
  select
    coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select id,usage_amount,action_type,created_at,source
        from public.tripo_v2_usage_records
        where member_id=p_member_id
        order by created_at desc limit 100
      ) r
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_name', team_name,
        'total_usage', total_usage
      ))
      from (
        select m.team_name, coalesce(sum(u.usage_amount),0) total_usage
        from public.tripo_v2_members m
        left join public.tripo_v2_usage_records u on u.member_id=m.id
        group by m.team_name
      ) t
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select baseline_tripo_login_id,actual_tripo_login_id,
               attempted_action,created_at
        from public.tripo_v2_account_mismatch_logs
        where member_id=p_member_id
        order by created_at desc limit 50
      ) x
    ), '[]'::jsonb),
    (select c.current_credit from public.tripo_v2_credit_state c where c.room_code=p_room_code);
end;
$$;

create or replace function public.tripo_v2_get_export(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text
)
returns table(usage_records jsonb, mismatch_logs jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tripo_v2_verify_install(p_member_id,p_install_id,p_install_secret) then
    raise exception 'invalid installation';
  end if;

  return query
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id',u.member_id,
        'display_name_snapshot',u.display_name_snapshot,
        'created_at',u.created_at,
        'action_type',u.action_type,
        'usage_amount',u.usage_amount,
        'shared_mode_enabled',u.shared_mode_enabled,
        'baseline_tripo_login_id',u.baseline_tripo_login_id,
        'actual_tripo_login_id',u.actual_tripo_login_id,
        'account_match',u.account_match,
        'blocked',u.blocked,
        'browser_name',u.browser_name,
        'install_id',u.install_id,
        'shared_session_id',u.shared_session_id
      ) order by u.created_at)
      from public.tripo_v2_usage_records u
      where u.member_id=p_member_id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id',l.member_id,
        'display_name',m.display_name,
        'created_at',l.created_at,
        'attempted_action',l.attempted_action,
        'baseline_tripo_login_id',l.baseline_tripo_login_id,
        'actual_tripo_login_id',l.actual_tripo_login_id,
        'browser_name',l.browser_name,
        'install_id',l.install_id,
        'shared_session_id',l.shared_session_id
      ) order by l.created_at)
      from public.tripo_v2_account_mismatch_logs l
      join public.tripo_v2_members m on m.id=l.member_id
      where l.member_id=p_member_id
    ), '[]'::jsonb);
end;
$$;

create or replace function public.tripo_v2_migrate_legacy(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text,
  p_migration_id uuid,
  p_records jsonb
)
returns table(migrated_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  item jsonb;
begin
  if not public.tripo_v2_verify_install(p_member_id,p_install_id,p_install_secret) then
    raise exception 'invalid installation';
  end if;

  if exists(select 1 from public.tripo_v2_migrations where migration_id=p_migration_id) then
    return query select migrated_count from public.tripo_v2_migrations where migration_id=p_migration_id;
    return;
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_records,'[]'::jsonb))
  loop
    insert into public.tripo_v2_usage_records(
      member_id,display_name_snapshot,usage_amount,action_type,
      shared_mode_enabled,account_match,blocked,browser_name,
      install_id,source,account_verified,user_verified,created_at
    )
    values(
      p_member_id,
      coalesce(item->>'display_name_snapshot','기존 사용자'),
      greatest(coalesce((item->>'usage_amount')::numeric,0),0),
      coalesce(item->>'action_type','기존 로컬 기록'),
      false,null,false,null,p_install_id,'legacy_local',false,false,
      coalesce((item->>'created_at')::timestamptz,now())
    );
    v_count := v_count + 1;
  end loop;

  insert into public.tripo_v2_migrations(migration_id,member_id,install_id,migrated_count)
  values(p_migration_id,p_member_id,p_install_id,v_count);

  return query select v_count;
end;
$$;

grant execute on function public.tripo_v2_register_member(uuid,text,text,text,text,text) to anon;
grant execute on function public.tripo_v2_link_install(uuid,text,text,text,text) to anon;
grant execute on function public.tripo_v2_start_session(uuid,text,text,text,text,text) to anon;
grant execute on function public.tripo_v2_end_session(uuid,text,text,uuid,text) to anon;
grant execute on function public.tripo_v2_record_usage(uuid,text,text,uuid,text,numeric,text,boolean,text,text,boolean,boolean,text,text) to anon;
grant execute on function public.tripo_v2_log_mismatch(uuid,text,text,uuid,text,text,text,text) to anon;
grant execute on function public.tripo_v2_update_credit_if_lower(uuid,text,text,text,integer) to anon;
grant execute on function public.tripo_v2_force_credit(uuid,text,text,text,integer) to anon;
grant execute on function public.tripo_v2_get_dashboard(uuid,text,text,text) to anon;
grant execute on function public.tripo_v2_get_export(uuid,text,text) to anon;
grant execute on function public.tripo_v2_migrate_legacy(uuid,text,text,uuid,jsonb) to anon;
