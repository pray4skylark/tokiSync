# TokiSync v1.28.0 프리 릴리즈 노트 (Pre-release Notes)

본 문서는 **TokiSync v1.28.0+v1.28.1** 통합 프리 릴리즈(Pre-release)의 주요 변경 사항 및 배포 정보를 요약합니다.

---

## 1. 주요 변경 사항

### ⚡ 큐 키 분할 — 저장 공간 95% 절감

시리즈 공유 데이터(`matchedRule`, `viewerCfg`, `seriesMetadata`, `rootFolder`, `folderId`, `category`, `destination`, `novelFormat`, `protocolDomain`)를 큐 아이템별 인라인 저장에서 별도 키(`TOKI_SERIES_{ruleId}_{hash}_{seriesId}`)로 분리.

- **100화 시리즈**: ~80KB → ~10KB (**87.5% 절감**)
- **신규 모듈**: `series-config.js` — `getSeriesConfig()`, `saveSeriesConfig()`, `deleteSeriesConfig()`, `normalizeQueueItem()`
- **하위 호환**: 구 인라인 포맷 아이템도 그대로 동작. `normalizeQueueItem()`으로 투명 변환

### 🛡️ v1.28.1 안정성 강화 (4-Phase)

| Phase | 영역 | 핵심 개선 |
|-------|------|-----------|
| 1 | Series Config DI | 모든 저장소 모듈이 StorageBackend 추상화 통과 |
| 2 | Abort 경로 | 사용자 중단 시 큐/시리즈 데이터 완전 정리 |
| 3 | Session | 워커 세션 desync 자가 치유 (assertConsistent 3-way reconcile) |
| 4 | UX | 저장 실패 시 사용자 알림, EventBus 즉시 오류 감지 |

### 📐 Agent Rulebook 정비

`AGENTS.md`에 6개 신규 규칙 섹션 추가:
- DI Storage Mandate (모든 저장소는 StorageBackend를 통해)
- EventBus Patterns (emit/on vs request/respond)
- Queue State Consistency (3레지스트리 동기화)
- Storage Safety Rules (STORAGE_FATAL 필수, silent data loss 금지)
- Queue Key Splitting (seriesKey 분리 규칙)
- Test Conventions (mockStorage, 접두사 규칙)

---

## 2. 변경 파일

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `series-config.js` | 신규 | 시리즈 공유 데이터 DI 저장소 |
| `downloader.js` | 리팩터 | `runDrivePreWork()` 추출 + abort 정리 + inline fallback |
| `queue.js` | 강화 | assertConsistent 자가 치유 + clearQueue guard + GC |
| `worker-controller.js` | 강화 | normalizeQueueItem 적용 + deleteSeriesConfig TOCTOU 방지 |
| `main.js` | 확장 | setSeriesStorage DI + downloadCurrent pre-work |
| `EventBus.js` | 개선 | request() pre-emit check |
| `LogBox.js` | 개선 | STORAGE_FATAL 리스너 + 고아 팝업 방어 |
| `RuleManager.js` | 추가 | getRuleById() |
| `config.js` | 개선 | one-time DI guard debug log |
| `AGENTS.md` | 문서 | 6개 신규 규칙 섹션 |
| `CHANGELOG.md` | 문서 | v1.28.0 + v1.28.1 |
| `test-eventbus.js` | 강화 | E1-E13 신규 + mockStorage 헬퍼 + assertConsistent 검증 |
| `test-real-env.js` | 수정 | window.addEventListener JSDOM mock |

---

## 3. 테스트 커버리지

| 구분 | 건수 | 비고 |
|------|------|------|
| Unit tests | 50/50 Pass | (38→50, E1-E13 신규) |
| Real-environment | 3/3 Pass | 복구 (기존 0/3) |
| Static verification | 8/8 Pass | |
| **총계** | **61/61** | |

---

## 4. 배포 정보

| 항목 | 값 |
|------|-----|
| 버전 | v1.28.1 (v1.28.0 보완 패치 포함) |
| 태그 | `v1.28.0-rc.1` (RC), `v1.28.1` (Stable) |
| 브랜치 | `rc` → `main` |
| 빌드 | `npm run build:core` ✅ |
| 배포 경로 | `/rc/` (RC), `/` (Stable) |

---

## 5. Breaking Changes

없음. 모든 변경은 하위 호환성을 유지합니다.

- 구 인라인 포맷 큐 아이템: `normalizeQueueItem()`으로 자동 변환
- v1.27.x 시리즈 데이터: string → object 자동 마이그레이션
- `saveSeriesConfig` 실패: inline fallback으로 자동 전환
