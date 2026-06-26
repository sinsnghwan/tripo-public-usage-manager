-- Tripo 공용 계정 고정 설정 v2.0.10
-- 새 SQL 탭에서 한 번 실행하세요.

create table if not exists public.tripo_v2_room_settings (
  room_code text primary key,
  shared_login_id text not null,
  updated_at timestamptz not null default now()
);

alter table public.tripo_v2_room_settings enable row level security;
revoke all on public.tripo_v2_room_settings from anon, authenticated;

insert into public.tripo_v2_room_settings (
  room_code,
  shared_login_id,
  updated_at
)
values (
  'VR-CLASS-2026',
  'seoulit29@gmail.com',
  now()
)
on conflict (room_code)
do update set
  shared_login_id = excluded.shared_login_id,
  updated_at = now();

create or replace function public.tripo_v2_get_shared_account(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text,
  p_room_code text
)
returns table(shared_login_id text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tripo_v2_verify_install(
    p_member_id,
    p_install_id,
    p_install_secret
  ) then
    raise exception 'invalid installation';
  end if;

  return query
  select lower(btrim(s.shared_login_id))
  from public.tripo_v2_room_settings s
  where s.room_code = p_room_code;
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
  v_shared_login_id text;
begin
  if not public.tripo_v2_verify_install(
    p_member_id,
    p_install_id,
    p_install_secret
  ) then
    raise exception 'invalid installation';
  end if;

  select lower(btrim(s.shared_login_id))
  into v_shared_login_id
  from public.tripo_v2_room_settings s
  where s.room_code = p_room_code;

  if v_shared_login_id is null then
    raise exception 'shared account is not configured';
  end if;

  if lower(btrim(p_baseline_login_id)) <> v_shared_login_id then
    raise exception 'current account is not the configured shared account';
  end if;

  insert into public.tripo_v2_shared_sessions(
    member_id,
    install_id,
    room_code,
    baseline_tripo_login_id,
    started_at
  )
  values (
    p_member_id,
    p_install_id,
    p_room_code,
    v_shared_login_id,
    v_started
  )
  returning id into v_id;

  return query select v_id, v_started;
end;
$$;

grant execute on function public.tripo_v2_get_shared_account(
  uuid,
  text,
  text,
  text
) to anon;

grant execute on function public.tripo_v2_start_session(
  uuid,
  text,
  text,
  text,
  text,
  text
) to anon;
