// =======================================================
// 📡 Viewer Action Dispatcher (Controller)
// =======================================================

/**
 * Viewer 관련 요청을 처리하는 중앙 라우터
 * `view_` 접두사가 붙은 요청(`view_get_library`, `view_get_books` 등)을 적절한 서비스 함수로 연결합니다.
 *
 * @param {Object} data - 클라이언트 요청 페이로드
 * @returns {TextOutput} JSON 응답
 */
function View_Dispatcher(data) {
  try {
    const action = data.type; // Use 'type' to match TokiSync Main.gs convention
    const folderId = data.folderId;

    let resultBody = null;

    // Route Actions
    if (action === "view_get_library") {
      if (!data.folderId) throw new Error("folderId is required for library");
      const bypassCache = data.bypassCache === true;
      const continuationToken = data.continuationToken || null;
      resultBody = View_getSeriesList(
        data.folderId,
        bypassCache,
        continuationToken,
      );
    } else if (action === "view_get_books" || action === "view_refresh_cache") {
      if (!data.seriesId) throw new Error("seriesId is required for books");
      const bypassCache =
        data.bypassCache === true || action === "view_refresh_cache";
      resultBody = View_getBooks(data.seriesId, bypassCache);
    } else if (action === "view_get_chunk") {
      if (!data.fileId) throw new Error("fileId is required");
      // Chunk logic
      const offset = data.offset || 0;
      const length = data.length || 10 * 1024 * 1024;
      resultBody = View_getFileChunk(data.fileId, offset, length);
    } else if (action === "view_get_token") {
      // Direct Drive Access: OAuth Token Provider
      resultBody = view_get_token();
      return resultBody; // Already wrapped by createRes in SyncService
    } else if (action === "view_save_index") {
      if (!data.seriesList) throw new Error("seriesList is required");
      View_saveIndex(data.folderId, data.seriesList);
      resultBody = { saved: true };
    } else if (action === "view_migrate_thumbnails") {
      // v1.4.0 Migration
      resultBody = Migrate_MoveThumbnails(data.folderId);
    } else if (action === "view_migrate_filenames") {
      // v1.4.0 Migration (Renaming)
      if (!data.seriesId)
        throw new Error("seriesId is required for filename migration");
      resultBody = Migrate_RenameFiles(data.seriesId, data.folderId);
    } else if (action === "view_history_get") {
      if (!folderId) throw new Error("folderId is required for history");
      resultBody = View_getReadHistory(folderId);
      return resultBody; // Already wrapped in createRes
    } else if (action === "view_history_save") {
      if (!folderId) throw new Error("folderId is required for history");
      resultBody = View_saveReadHistory(data, folderId);
      return resultBody; // Already wrapped in createRes
    } else {
      throw new Error("Unknown Viewer Action: " + action);
    }

    return createRes("success", resultBody, Debug.getLogs());
  } catch (e) {
    return createRes("error", e.toString());
  }
}
