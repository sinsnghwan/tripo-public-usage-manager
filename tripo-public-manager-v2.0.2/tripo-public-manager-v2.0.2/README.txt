Tripo 공용 사용 관리 툴 v2.0.2

필수 설치 전 작업
1. Supabase SQL Editor를 엽니다.
2. supabase-v2-secure.sql 전체를 실행합니다.
3. 기존 테이블은 삭제되지 않습니다.
4. 확장 프로그램을 v2.0.0으로 교체합니다.

주요 기능
- 최초 등록한 이름을 member_id에 연결하고 이름 변경 잠금
- 다른 PC에서는 사용자 ID + 연결 코드로 동일 사용자 연결
- 공용 모드 OFF 상태에서 모든 유료 Tripo 버튼 차단
- 공용 모드 ON 시 개인 정보 화면 이메일 자동 읽기
- 유료 작업 직전 이메일 자동 재확인
- 계정 불일치 시 클릭 차단, 로그 저장, 공용 모드 자동 OFF
- 정상 사용량은 member_id와 shared_session_id에 연결
- Chrome/웨일/다른 PC 기록을 Supabase에서 통합
- 네트워크 오류 기록은 로컬 대기열에 저장 후 재전송
- 기존 로컬 기록 백업 후 legacy_local로 1회 이전
- 엑셀은 Supabase 최신 본인 기록과 불일치 로그를 조회해 생성
- service_role 키 없음
- 직접 테이블 접근 차단, 설치별 secret 검증 RPC만 허용

주의
- Tripo 화면 구조가 크게 바뀌면 프로필/개인 정보 자동 탐색 코드를 수정해야 할 수 있습니다.
- 관리자 전체 사용자 조회와 전체 엑셀은 service_role 또는 별도 관리자 인증 화면이 필요합니다.
  현재 배포본의 엑셀은 일반 사용자 보안 기준에 맞춰 본인 기록만 내보냅니다.
- Supabase Free 플랜에는 텍스트와 숫자 기록만 저장합니다.


[v2.0.1 SQL 수정]
- Supabase pgcrypto 함수가 extensions 스키마에 있는 환경 대응
- digest(text, unknown) 오류 수정
- extensions.digest(convert_to(text, 'UTF8'), 'sha256') 사용
- extensions.gen_random_bytes() 명시
- 이전 SQL이 중간 실패했어도 CREATE TABLE/FUNCTION에 IF NOT EXISTS 또는 CREATE OR REPLACE를 사용하므로 수정된 전체 SQL을 다시 실행 가능


[v2.0.2 공용 모드 OFF 동작 수정]
- 공용 모드 OFF 상태에서 Tripo 유료 버튼을 더 이상 차단하지 않음
- 개인 계정 작업은 정상 실행
- OFF 상태에서는 Supabase 공용 사용량에 기록하지 않음
- ON 상태에서만 계정 확인, 사용량 기록, 불일치 차단 수행
- 안내 문구를 '개인 사용 가능 · 공용 사용량에는 기록되지 않습니다.'로 변경
