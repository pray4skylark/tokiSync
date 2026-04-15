# 🏁 TokiSync v1.7.5 Deployment Checklist

배포 전 최종 안정성을 보장하기 위한 체크리스트입니다. 모든 항목이 충족되어야 프로덕션 배포가 가능합니다.

## 1. 빌드 및 정적 분석 (Build & Analysis)
- [x] `npm run build:viewer` 실행 시 에러(`Exit code 0`) 없이 완료되는가?
- [x] `dist-viewer/` 폴더 내에 `index.html` 및 최신 어셋들이 생성되었는가?
- [x] 콘솔에 치명적인 Lint Error나 타입 에러가 남아있지 않는가?

## 2. 데이터베이스 & 스토리지 (DB & Storage)
- [x] Dexie DB 버전이 `6`으로 정상 마이그레이션 되었는가? (`db.js`)
- [x] `episodeData` 테이블에 `seriesId` 인덱스가 존재하는가?
- [x] LRU 가비지 컬렉터가 에피소드 5개 초과 시 정상 작동하는가?

## 3. 네트워크 및 로직 (Network & Logic)
- [x] 뷰어 종료 시 실시간 fetch 요청이 `AbortController`에 의해 즉시 중단되는가?
- [x] 뷰어 종료 후에도 다운로드 매니저의 백그라운드 작업은 유지되는가?
- [x] 다음 화 미리 읽기(Preload)가 뷰어 종료 시 함께 중단되는가?
- [x] 구글 모델(Antigravity) 검증에서 발견된 5대 치명적 결함이 모두 수정되었는가?

## 4. UI/UX 검증 (UI/UX Verification)
- [x] `NavHeader`에 다운로드 매니저 아이콘이 올바르게 표시되는가?
- [x] `ReaderView` 다운로드 오버레이에서 '취소' 버튼 클릭 시 즉시 탈출되는가?
- [x] `EpisodesView`에서 캐시된 에피소드 옆에 '캐시됨' 뱃지가 정상 노출되는가?

## 5. 최종 배포 절차 (Release Procedure)
- [x] `CHANGELOG.md` 및 `README.md` 버전 정보가 `v1.7.5`로 갱신되었는가?
- [ ] `gh-pages` 브랜치 또는 타겟 호스팅 서버로의 업로드가 완료되었는가?
- [ ] 배포 후 실사용 환경에서 API 호출(`GAS`)이 정상 작동하는가?

---
**최종 승인자**: Antigravity
**일자**: 2026-04-15
