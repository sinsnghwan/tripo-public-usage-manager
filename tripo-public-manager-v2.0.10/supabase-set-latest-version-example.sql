-- 새 버전을 배포할 때 아래 값만 바꿔서 실행합니다.

update public.tripo_app_versions
set
  latest_version = '2.0.11',
  download_url = 'https://github.com/sinsnghwan/tripo-public-usage-manager',
  update_message = '새 버전이 있습니다. GitHub에서 최신 ZIP을 다시 받은 뒤 기존 확장 프로그램 폴더를 교체하고 새로고침해주세요.',
  required = true,
  updated_at = now()
where app_key = 'tripo-public-manager';
