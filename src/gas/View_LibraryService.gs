// =======================================================
// 🚀 Viewer Library Service (Isolated) - v1.4.0 Centralized Thumbnails
// =======================================================

var INDEX_FILE_NAME = "index.json";
var THUMB_FOLDER_NAME = "_Thumbnails";

/**
 * Execute an index.json read-modify-write operation with LockService protection.
 * Prevents concurrent write race conditions between SweepMergeIndex,
 * View_updateMetadata.
 *
 * @param {string} folderId - The root folder containing index.json
 * @param {Function} modifyFn - receives (masterList array), returns modified masterList
 * @param {number} maxRetries - retry count on lock failure (default 3)
 * @returns {Array} the modified masterList after successful write
 */
function withIndexLock(folderId, modifyFn, maxRetries) {
    if (maxRetries === undefined) maxRetries = 3;
    for (var attempt = 0; attempt < maxRetries; attempt++) {
        var lock = LockService.getScriptLock();
        try {
            if (!lock.tryLock(15000)) { // 15s timeout
                console.warn("[IndexLock] Lock acquisition failed (attempt " + (attempt + 1) + "/" + maxRetries + ")");
                continue;
            }

            // Read current index
            var results = DriveAccessService.list(folderId, {
                query: "name = '" + INDEX_FILE_NAME + "'",
                fields: "files(id)"
            });
            var indexFile = results.length > 0 ? results[0] : null;
            var masterList = [];
            if (indexFile) {
                var content = DriveAccessService.getFileContent(indexFile.id);
                if (content && content.trim() !== "") {
                    try { masterList = JSON.parse(content); } catch (e) { masterList = []; }
                }
            }

            // Apply modification
            masterList = modifyFn(masterList);

            // Write back
            var updatedJson = JSON.stringify(masterList);
            if (indexFile) {
                DriveAccessService.updateFileContent(indexFile.id, updatedJson);
            } else {
                DriveAccessService.createFile(folderId, INDEX_FILE_NAME, updatedJson, "application/json");
            }

            return masterList;
        } catch (e) {
            console.error("[IndexLock] Error on attempt " + (attempt + 1) + ": " + e.message);
            if (attempt >= maxRetries - 1) throw e;
        } finally {
            if (lock) {
                try { lock.releaseLock(); } catch (e) { /* ignore release errors */ }
            }
        }
    }
    throw new Error("[IndexLock] Failed to acquire lock after all retries");
}

/**
 * 해당 폴더(Libraries)의 시리즈 목록을 반환합니다.
 */
function View_getSeriesList(
  folderId,
  bypassCache = false,
  continuationToken = null,
) {
  if (!folderId) throw new Error("Folder ID is required");

  // 1. Check Cache (Only if clean start)
  if (!bypassCache && !continuationToken) {
    const files = DriveAccessService.list(folderId, {
      query: `name = '${INDEX_FILE_NAME}'`,
      fields: "files(id)"
    });

    if (files.length > 0) {
      const content = DriveAccessService.getFileContent(files[0].id);
      if (content && content.trim() !== "") {
        try {
          let cachedList = JSON.parse(content);
          
          // [v1.6.1] Merge Index Fragment Processing (Now standalone)
          const updatedList = SweepMergeIndex(folderId);
          
          return updatedList;
        } catch (e) {}
      }
    }
  }

  // 2. Rebuild (Paged)
  return View_rebuildLibraryIndex(folderId, continuationToken);
}

/**
 * [v1.6.1] Sweep the _MergeIndex queue and update the master index.
 * Uses withIndexLock to prevent concurrent write race conditions.
 * Can be called during viewer load or via a time-driven trigger.
 * @param {string} folderId The root folder ID
 * @returns {Array} The updated cached list
 */
function SweepMergeIndex(folderId) {
    return withIndexLock(folderId, function(masterList) {
        if (!masterList || !Array.isArray(masterList)) return masterList;

        let hasMerged = false;
        let mergeFolders = DriveAccessService.list(folderId, {
            query: "name = '_MergeIndex' and mimeType = 'application/vnd.google-apps.folder'",
            fields: "files(id)"
        });

        if (mergeFolders.length > 0) {
            var mFolderId = mergeFolders[0].id;
            var mFiles = DriveAccessService.list(mFolderId, {
                fields: "files(id, name)"
            });

            mFiles.forEach(function(mFile) {
                try {
                    if (mFile.name.startsWith("_toki_merge_")) {
                        var content = DriveAccessService.getFileContent(mFile.id);
                        var fragData = JSON.parse(content);

                        var targetIndex = masterList.findIndex(function(s) {
                            return s.sourceId === fragData.sourceId || s.id === fragData.id;
                        });
                        if (targetIndex !== -1) {
                            masterList[targetIndex].cacheFileId = fragData.cacheFileId;
                            if (fragData.itemsCount !== undefined) {
                                masterList[targetIndex].itemsCount = fragData.itemsCount;
                            }
                            if (fragData.lastUpdated) {
                                masterList[targetIndex].lastModified = new Date(fragData.lastUpdated);
                            }
                            hasMerged = true;
                            Debug.log("[MergeIndex] Merged fragment into main list: " + fragData.sourceId);
                        } else if (fragData.name && fragData.id) {
                            var isDuplicate = masterList.some(function(s) {
                                return s.sourceId === fragData.sourceId || s.id === fragData.id;
                            });
                            if (!isDuplicate) {
                                masterList.push({
                                    id: fragData.id,
                                    sourceId: fragData.sourceId || fragData.id,
                                    name: fragData.name,
                                    folderName: fragData.folderName || fragData.name,
                                    url: fragData.url || "",
                                    cacheFileId: fragData.cacheFileId,
                                    itemsCount: fragData.itemsCount || 0,
                                    category: fragData.category || "Unknown",
                                    created: fragData.created || new Date().toISOString(),
                                    lastModified: new Date(fragData.lastUpdated || Date.now())
                                });
                                hasMerged = true;
                                Debug.log("[MergeIndex] Inserted NEW series into master list: " + fragData.name + " (" + fragData.sourceId + ")");
                            }
                        }
                        DriveAccessService.trash(mFile.id);
                    }
                } catch (e) {
                    Debug.log("[MergeIndex] Failed to process fragment " + mFile.name + ": " + e);
                }
            });
        }

        return masterList;
    });
}

/**
 * v1.4.0: Centralized Thumbnail Logic
 * 1. Build Thumbnail Map from '_Thumbnails' folder
 * 2. Scan Series Folders using Map (No file scan inside series)
 */
function View_rebuildLibraryIndex(folderId, continuationToken) {
  const startTime = new Date().getTime();
  const TIME_LIMIT = 20000; // 20 Seconds
  const seriesList = [];

  // State
  let state = continuationToken
    ? JSON.parse(continuationToken)
    : {
        step: 0,
        targets: [],
        driveToken: null,
        thumbMap: {}, // { SeriesID: FileID } - Carried over pagination
      };

  // Phase 0: Plan Targets & Build Thumbnail Map (Only on first run)
  if (state.step === 0 && state.targets.length === 0) {
    // 1. Build Thumbnail Map
    const thumbFolders = DriveAccessService.list(folderId, {
      query: `name = '${THUMB_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder'`,
      fields: "files(id)"
    });

    if (thumbFolders.length > 0) {
      const tFiles = DriveAccessService.list(thumbFolders[0].id, {
        fields: "files(id, name)"
      });
      tFiles.forEach(tf => {
        const tid = tf.name.replace(/\.[^/.]+$/, "");
        state.thumbMap[tid] = tf.id;
      });
    }

    // 2. Plan Targets — Root 및 대분류 카테고리 플래닝 (Kavita 호환 및 기존 카테고리 하이브리드 지원)
    state.targets.push({ id: folderId, category: "Uncategorized" });
    
    const CATS = ["Webtoon", "Manga", "Novel"];
    const folders = DriveAccessService.list(folderId, {
      query: "mimeType = 'application/vnd.google-apps.folder'",
      fields: "files(id, name)"
    });
    
    folders.forEach(f => {
      if (CATS.includes(f.name)) {
        state.targets.push({ id: f.id, category: f.name });
      }
    });
  }

  let hasMore = false;

  // Execution Loop
  while (state.step < state.targets.length) {
    const current = state.targets[state.step];

    try {
      const response = DriveAccessService.listPaged(current.id, {
        pageToken: state.driveToken,
        pageSize: 50,
        query: "mimeType = 'application/vnd.google-apps.folder'"
      });

      const folders = response.files;
      for (const folder of folders) {
        if (new Date().getTime() - startTime > TIME_LIMIT) {
          hasMore = true;
          break;
        }

        const name = folder.name;
        if (name === INDEX_FILE_NAME || name === THUMB_FOLDER_NAME) continue;
        if (
          ["Webtoon", "Manga", "Novel"].includes(name) &&
          current.category === "Uncategorized"
        ) {
          continue;
        }

        try {
          const s = processSeriesFolder(
            folder,
            current.category,
            state.thumbMap,
          );
          if (s) seriesList.push(s);
        } catch (e) {
          Debug.log(`Error processing folder ${name}: ${e}`);
        }
      }

      if (response.nextPageToken) {
        state.driveToken = response.nextPageToken;
        return {
          status: "continue",
          continuationToken: JSON.stringify(state),
          list: seriesList,
        };
      }

      if (hasMore) {
        state.step++;
        state.driveToken = null;
        return {
          status: "continue",
          continuationToken: JSON.stringify(state),
          list: seriesList,
        };
      } 
      
      state.step++;
      state.driveToken = null;
      
    } catch (e) {
      Debug.log(`Error in step ${state.step}: ${e}`);
      state.step++;
      state.driveToken = null;
    }
  }

  return { status: "completed", list: seriesList };
}

function View_saveIndex(folderId, list) {
  if (!list || !Array.isArray(list)) return;
  list.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  const jsonString = JSON.stringify(list);
  
  const results = DriveAccessService.list(folderId, {
    query: `name = '${INDEX_FILE_NAME}'`,
    fields: "files(id)"
  });

  if (results.length > 0) {
    DriveAccessService.updateFileContent(results[0].id, jsonString);
    for (let i = 1; i < results.length; i++) {
        DriveAccessService.trash(results[i].id);
    }
  } else {
    DriveAccessService.createFile(folderId, INDEX_FILE_NAME, jsonString, "application/json");
  }
}

/**
 * [Helper] 단일 시리즈 폴더 처리
 *
 * Optimization:
 * - NO `getFilesByName('cover.jpg')`
 * - Look up `thumbMap` for cover ID
 * - ONLY scan for `info.json`
 */
function processSeriesFolder(folder, categoryContext, thumbMap) {
  const folderId = folder.id;
  const folderName = folder.name;

  let metadata = {
    status: "연재중",
    authors: [],
    summary: "",
    category: categoryContext || "Unknown",
  };
  let seriesName = folderName;
  let sourceId = "";
  let booksCount = 0;
  let thumbnailId = "";

  // 1. [v1.7.0] Metadata Persistence (Phase 3) - Self-Healing
  const metaResults = DriveAccessService.list(folderId, {
    query: "name = '_toki_meta.json'",
    fields: "files(id)"
  });

  if (metaResults.length > 0) {
    try {
      const content = DriveAccessService.getFileContent(metaResults[0].id);
      const metaData = JSON.parse(content);
      const tid = ((thumbMap && metaData.sourceId) ? thumbMap[metaData.sourceId] : "") || metaData.thumbnailId || "";
      return {
        id: metaData.id || folderId,
        sourceId: metaData.sourceId || "",
        vendorId: metaData.vendorId || metaData.sourceId || "",
        name: metaData.name || folderName,
        originalSeriesTitle: metaData.originalSeriesTitle || "",
        folderName: folderName,
        url: metaData.url || "", // V3 metadata doesn't have webViewLink by default unless requested
        booksCount: metaData.itemsCount || 0,
        cacheFileId: metaData.cacheFileId || "",
        thumbnailId: tid,
        thumbnail: tid ? "" : (metaData.thumbnail || ""), 
        hasCover: !!tid,
        lastModified: metaData.lastUpdated || folder.modifiedTime,
            category: metaData.category || categoryContext || "Unknown",
        vendor: metaData.vendor || "",
        metadata: {
            category: metaData.category || categoryContext || "Unknown",
            status: normalizeStatus(metaData.status) || "연재중",
            authors: metaData.author ? [metaData.author] : [],
            summary: metaData.summary || "",
            vendor: metaData.vendor || "",
            vendorId: metaData.vendorId || metaData.sourceId || "",
            originalSeriesTitle: metaData.originalSeriesTitle || ""
        }
      };
    } catch (e) {
      Debug.log(`[Metadata] Failed to parse _toki_meta.json for ${folderName}: ${e}`);
    }
  }

  const idMatch = folderName.match(/^\[([a-zA-Z0-9_\-]+)\]/);
  if (idMatch) {
    sourceId = idMatch[1];
    if (thumbMap && thumbMap[sourceId]) {
      thumbnailId = thumbMap[sourceId];
    }
  }

  const infoResults = DriveAccessService.list(folderId, {
    query: "name = 'info.json'",
    fields: "files(id)"
  });
  let thumbnailOld = "";

  if (infoResults.length > 0) {
    try {
      const content = DriveAccessService.getFileContent(infoResults[0].id);
      const parsed = JSON.parse(content);

      if (parsed.title) seriesName = parsed.title;
      if (!sourceId && parsed.id) {
        sourceId = parsed.id;
        if (thumbMap && thumbMap[sourceId]) thumbnailId = thumbMap[sourceId];
      }
      if (parsed.file_count) booksCount = parsed.file_count;

      if (
        parsed.category &&
        (!categoryContext || categoryContext === "Uncategorized")
      ) {
        metadata.category = parsed.category;
      }
      if (parsed.status) metadata.status = normalizeStatus(parsed.status);
      if (parsed.metadata && parsed.metadata.authors)
        metadata.authors = parsed.metadata.authors;
      else if (parsed.author) metadata.authors = [parsed.author];

      if (parsed.vendor) metadata.vendor = parsed.vendor;
      else if (parsed.metadata && parsed.metadata.vendor) metadata.vendor = parsed.metadata.vendor;

      if (parsed.thumbnail) thumbnailOld = parsed.thumbnail;
    } catch (e) {}
  } else {
    const match = folderName.match(/^\[([a-zA-Z0-9_\-]+)\]\s*(.+)/);
    if (match) seriesName = match[2];
  }

  let finalThumbnail = "";
  if (thumbnailId) {
    // Good.
  } else if (thumbnailOld) {
    if (!thumbnailOld.startsWith("data:image")) {
      finalThumbnail = thumbnailOld;
    }
  }

  let cacheFileId = "";
  const cacheResults = DriveAccessService.list(folderId, {
    query: "name = '_toki_cache.json'",
    fields: "files(id)"
  });
  if (cacheResults.length > 0) {
      cacheFileId = cacheResults[0].id;
  }

  return {
    id: folderId,
    sourceId: sourceId,
    vendorId: sourceId,
    name: seriesName,
    originalSeriesTitle: "",
    booksCount: booksCount,
    metadata: metadata,
    vendor: metadata.vendor || "",
    thumbnail: finalThumbnail,
    thumbnailId: thumbnailId,
    hasCover: !!thumbnailId,
    cacheFileId: cacheFileId, 
    lastModified: folder.modifiedTime,
    category: metadata.category,
  };
}

/**
 * [v1.21.0] 시리즈 폴더의 메타데이터를 갱신하고 index.json에 반영합니다.
 */
function View_updateMetadata(seriesId, metadata, rootFolderId) {
  if (!seriesId) throw new Error("seriesId is required");
  
  // 1. Get Series Folder Metadata to get folderName
  const meta = DriveAccessService.getMetadata(seriesId);
  const folderName = meta.name;
  
  // 2. Find or Create _toki_meta.json
  const metaName = "_toki_meta.json";
  const metaResults = DriveAccessService.list(seriesId, {
    query: `name = '${metaName}'`,
    fields: "files(id)"
  });
  
  let existingMeta = {};
  if (metaResults.length > 0) {
    try {
      const content = DriveAccessService.getFileContent(metaResults[0].id);
      existingMeta = JSON.parse(content);
    } catch (e) {
      Logger.log("Failed to parse existing meta file: " + e.toString());
    }
  }
  
  // 3. Update fields (preserving system fields)
  const updatedMeta = {
    ...existingMeta,
    id: seriesId,
    name: metadata.name !== undefined ? metadata.name : (existingMeta.name || folderName.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, '').trim()),
    category: metadata.category !== undefined ? metadata.category : (existingMeta.category || "Unknown"),
    author: metadata.author !== undefined ? metadata.author : (existingMeta.author || ""),
    vendor: metadata.vendor !== undefined ? metadata.vendor : (existingMeta.vendor || ""),
    vendorId: metadata.vendorId !== undefined ? metadata.vendorId : (existingMeta.vendorId || existingMeta.sourceId || ""),
    originalSeriesTitle: metadata.originalSeriesTitle !== undefined ? metadata.originalSeriesTitle : (existingMeta.originalSeriesTitle || ""),
    status: metadata.status !== undefined ? normalizeStatus(metadata.status) : (normalizeStatus(existingMeta.status) || "연재중"),
    summary: metadata.summary !== undefined ? metadata.summary : (existingMeta.summary || ""),
    thumbnail: metadata.thumbnail !== undefined ? metadata.thumbnail : (existingMeta.thumbnail || ""),
    thumbnailId: metadata.thumbnailId !== undefined ? metadata.thumbnailId : (existingMeta.thumbnailId || ""),
    lastUpdated: new Date().toISOString()
  };
  
  const metaString = JSON.stringify(updatedMeta);
  if (metaResults.length > 0) {
    DriveAccessService.updateFileContent(metaResults[0].id, metaString);
  } else {
    DriveAccessService.createFile(seriesId, metaName, metaString, "application/json");
  }
  
  // 4. Update index.json (Find and replace) — with LockService protection
  if (rootFolderId) {
    withIndexLock(rootFolderId, function(masterList) {
      var idx = masterList.findIndex(function(s) { return s.id === seriesId; });
      if (idx !== -1) {
        masterList[idx].name = updatedMeta.name;
        masterList[idx].category = updatedMeta.category;
        masterList[idx].thumbnail = updatedMeta.thumbnail;
        masterList[idx].thumbnailId = updatedMeta.thumbnailId;
        masterList[idx].lastModified = updatedMeta.lastUpdated;
        masterList[idx].vendor = updatedMeta.vendor;
        masterList[idx].vendorId = updatedMeta.vendorId;
        masterList[idx].originalSeriesTitle = updatedMeta.originalSeriesTitle;
        if (!masterList[idx].metadata) masterList[idx].metadata = {};
        masterList[idx].metadata.category = updatedMeta.category;
        masterList[idx].metadata.status = updatedMeta.status;
        masterList[idx].metadata.authors = updatedMeta.author ? [updatedMeta.author] : [];
        masterList[idx].metadata.summary = updatedMeta.summary;
        masterList[idx].metadata.vendor = updatedMeta.vendor;
        masterList[idx].metadata.vendorId = updatedMeta.vendorId;
        masterList[idx].metadata.originalSeriesTitle = updatedMeta.originalSeriesTitle;
      }
      return masterList;
    });
  }
  
  return updatedMeta;
}

/**
 * [v1.21.0] 썸네일 파일을 업로드하고, 시리즈 메타데이터의 thumbnailId를 갱신합니다.
 */
function View_uploadThumbnail(seriesId, base64Data, rootFolderId) {
  if (!seriesId) throw new Error("seriesId is required");
  if (!base64Data) throw new Error("base64Data is required");
  
  // 1. Decode base64 to binary bytes
  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, "image/jpeg", "_thumbnail.jpg");
  
  // 2. Check if _thumbnail.jpg already exists
  const existingFiles = DriveAccessService.list(seriesId, {
    query: "name = '_thumbnail.jpg' and trashed = false",
    fields: "files(id)"
  });
  
  let fileId = "";
  if (existingFiles.length > 0) {
    fileId = existingFiles[0].id;
    // Overwrite content
    Drive.Files.update({}, fileId, blob, { supportsAllDrives: true });
  } else {
    // Create new file
    const metadata = {
      name: "_thumbnail.jpg",
      parents: [seriesId]
    };
    const newFile = Drive.Files.create(metadata, blob, { supportsAllDrives: true });
    fileId = newFile.id;
  }
  
  // 3. Update metadata in series
  View_updateMetadata(seriesId, { thumbnailId: fileId, thumbnail: "" }, rootFolderId);
  
  return { success: true, thumbnailId: fileId };
}

/**
 * 상태값을 표준 한글 규격("연재중", "완결", "휴재")으로 정규화합니다.
 */
function normalizeStatus(status) {
  if (!status) return "연재중";
  const upper = status.toString().trim().toUpperCase();
  if (upper === "ONGOING" || upper === "연재중") return "연재중";
  if (upper === "COMPLETED" || upper === "완결") return "완결";
  if (upper === "HIATUS" || upper === "휴재") return "휴재";
  return status;
}

