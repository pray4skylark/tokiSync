# GAS 배포 전 체크리스트

`clasp push` 실행 전 아래 항목을 반드시 확인하세요.

---

## LockService (C5)

- [ ] `View_LibraryService.gs`에 `withIndexLock()` 함수가 정의되어 있음
- [ ] `SweepMergeIndex()`가 `withIndexLock()`을 통해 index.json을 읽고 씀
- [ ] `View_updateMetadata()`가 `withIndexLock()`을 통해 index.json을 읽고 씀
- [ ] `SyncService.gs`의 `updateLibraryStatus()`가 `withIndexLock()`을 통해 index.json을 읽고 씀
- [ ] Lock timeout: 15초, retry: 3회

## API_KEY lazy-read (H10)

- [ ] `Main.gs`에 전역 `var API_KEY = PropertiesService.getScriptProperties().getProperty("API_KEY")`가 **제거**됨
- [ ] `doPost()` 내부에서 `var apiKey = getApiKey_();`로 키를 읽음
- [ ] `getApiKey_()` 함수가 `doPost` 위쪽에 정의되어 있음

## Pagination merge artifact (H6)

- [ ] `View_LibraryService.gs`에서 중첩 `if (hasMore || response.nextPageToken)` 조건이 **제거**됨
- [ ] `response.nextPageToken` 분기와 `hasMore` 분기가 분리되어 있음
- [ ] `hasMore=true + nextPageToken=null` 시 `state.step++`가 실행됨

## Kavita metadata guard (M23/M24)

- [ ] `_kavitaMarkMigrated()`에 `JSON.parse` 실패 시 `return`하는 guard가 있음
- [ ] outer catch가 `Debug.error()`를 호출함
- [ ] `_kavitaProcessSeries()` L97의 empty catch에 `Debug.error()`가 추가됨

## 파일 크기 가드 (M29)

- [ ] `View_getFileChunk()` fallback 경로에 30MB size guard가 있음
- [ ] 초과 시 throw, 이하 시 기존 fallback 유지

## Debug.warn() 메서드 (H5)

- [ ] `Debug.gs`에 `warn: function(msg)` 메서드가 정의되어 있음

## Dead code 제거 (L28)

- [ ] `SyncService.gs`에 `updateLibraryStatus()` 함수가 **없음**
- [ ] `Main.gs`에 `update_library_status` 라우팅이 **없음**

## THUMB_FOLDER_NAME 로컬 선언 (M31)

- [ ] `Migrate_Service.gs`에 `var THUMB_FOLDER_NAME = "_Thumbnails";` 선언이 있음

## 기타

- [ ] `View_BookService.gs`에 M29(size guard)가 적용되어 있음
- [ ] 수정된 GAS 파일 수: **7개** (Main, View_LibraryService, View_KavitaService, View_BookService, SyncService, Debug, Migrate_Service)

---

## 배포 명령

```bash
clasp push -P src/gas
```

> **참고**: `clasp push`는 AGENTS.md에 의해 model이 직접 실행할 수 없습니다. human이 수동 실행해야 합니다.

## 배포 후 확인

- [ ] `doPost` API 정상 응답 확인
- [ ] Kavita Restructure 기능 정상 작동 확인
- [ ] Library 새로고침 시 정상 동작 확인
- [ ] CBZ 다운로드/업로드 정상 확인
