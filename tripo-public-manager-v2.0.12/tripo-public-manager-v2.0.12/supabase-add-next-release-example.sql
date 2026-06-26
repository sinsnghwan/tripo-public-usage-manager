-- 다음 버전을 배포할 때 예시
-- version, title, change_items, released_at을 새 버전에 맞게 수정하세요.

insert into public.tripo_app_release_notes (
  app_key,
  version,
  title,
  change_items,
  released_at
)
values (
  'tripo-public-manager',
  '2.0.13',
  '업데이트 제목',
  '[
    "첫 번째 변경 내용",
    "두 번째 변경 내용"
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
  latest_version = '2.0.13',
  download_url = 'https://github.com/sinsnghwan/tripo-public-usage-manager',
  update_message = '새 버전이 있습니다. GitHub에서 최신 ZIP을 다시 받아주세요.',
  required = false,
  updated_at = now()
where app_key = 'tripo-public-manager';
