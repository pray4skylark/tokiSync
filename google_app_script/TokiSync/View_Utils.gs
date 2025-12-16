// =======================================================
// 🛠 Viewer Utility Functions (Isolated)
// =======================================================

const INDEX_FILE_NAME = "library_index.json";

function View_authorizeCheck() {
  DriveApp.getRootFolder();
  console.log("✅ [Viewer] Auth Check Complete");
}
