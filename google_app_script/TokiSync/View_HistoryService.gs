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
    const results = DriveAccessService.list(folderId, {
      query: `name = '${HISTORY_FILE_NAME}'`,
      fields: "files(id)"
    });

    if (results.length === 0) {
      Debug.log("[History] read_history.json 없음 → 빈 배열 반환");
      return createRes("success", []);
    }

    const content = DriveAccessService.getFileContent(results[0].id);
    const data = JSON.parse(content);
    Debug.log(`[History] 불러오기 완료: ${data.length}개 레코드`);
    return createRes("success", data);
  } catch (e) {
    Debug.error("[History] 불러오기 실패", e);
    return createRes("error", `History fetch failed: ${e.message}`);
  }
}

/**
 * read_history.json 저장 (Retry + Advanced Service 적용)
 * Merge는 클라이언트에서 완료된 상태로 받음
 * @param {Object} data - { history: Array }
 * @param {string} folderId - 루트 폴더 ID
 */
function View_saveReadHistory(data, folderId) {
  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (!Array.isArray(data.history)) {
        return createRes(
          "error",
          "Invalid history payload: history must be an array",
        );
      }

      const jsonString = JSON.stringify(data.history);
      const blob = Utilities.newBlob(
        jsonString,
        "application/json",
        HISTORY_FILE_NAME,
      );

      const results = DriveAccessService.list(folderId, {
        query: `name = '${HISTORY_FILE_NAME}'`,
        fields: "files(id)"
      });

      if (results.length > 0) {
        const fileId = results[0].id;
        DriveAccessService.updateFileContent(fileId, jsonString);

        if (results.length > 1) {
          for (let i = 1; i < results.length; i++) {
            DriveAccessService.trash(results[i].id);
          }
        }
      } else {
        DriveAccessService.createFile(folderId, HISTORY_FILE_NAME, jsonString, "application/json");
      }

      Debug.log(
        `[History] 저장 성공 (시도: ${attempt}/${MAX_RETRIES}, 레코드: ${data.history.length})`,
      );
      return createRes("success", "History saved");
    } catch (e) {
      lastError = e;
      Debug.warn(`[History] 저장 시도 ${attempt} 실패: ${e.message}`);
      if (attempt < MAX_RETRIES) {
        Utilities.sleep(1000 * attempt); // Exp backoff
      }
    }
  }

  Debug.error(`[History] 최종 저장 실패 (${MAX_RETRIES}회 시도)`, lastError);
  return createRes(
    "error",
    `History save failed after ${MAX_RETRIES} attempts: ${lastError.message}`,
  );
}
