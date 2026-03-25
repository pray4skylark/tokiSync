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
    } else if (action === "view_get_books_by_cache") {
      // [v1.6.0] Task A-4: Fast path cache retrieval
      if (!data.cacheFileId) throw new Error("cacheFileId is required for direct cache access");
      resultBody = View_getBooksByCacheId(data.cacheFileId);
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
    } else if (action === "view_get_merge_index") {
      // [v1.6.1] Fast Path Fallback: Get Merge Index Fragment directly
      if (!data.folderId || !data.sourceId) throw new Error("folderId and sourceId are required for merge index");
      const rootFolder = DriveApp.getFolderById(data.folderId);
      const mFolders = rootFolder.getFoldersByName("_MergeIndex");
      resultBody = { found: false, data: null };
      if (mFolders.hasNext()) {
          const mFolder = mFolders.next();
          const fragFiles = mFolder.getFilesByName(`_toki_merge_${data.sourceId}.json`);
          if (fragFiles.hasNext()) {
              const fragContent = fragFiles.next().getBlob().getDataAsString();
              resultBody = { found: true, data: JSON.parse(fragContent) };
          }
      }
    } else if (action === "view_history_get") {
      if (!folderId) throw new Error("folderId is required for history");
      resultBody = View_getReadHistory(folderId);
      return resultBody; // Already wrapped in createRes
    } else if (action === "view_history_save") {
      if (!folderId) throw new Error("folderId is required for history");
      resultBody = View_saveReadHistory(data, folderId);
      return resultBody; // Already wrapped in createRes
    } else if (action === "view_update_cache") {
      // UserScript 업로드 완료 후 호출 — folderName 기반으로 캐시 갱신
      if (!data.folderName)
        throw new Error("folderName is required for cache update");
      const seriesFolder = getOrCreateSeriesFolder(
        folderId,
        data.folderName,
        data.category || "Unknown",
        false,
      );
      if (!seriesFolder) {
        resultBody = { updated: false, reason: "folder not found" };
      } else {
        const seriesId = seriesFolder.getId();
        const booksArray = View_getBooks(seriesId, true); // bypassCache=true → 재스캔 + 캐시 기록
        const itemsCount = booksArray ? booksArray.length : 0;
        
        // [v1.6.1] Merge Index Fragment Creation
        try {
            const rootFolder = DriveApp.getFolderById(folderId);
            
            // 1. Find or create _MergeIndex folder
            let mergeFolder;
            const mFolders = rootFolder.getFoldersByName("_MergeIndex");
            if (mFolders.hasNext()) {
                mergeFolder = mFolders.next();
            } else {
                mergeFolder = rootFolder.createFolder("_MergeIndex");
            }
            
            // 2. Extract sourceId & find cacheFileId
            const folderName = seriesFolder.getName();
            const idMatch = folderName.match(/^\[(\d+)\]/);
            const sourceId = idMatch ? idMatch[1] : seriesId; // Fallback to drive ID if no stamp
            
            let cacheFileId = "";
            let retries = 3;
            while (retries > 0) {
                const cacheFiles = seriesFolder.getFilesByName("_toki_cache.json");
                if (cacheFiles.hasNext()) {
                    cacheFileId = cacheFiles.next().getId();
                    break;
                }
                Utilities.sleep(1500); // Wait 1.5s for Drive eventual consistency
                retries--;
            }
            
            if (cacheFileId) {
                // 3. Create or Update Fragment File
                const fragName = `_toki_merge_${sourceId}.json`;
                
                // [v1.6.2] Enrich fragment with full series metadata for dynamic Insert support
                // Allows SweepMergeIndex to add brand-new series without a full rebuild.
                const seriesFolderName = seriesFolder.getName();
                // Extract clean title from "[12345] 작품명" → "작품명"
                const titleClean = seriesFolderName.replace(/^\[\d+\]\s*/, '').trim();
                
                const fragData = JSON.stringify({
                    id: seriesId,
                    sourceId: sourceId,
                    name: titleClean,
                    folderName: seriesFolderName,
                    url: seriesFolder.getUrl(),
                    category: data.category || "Unknown",
                    created: seriesFolder.getDateCreated().toISOString(),
                    cacheFileId: cacheFileId,
                    itemsCount: itemsCount,
                    lastUpdated: new Date().toISOString()
                });
                
                const existingFrags = mergeFolder.getFilesByName(fragName);
                if (existingFrags.hasNext()) {
                    const frag = existingFrags.next();
                    frag.setContent(fragData); // Update existing
                } else {
                    mergeFolder.createFile(fragName, fragData, MimeType.PLAIN_TEXT);
                }
                Debug.log(`[MergeIndex] Created fragment for ${sourceId} / ${cacheFileId}`);
            }
            
            resultBody = { updated: true, seriesId: seriesId, mergeStatus: "success" };
        } catch (mergeErr) {
            Debug.log(`[MergeIndex] Error creating fragment: ${mergeErr.toString()}`);
            // Non-fatal, let the response succeed but return the error for debugging
            resultBody = { updated: true, seriesId: seriesId, mergeStatus: "failed", error: mergeErr.toString() };
        }
      }
    } else {
      throw new Error("Unknown Viewer Action: " + action);
    }

    return createRes("success", resultBody, Debug.getLogs());
  } catch (e) {
    return createRes("error", e.toString());
  }
}
