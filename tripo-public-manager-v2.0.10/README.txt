Tripo 공용 사용 관리 툴 v2.0.10

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


[v2.0.3 공용 계정 OFF 상태 보호]
- 페이지 이동, 새로고침, 비활성 상태에서 공용 모드를 자동 OFF하던 처리 제거
- 공용 계정 이메일을 OFF 후에도 knownSharedEmail로 유지
- OFF 상태에서 유료 버튼 클릭 시 실제 Tripo 이메일 자동 확인
- 현재 계정이 등록된 공용 계정이면 생성 차단 후 공용 모드 ON 안내
- 현재 계정이 다른 개인 계정이면 생성 허용, 공용 사용량에는 기록하지 않음
- 수동 사용량 입력 없이 계정 판별로 기록 누락 방지
- 계정 불일치로 자동 OFF된 경우에도 공용 계정 기준값 유지


[v2.0.4 Supabase 업데이트 알림]
- Supabase tripo_app_versions에서 최신 버전 확인
- 시작 시 1회, 이후 5분마다 최신 버전 확인
- 새 버전이 있으면 패널 상단에 업데이트 카드 표시
- required=true면 공용 모드 ON 차단
- 개인 사용은 계속 허용
- 업데이트 다운로드 버튼으로 download_url 열기
- supabase-update-version-system.sql 1회 실행 필요
- 이후 새 버전 배포 시 Supabase 버전 값만 변경하면 모든 v2.0.4 이상 사용자에게 알림 표시


[v2.0.5 무료 GitHub 업데이트 확인]
- Supabase 업데이트 버전 조회 제거
- Supabase Realtime 미사용
- 5분 반복 조회 제거
- Tripo 페이지 시작 시 GitHub version.json 1회 확인
- 사용자가 '업데이트 확인' 버튼을 눌렀을 때만 추가 확인
- GitHub 정적 파일을 사용하므로 Supabase 비용 없음
- 새 버전 배포 시 version.json의 latest_version, download_url, update_message, required만 변경
- 필수 업데이트(required=true)는 공용 모드 ON만 차단하며 개인 사용은 허용


[v2.0.6 업데이트 확인 주기 변경]
- Tripo 페이지 시작 시 GitHub version.json 1회 확인
- 페이지가 열려 있는 동안 15분마다 GitHub version.json 확인
- 수동 업데이트 확인 버튼 유지
- Supabase 조회 및 Realtime은 사용하지 않음
- 업데이트 확인으로 Supabase 사용량이 발생하지 않음


[v2.0.7 Supabase 15분 업데이트 확인]
- GitHub version.json 조회 방식 제거
- Supabase tripo_app_versions 기준으로 다시 변경
- Tripo 페이지 시작 시 1회 확인
- 페이지가 열려 있는 동안 15분마다 확인
- 수동 업데이트 확인 버튼 유지
- Supabase Realtime은 사용하지 않음
- supabase-update-version-system.sql 1회 실행 필요


[v2.0.8 Windows 업데이트 알림]
- manifest에 notifications 권한 추가
- 새 버전 감지 시 패널 상단 카드와 함께 Windows 알림센터 알림 표시
- content script가 background service worker에 알림 요청
- 같은 버전 알림은 로컬 저장값으로 1회만 표시
- 시작 시 1회, 이후 15분마다 Supabase 버전 확인 유지
- 수동 업데이트 확인 버튼 유지
- Supabase Realtime은 사용하지 않음


[v2.0.9 업데이트 안내 문구 개선]
- Windows 알림과 패널 업데이트 카드에 설치 방법 명시
- GitHub에서 최신 ZIP을 다시 받아야 한다는 내용 추가
- 기존 확장 프로그램 폴더를 교체하고 확장 프로그램 새로고침 안내


[v2.0.10 공용 계정 고정 및 크레딧 수정]
- 공용 모드 ON 시 현재 로그인 계정을 새 기준 계정으로 저장하던 문제 수정
- 공용 계정은 Supabase room settings의 seoulit29@gmail.com으로 고정
- 개인 계정에서 ON을 누르면 공용 모드 활성화 차단
- 서버 start_session 함수에서도 공용 계정을 재검증
- 개인 계정으로 공용 기준 계정을 덮어쓸 수 없음
- 상단 실제 Tripo 잔액을 우선 표시
- 생성 비용 및 알림 숫자를 잔액으로 잘못 읽는 문제 보완
- supabase-v2.0.10-shared-account-fix.sql 1회 실행 필요
