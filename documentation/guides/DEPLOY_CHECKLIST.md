# 🏁 TokiSync v1.8.1 Deployment Checklist

배포 전 최종 안정성을 보장하기 위한 체크리스트입니다. v1.8.1의 새로운 아키텍처와 픽스 사항들이 모두 반영되었는지 확인하세요.

---

## 1. 빌드 및 버전 관리 (Build & Versioning)
- [ ] `package.json` 버전이 `1.8.1`로 명시되어 있는가?
- [ ] `webpack.core.config.cjs`의 UserScript 버전이 `1.8.1`로 갱신되었는가?
- [ ] `npm run build` 실행 시 에러 없이 모든 어셋(Viewer, Core, GAS Bundle)이 생성되는가?
- [ ] `docs/tokiSync.user.js` 파일이 정상적으로 빌드되었는가?

## 2. GAS 서버 정합성 (GAS Server Integrity)
- [ ] `google_app_script/TokiSync/Code.gs` 내 모든 전역 변수가 `var` 키워드를 사용하는가? (ReferenceError 방지)
- [ ] `appsscript.json`에 Drive API `v3` 고급 서비스가 활성화되어 있는가?
- [ ] 최신 서버 번들(`TokiSync_Server_Bundle.gs`)이 배포용 사이트에 업로드되었는가?

## 3. 소설 뷰어 V2 & 동기화 (Reader V2 & Sync)
- [ ] 소설 뷰어에서 테마/폰트 변경 시 `Locator` 엔진이 현재 읽던 문단을 유지하는가?
- [ ] 에피소드 종료/이동 시 `read_history.json`이 서버에 즉시 Flush(저장)되는가?
- [ ] 새 에피소드 로드 시 `resetLocator`가 호출되어 이전 위치 정보가 초기화되는가?
- [ ] 720px 가이드라인 레이아웃이 모바일/데스크탑에서 정상 작동하는가?

## 4. 다운로드 엔진 (Download Engine)
- [ ] 5단계 다운로드 속도 정책(`very_slow` 포함)이 정상적으로 동작하는가?
- [ ] 소설 API 복호화 모드 시 `very_slow` 정책이 강제 적용되는가?
- [ ] 범위 다운로드(`1-10`) 시 회차 번호 오름차순 정렬이 보장되는가?
- [ ] `zipOfCbzs` 정책 사용 시 5화 단위 배칭(Batching) 저장이 이루어지는가?

## 5. 최종 배포 및 공지 (Release Procedure)
- [ ] `CHANGELOG.md`에 v1.8.1 변경 사항이 모두 기록되었는가?
- [ ] `INSTALL_GUIDE.md` 등 주요 가이드 문서의 버전 정보가 갱신되었는가?
- [ ] `gh-pages` 브랜치에 최신 빌드 결과물이 푸시되었는가?
- [ ] 실사용 환경(뉴토끼/북토끼)에서 통합 메뉴(`Ctrl+Shift+T`)가 정상 호출되는가?

---
**최종 승인자**: Antigravity
**일자**: 2026-05-08
