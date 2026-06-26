-- Tripo 공용 사용 관리 툴 v2.0.1
-- 이전 v2 SQL 실행이 digest 오류로 중단된 경우 이 파일 대신
-- 수정된 supabase-v2-secure.sql 전체를 다시 실행하는 것을 권장합니다.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 확인용
select
  encode(
    extensions.digest(
      convert_to('test', 'UTF8'),
      'sha256'
    ),
    'hex'
  ) as pgcrypto_test;
