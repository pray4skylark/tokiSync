# TokiSync Backend (GAS) Architecture

TokiSync의 백엔드는 Google Apps Script(GAS)를 활용한 서버리스 구조입니다. 안정성과 호환성을 극대화하기 위한 특수 패턴들이 적용되어 있습니다.

---

## 1. Drive API v3 레이어링
v1.8.0부터 기존의 `DriveApp` (v2) 대신 **Advanced Google Service (Drive API v3)**를 직접 호출하는 `DriveAccessService.gs` 레이어를 사용합니다.

- **장점**: 
  - 검색 쿼리(`q`)의 정확도 향상.
  - 대량 파일 조회 시 `nextPageToken`을 이용한 고속 페이지네이션 지원.
  - `supportsAllDrives: true` 설정을 통한 공유 드라이브 완벽 대응.
- **핵심 함수**:
  - `listPaged(parentId, options)`: 페이지 단위 고속 검색.
  - `ensureFolder(parentId, name)`: 멱등성(Idempotency)이 보장된 폴더 생성.

## 2. GAS V8 런타임 및 스코프 규칙 (CRITICAL)
GAS의 V8 런타임에서 발생하는 **ReferenceError**와 **Temporal Dead Zone(TDZ)** 이슈를 방지하기 위한 엄격한 코딩 규칙입니다.

- **Rule**: 모든 전역 변수 및 서비스 모듈은 `const`나 `let` 대신 **`var`**로 선언해야 합니다.
- **Rationale**: GAS는 여러 파일을 하나의 전역 컨텍스트로 결합하는데, 파일 로드 순서에 따라 `const` 선언 전에 참조가 발생하면 치명적인 런타임 에러가 발생합니다. `var`를 사용하면 호이스팅(Hoisting)을 통해 안정적인 모듈 참조가 가능합니다.
  - *Example*: `var DriveAccessService = { ... };`

## 3. Merge Index (데이터 병합 전략)
수천 개의 에피소드를 관리하기 위해 전체 스캔 대신 인덱스 기반 병합을 수행합니다.

- **Structure**: 
  - 각 작품 폴더 내 `info.json`: 해당 작품의 최신 메타데이터.
  - 루트 폴더의 `index.json`: 전체 라이브러리 요약 및 빠른 탐색용 캐시.
- **Sync Logic**: 클라이언트에서 다운로드 완료 시 `saveSeriesInfo`를 호출하여 개별 `info.json`을 업데이트하고, 주기적으로 `SyncService`가 하위 폴더들을 병합하여 글로벌 인덱스를 재구성합니다.
- **v1.9.1 Sync Flow**:
  - **Fast Path**: `fetchHistoryDirect`를 통해 Google Drive API v3로 에피소드 이력을 직접 조회.
  - **Protocol**: 모든 GAS 요청 페이로드에 `protocolVersion: 3` 포함 필수.

## 4. OAuth Token Relay
클라이언트가 Google Drive API에 직접 접근하여 대용량 파일을 업로드할 수 있도록 일시적인 Access Token을 발급하는 엔드포인트를 제공합니다.

- **Function**: `view_get_token()`
- **Security**: 발급된 토큰은 1시간 동안만 유효하며, GAS의 실행 권한 범위 내로 제한됩니다.

---

> [!CAUTION]
> **Warning**: GAS 코드를 수정할 때 전역 범위에서 `const` 사용을 지양하십시오. 파일 간 참조 오류의 90%는 부주의한 `const` 사용에서 비롯됩니다.
