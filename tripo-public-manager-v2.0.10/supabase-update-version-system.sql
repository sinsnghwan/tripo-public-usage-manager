-- Tripo 공용 사용 관리 툴 업데이트 알림 기능
-- 이 SQL은 한 번만 실행하면 됩니다.

create table if not exists public.tripo_app_versions (
  app_key text primary key,
  latest_version text not null,
  download_url text not null,
  update_message text,
  required boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.tripo_app_versions enable row level security;

revoke all on public.tripo_app_versions from anon, authenticated;

drop policy if exists "tripo app versions public read" on public.tripo_app_versions;

create policy "tripo app versions public read"
on public.tripo_app_versions
for select
to anon
using (true);

grant select on public.tripo_app_versions to anon;

insert into public.tripo_app_versions (
  app_key,
  latest_version,
  download_url,
  update_message,
  required,
  updated_at
)
values (
  'tripo-public-manager',
  '2.0.10',
  'https://github.com/sinsnghwan/tripo-public-usage-manager',
  '개인 계정에서 공용 모드가 켜지는 오류와 크레딧 표시 오류를 수정했습니다. GitHub에서 최신 ZIP을 다시 받아주세요.',
  false,
  now()
)
on conflict (app_key)
do update set
  latest_version = excluded.latest_version,
  download_url = excluded.download_url,
  update_message = excluded.update_message,
  required = excluded.required,
  updated_at = now();
