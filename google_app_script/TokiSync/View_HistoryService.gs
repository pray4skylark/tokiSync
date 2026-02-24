// =======================================================
// 📖 View History Service
// Drive 루트에 read_history.json 저장/불러오기
// Merge 로직은 클라이언트(뷰어)에서 처리
// =======================================================

const HISTORY_FILE_NAME = "read_history.json";

/**
 * read_history.json 불러오기
 * @param {string} folderId - 루트 폴더 ID
 * @returns {Array} 이력 배열 (없으면 빈 배열)
 */
function View_getReadHistory(folderId) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFilesByName(HISTORY_FILE_NAME);
    if (!files.hasNext()) {
      Debug.log("[History] read_history.json 없음 → 빈 배열 반환");
      return createRes("success", []);
    }
    const content = files.next().getBlob().getDataAsString();
    const data = JSON.parse(content);
    Debug.log(`[History] 불러오기 완료: ${data.length}개 레코드`);
    return createRes("success", data);
  } catch (e) {
    Debug.error("[History] 불러오기 실패", e);
    return createRes("error", `History fetch failed: ${e.message}`);
  }
}

/**
 * read_history.json 저장 (전체 덮어쓰기)
 * Merge는 클라이언트에서 완료된 상태로 받음
 * @param {Object} data - { history: Array }
 * @param {string} folderId - 루트 폴더 ID
 */
function View_saveReadHistory(data, folderId) {
  try {
    if (!Array.isArray(data.history)) {
      return createRes(
        "error",
        "Invalid history payload: history must be an array",
      );
    }
    const folder = DriveApp.getFolderById(folderId);
    const jsonString = JSON.stringify(data.history);
    const files = folder.getFilesByName(HISTORY_FILE_NAME);
    if (files.hasNext()) {
      files.next().setContent(jsonString);
    } else {
      folder.createFile(HISTORY_FILE_NAME, jsonString, MimeType.PLAIN_TEXT);
    }
    Debug.log(`[History] 저장 완료: ${data.history.length}개 레코드`);
    return createRes("success", "History saved");
  } catch (e) {
    Debug.error("[History] 저장 실패", e);
    return createRes("error", `History save failed: ${e.message}`);
  }
}
