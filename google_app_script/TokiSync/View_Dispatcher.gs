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
      
      const mFolders = DriveAccessService.list(data.folderId, {
          query: "name = '_MergeIndex' and mimeType = 'application/vnd.google-apps.folder'",
          fields: "files(id)"
      });
      resultBody = { found: false, data: null };
      if (mFolders.length > 0) {
          const mFolderId = mFolders[0].id;
          const fragFiles = DriveAccessService.list(mFolderId, {
              query: `name = '_toki_merge_${data.sourceId}.json'`,
              fields: "files(id)"
          });
          if (fragFiles.length > 0) {
              const fragContent = DriveAccessService.getFileContent(fragFiles[0].id);
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
      const seriesId = getOrCreateSeriesFolder(
        folderId,
        data.folderName,
        data.category || "Unknown",
        false,
      );
      if (!seriesId) {
        resultBody = { updated: false, reason: "folder not found" };
      } else {
        const booksArray = View_getBooks(seriesId, true); // bypassCache=true → 재스캔 + 캐시 기록
        const itemsCount = booksArray ? booksArray.length : 0;
        
        // [v1.6.1] Merge Index Fragment Creation
        try {
            // 1. Find or create _MergeIndex folder
            const mergeFolderId = DriveAccessService.ensureFolder(folderId, "_MergeIndex");
            
            // 2. Extract sourceId & find cacheFileId
            const meta = DriveAccessService.getMetadata(seriesId);
            const seriesFolderName = meta.name;
            const idMatch = seriesFolderName.match(/^\[(\d+)\]/);
            const sourceId = idMatch ? idMatch[1] : seriesId; // Fallback to drive ID if no stamp
            
            let cacheFileId = "";
            let retries = 3;
            while (retries > 0) {
                const cacheResults = DriveAccessService.list(seriesId, {
                    query: "name = '_toki_cache.json'",
                    fields: "files(id)"
                });
                if (cacheResults.length > 0) {
                    cacheFileId = cacheResults[0].id;
                    break;
                }
                Utilities.sleep(1500); // Wait 1.5s for Drive eventual consistency
                retries--;
            }
            
            if (cacheFileId) {
                // 3. Create or Update Fragment File
                const fragName = `_toki_merge_${sourceId}.json`;
                
                // [v1.6.2] Enrich fragment with full series metadata for dynamic Insert support
                const titleClean = seriesFolderName.replace(/^\[\d+\]\s*/, '').trim();
                
                const extraMeta = data.metadata || {};
                const fragData = JSON.stringify({
                    id: seriesId,
                    sourceId: sourceId,
                    name: titleClean,
                    folderName: seriesFolderName,
                    url: "", // V3 metadata webViewLink is not used here to keep it small
                    category: data.category || "Unknown",
                    author: extraMeta.author || "",
                    status: extraMeta.status || "연재중",
                    summary: extraMeta.summary || "",
                    thumbnail: extraMeta.thumbnail || "",
                    created: meta.modifiedTime, // modifiedTime used as fallback for created
                    cacheFileId: cacheFileId,
                    itemsCount: itemsCount,
                    lastUpdated: new Date().toISOString()
                });
                
                const existingFrags = DriveAccessService.list(mergeFolderId, {
                    query: `name = '${fragName}'`,
                    fields: "files(id)"
                });

                if (existingFrags.length > 0) {
                    DriveAccessService.updateFileContent(existingFrags[0].id, fragData);
                } else {
                    DriveAccessService.createFile(mergeFolderId, fragName, fragData, "application/json");
                }
                Debug.log(`[MergeIndex] Created fragment for ${sourceId} / ${cacheFileId}`);

                // [v1.7.0] Metadata Persistence (Phase 3)
                const metaName = "_toki_meta.json";
                const metaResults = DriveAccessService.list(seriesId, {
                    query: `name = '${metaName}'`,
                    fields: "files(id)"
                });

                if (metaResults.length > 0) {
                    DriveAccessService.updateFileContent(metaResults[0].id, fragData);
                } else {
                    DriveAccessService.createFile(seriesId, metaName, fragData, "application/json");
                }
                Debug.log(`[Metadata] Persisted metadata in series folder: ${seriesFolderName}`);
            }
            
            resultBody = { updated: true, seriesId: seriesId, mergeStatus: "success" };
        } catch (mergeErr) {
            Debug.log(`[MergeIndex] Error creating fragment: ${mergeErr.toString()}`);
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
