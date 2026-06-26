-- v2.0.12 업데이트 내역 등록

insert into public.tripo_app_release_notes (
  app_key,
  version,
  title,
  change_items,
  released_at
)
values (
  'tripo-public-manager',
  '2.0.12',
  '전체 사용자 엑셀 내보내기 수정',
  '[
    "엑셀 내보내기에 전체 사용자 사용 기록을 포함합니다.",
    "전체 계정 불일치 기록을 함께 포함합니다.",
    "기록이 없을 때 빈 헤더 파일 대신 안내 오류를 표시합니다."
  ]'::jsonb,
  now()
)
on conflict (app_key, version)
do update set
  title = excluded.title,
  change_items = excluded.change_items,
  released_at = excluded.released_at;

update public.tripo_app_versions
set
  latest_version = '2.0.12',
  download_url = 'https://github.com/sinsnghwan/tripo-public-usage-manager',
  update_message = '전체 사용자 엑셀 내보내기 오류가 수정되었습니다. GitHub에서 최신 ZIP을 다시 받아주세요.',
  required = false,
  updated_at = now()
where app_key = 'tripo-public-manager';

notify pgrst, 'reload schema';
