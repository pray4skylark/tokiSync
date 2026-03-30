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

      // 1. Find existing file using Advanced Service (V3)
      // DriveApp.getFilesByName 보다 빠르고 안정적입니다.
      const query = `'${folderId}' in parents and name = '${HISTORY_FILE_NAME}' and trashed = false`;
      const result = Drive.Files.list({
        q: query,
        fields: "files(id)",
        pageSize: 10,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      if (result.files && result.files.length > 0) {
        // 2. Update existing file
        const fileId = result.files[0].id;
        Drive.Files.update({}, fileId, blob, { supportsAllDrives: true });

        // 3. Cleanup duplicates if any
        if (result.files.length > 1) {
          for (let i = 1; i < result.files.length; i++) {
            Drive.Files.update(
              { trashed: true },
              result.files[i].id,
              null,
              { supportsAllDrives: true },
            );
          }
        }
      } else {
        // 4. Create new file
        Drive.Files.create(
          {
            name: HISTORY_FILE_NAME,
            parents: [folderId],
          },
          blob,
          { supportsAllDrives: true },
        );
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
