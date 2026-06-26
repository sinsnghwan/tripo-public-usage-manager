-- Tripo 전체 사용자 엑셀 내보내기 v2.0.12
-- Supabase SQL Editor의 새 쿼리 탭에서 한 번 실행하세요.

create or replace function public.tripo_v2_get_export_all(
  p_member_id uuid,
  p_install_id text,
  p_install_secret text,
  p_room_code text
)
returns table(
  usage_records jsonb,
  mismatch_logs jsonb
)
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
  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'member_id', u.member_id,
          'display_name_snapshot', u.display_name_snapshot,
          'created_at', u.created_at,
          'action_type', u.action_type,
          'usage_amount', u.usage_amount,
          'shared_mode_enabled', u.shared_mode_enabled,
          'baseline_tripo_login_id', u.baseline_tripo_login_id,
          'actual_tripo_login_id', u.actual_tripo_login_id,
          'account_match', u.account_match,
          'blocked', u.blocked,
          'browser_name', u.browser_name,
          'install_id', u.install_id,
          'shared_session_id', u.shared_session_id
        )
        order by u.created_at
      )
      from public.tripo_v2_usage_records u
      left join public.tripo_v2_shared_sessions s
        on s.id = u.shared_session_id
      where
        s.room_code = p_room_code
        or (
          u.shared_session_id is null
          and u.source = 'legacy_local'
        )
    ), '[]'::jsonb),

    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'member_id', l.member_id,
          'display_name', m.display_name,
          'created_at', l.created_at,
          'attempted_action', l.attempted_action,
          'baseline_tripo_login_id', l.baseline_tripo_login_id,
          'actual_tripo_login_id', l.actual_tripo_login_id,
          'browser_name', l.browser_name,
          'install_id', l.install_id,
          'shared_session_id', l.shared_session_id
        )
        order by l.created_at
      )
      from public.tripo_v2_account_mismatch_logs l
      join public.tripo_v2_members m
        on m.id = l.member_id
      left join public.tripo_v2_shared_sessions s
        on s.id = l.shared_session_id
      where s.room_code = p_room_code
    ), '[]'::jsonb);
end;
$$;

grant execute on function public.tripo_v2_get_export_all(
  uuid,
  text,
  text,
  text
) to anon;

notify pgrst, 'reload schema';
