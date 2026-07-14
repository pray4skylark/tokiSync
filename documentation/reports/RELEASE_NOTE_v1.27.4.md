# TokiSync v1.27.4 프리 릴리즈 노트 (Pre-release Notes)

본 문서는 **TokiSync v1.27.4** 프리 릴리즈(Pre-release)의 주요 변경 사항 및 배포 정보를 요약합니다.
이번 버전에서는 업로드 파이프라인의 간헐적 실패를 근본적으로 해결하고, 패키지 매니저를 npm에서 pnpm으로 전환하여 git worktree 환경에서의 디스크 효율성을 대폭 개선하였습니다.

---

## 🚀 1. 업로드 안정성 개선 (Upload Stability Improvements)

### 1-1. 토큰 관리 강화
- **토큰 뮤텍스**: 동시 업로드가 동일한 시점에 `fetchToken()`을 중복 호출하여 GAS 엔드포인트에 레이스 컨디션이 발생하던 문제 해결. 첫 번째 요청의 Promise를 재사용하도록 변경.
- **청크 전 토큰 TTL 확인**: 각 청크 업로드 전 `ensureFreshToken()` 호출로 1시간 TTL 만료 임박 시 자동 갱신. 대용량 파일(500MB+) 업로드 도중 토큰 만료로 인한 401 청크 실패 방지.

### 1-2. 청크 업로드 재시도 (Direct Drive API)
- **청크 재시도 루프**: 각 청크 실패 시 지수 백오프(2s→4s→8s)로 최대 3회 재시도. 단일 청크 타임아웃/네트워크 오류로 전체 업로드가 중단되던 문제 해결.
- **308 Range 헤더 검증**: Google Drive의 308(Resume Incomplete) 응답에서 `Range` 헤더를 파싱하여 실제 수신 완료된 바이트 위치를 확인. chunk boundary 불일치로 인한 데이터 손상 가능성 차단.

### 1-3. GAS 릴레이 개선
- **메모리 최적화**: `blob.arrayBuffer()`로 파일 전체를 메모리에 로드하던 방식을 `blob.slice()` + 청크 단위 `arrayBuffer()`로 변경. 500MB+ 대용량 파일 처리 시 브라우저 OOM 방지.
- **GAS 청크 재시도**: Direct Drive 실패 시 fallback 경로인 GAS 릴레이에도 청크 재시도 로직(3회, 지수 백오프) 적용.

### 1-4. 세션 초기화 및 중복 방어
- **세션 init 재시도**: Resumable Upload 세션 URL 획득 실패 시 1회 재시도. `anonymous: true`가 실패하면 `anonymous: false`로 fallback하여 브라우저/Tampermonkey 버전별 호환성 확보.
- **업로드 파일 잠금(Lock)**: `uploadLocks` Map을 도입하여 동일 파일명에 대한 동시 업로드를 직렬화. Drive에 중복 파일이 생성되던 레이스 컨디션 완전 차단.

### 1-5. 기타 안정화
- **`get_library` 타임아웃 추가**: Fast Path 캐시 조회 요청에 30초 타임아웃 및 `ontimeout` 핸들러 추가. 네트워크 지연 시 배치 전체가 무한 대기하던 문제 해결.

---

## 📦 2. 패키지 매니저 전환: npm → pnpm

git worktree 환경(브랜치 3~4개 동시 작업)에서 `node_modules` 중복 저장으로 인한 디스크 낭비를 해결하기 위해 pnpm으로 전환.

| 항목 | npm | pnpm |
|------|-----|------|
| node_modules | 각 워크트리마다 중복 (3개 worktree = 600MB) | 전역 저장소 1회 저장 + 심링크 (약 200MB) |
| 설치 속도 | 직렬 (느림) | 병렬 + 캐시 (빠름) |
| lock 파일 | `package-lock.json` (삭제) | `pnpm-lock.yaml` (신규) |
| 설정 | — | `.npmrc`: `shamefully-hoist=true`, `auto-install-peers=true` |
| 호환성 | — | 모든 `npm run` 명령어 `pnpm run`으로 동일 사용 가능 |

---

## 📚 3. 문서화 변경 (Documentation Update)

- **패키지 매니저 전환 안내**: README 및 개발자 문서에 pnpm 사용 명시.
- **버전 갱신**: README, INSTALL_GUIDE.md 버전 문자열 v1.27.3 → v1.27.4.

---

## 📦 4. 배포 패키지 구성 요소 (Assets)

- **UserScript (수집기)**: `dist/tokiSync.user.js`
- **Apps Script Server Bundle (서버)**: `dist/TokiSync_Server_Bundle.gs`
- **Web Viewer (공식 뷰어)**: `dist-viewer/`

---

## 🛠️ 5. 검증 및 품질 상태

- **테스트 커버리지**:
  - 총 30건의 Core 유닛 테스트(기존 30건 유지, 신규 Upload/Direct Drive 시나리오 테스트는 향후 추가 예정)
  - 빌드 검증(`pnpm run build:core`), GAS 번들(`pnpm run build:gas`) 정상 빌드 확인.
- **pnpm 마이그레이션 검증**:
  - `pnpm install` → `pnpm-lock.yaml` 생성 정상
  - `pnpm run build:core` → 번들 567KiB (npm과 동일, 기존: 564KiB)
  - `pnpm run build:gas` → TokiSync_Server_Bundle.gs 생성 정상
  - `pnpm run test` → 30/30 Pass + 3/3 real-env + 8/8 static 검증 통과
- **크로스 벤더 검증**:
  - 3개 AI 모델(Deepseek, Mimo, Qwen)이 분석/교차 검증한 버그 수정 사항 반영 완료
  - 특히 Nonce 차단 버그, touchSessionActivity 큐 아이템 미갱신, 워커 세션 소실 등 누적 8건의 레이스 컨디션 및 상태 불일치 오류 일괄 해결

---

*Generated: 2026-07-14*
