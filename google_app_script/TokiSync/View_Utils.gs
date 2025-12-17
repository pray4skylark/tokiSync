// =======================================================
// 🛠 Viewer Utility Functions (Isolated)
// =======================================================

const INDEX_FILE_NAME = "library_index.json";

/**
 * Viewer 전용 권한 확인 함수
 * 이 함수를 실행하여 View 관련 스코프(DriveApp) 권한을 승인받습니다.
 */
function View_authorizeCheck() {
  DriveApp.getRootFolder();
  console.log("✅ [Viewer] Auth Check Complete");
}
