# 📜 TokiSync Update History

## 📥 Client (Tampermonkey)

### v2.0.0 (Remote Loader) - 2025.12.02
*   **[New] Remote Loader Architecture**:
    *   클라이언트 스크립트(`tokiSyncScript.js`)를 경량화된 **Loader**로 변경.
    *   핵심 로직(`tokiSyncCore.js`)은 **GitHub CDN**을 통해 실시간으로 로드.
    *   사용자는 스크립트 재설치 없이 최신 기능을 바로 적용받을 수 있음.
*   **[Rollback]**: 안정성을 위해 v1.6.2 기반의 로직으로 복귀 (업데이트 확인 기능 제거).

### v1.7.3 (Iframe Update Check) - 2025.12.01
*   **[New]** `checkAllLibraryUpdates` 기능 추가 (Iframe 방식).
*   **[Fix]** XHR 방식의 부정확한 파싱 문제 해결.

### v1.7.2 (Sync Check Persistence) - 2025.12.01
*   **[New]** `update_library_status` API 연동.
*   **[New]** 업데이트 확인 결과를 `library_index.json`에 영구 저장.

### v1.7.1 (Bug Fix) - 2025.12.01
*   **[Fix]** `checkAllLibraryUpdates`에서 `last_episode` 속성명 불일치 수정.

### v1.7.0 (Library Update Check) - 2025.12.01
*   **[New]** 전체 라이브러리 업데이트 확인 기능 추가.
*   **[New]** `GM_registerMenuCommand`에 업데이트 확인 메뉴 추가.

### v1.6.2 (Error Log in Zip) - 2025.12.01
*   **[New]** 다운로드 중 누락된 이미지가 있을 경우, ZIP 파일 내에 `!MISSING_FILES_LOG.txt` 생성.
*   **[Fix]** 404 에러 발생 시 다운로드가 멈추지 않고 스킵하도록 개선.

### v1.6.1 (Captcha Pause) - 2025.11.30
*   **[New]** 다운로드 중 캡차/Cloudflare 감지 시 일시 정지 기능 추가.
*   **[UI]** 상태창에 "캡차 해결 완료" 버튼 추가.

### v1.6.0 (Status UI) - 2025.11.30
*   **[New]** 화면 우측 하단에 진행 상태를 보여주는 플로팅 UI 추가.
*   **[New]** 백그라운드 실행을 위한 오디오 엔진(Oscillator) 탑재.

### v1.5.0 (Resumable Upload) - 2025.11.29
*   **[New]** 구글 드라이브 Resumable Upload API 적용 (대용량 파일 지원).
*   **[Fix]** 메모리 부족으로 인한 업로드 실패 해결.

---

## 📡 Server (Google Apps Script)

### v1.1.0 (Library API) - 2025.12.01
*   **[New]** `get_library` 요청 처리 추가.
*   **[New]** `update_library_status` 요청 처리 추가.

### v1.0.0 (Initial Release) - 2025.11.28
*   기본적인 파일 업로드 및 폴더 관리 기능.

---

## 📊 Dashboard (TokiView)

### v1.0.0 (Initial Release) - 2025.12.01
*   웹 기반 라이브러리 뷰어 출시.
*   검색, 정렬, 다크 모드 지원.
