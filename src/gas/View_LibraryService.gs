// =======================================================
// 🚀 Viewer Library Service (Isolated) - v1.4.0 Centralized Thumbnails
// =======================================================

var INDEX_FILE_NAME = "index.json";
var THUMB_FOLDER_NAME = "_Thumbnails";

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
          const updatedList = SweepMergeIndex(folderId, cachedList);
          
          return updatedList;
        } catch (e) {}
      }
    }
  }

  // 2. Rebuild (Paged)
  return View_rebuildLibraryIndex(folderId, continuationToken);
}

/**
 * [v1.6.1] Sweep the _MergeIndex queue and update the master index cached list.
 * Can be called during viewer load or via a time-driven trigger.
 * @param {string} folderId The root folder ID
 * @param {Array} cachedList The currently loaded master index list (or null to load it)
 * @returns {Array} The updated cached list
 */
function SweepMergeIndex(folderId, cachedList) {
    let masterList = cachedList;
    
    // If no cachedList provided (e.g., from cron job), try to load it first
    if (!masterList) {
        try {
            const results = DriveAccessService.list(folderId, {
                query: `name = '${INDEX_FILE_NAME}'`,
                fields: "files(id)"
            });
            if (results.length > 0) {
                const content = DriveAccessService.getFileContent(results[0].id);
                if (content && content.trim() !== "") {
                    try { masterList = JSON.parse(content); } catch (e) { return null; }
                }
            }
        } catch (e) {
            Debug.log(`[SweepMergeIndex] Service Error reading index.json: ${e.message}`);
            return null;
        }
    }
    
    if (!masterList || !Array.isArray(masterList)) return null;

    let hasMerged = false;
    let mergeFolders = DriveAccessService.list(folderId, {
        query: "name = '_MergeIndex' and mimeType = 'application/vnd.google-apps.folder'",
        fields: "files(id)"
    });

    if (mergeFolders.length > 0) {
        const mFolderId = mergeFolders[0].id;
        let mFiles = DriveAccessService.list(mFolderId, {
            fields: "files(id, name)"
        });
        
        mFiles.forEach(mFile => {
            try {
                if (mFile.name.startsWith("_toki_merge_")) {
                    const content = DriveAccessService.getFileContent(mFile.id);
                    const fragData = JSON.parse(content);
                    
                    const targetIndex = masterList.findIndex(s => s.sourceId === fragData.sourceId || s.id === fragData.id);
                    if (targetIndex !== -1) {
                        masterList[targetIndex].cacheFileId = fragData.cacheFileId;
                        if (fragData.itemsCount !== undefined) {
                            masterList[targetIndex].itemsCount = fragData.itemsCount;
                        }
                        if (fragData.lastUpdated) {
                            masterList[targetIndex].lastModified = new Date(fragData.lastUpdated);
                        }
                        hasMerged = true;
                        Debug.log(`[MergeIndex] Merged fragment into main list: ${fragData.sourceId}`);
                    } else if (fragData.name && fragData.id) {
                        const isDuplicate = masterList.some(s => s.sourceId === fragData.sourceId || s.id === fragData.id);
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
                            Debug.log(`[MergeIndex] Inserted NEW series into master list: ${fragData.name} (${fragData.sourceId})`);
                        }
                    }
                    DriveAccessService.trash(mFile.id);
                }
            } catch (e) {
                Debug.log(`[MergeIndex] Failed to process fragment ${mFile.name}: ${e}`);
            }
        });
    }
    
    if (hasMerged) {
        View_saveIndex(folderId, masterList);
        Debug.log("[MergeIndex] Saved updated master index after merging fragments.");
    }
    
    return masterList;
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

    // 2. Plan Targets
    state.targets.push({ id: folderId, category: "Uncategorized" }); // Root
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
        pageSize: 50, // 페이지별 처리량 조절
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
        )
          continue;

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

      if (hasMore || response.nextPageToken) {
        state.driveToken = response.nextPageToken;
        // 내뱉기 전에 루프 중간 종료 여부 판단 (hasMore는 시간 초과, nextPageToken은 순수 로드 완료)
        if (hasMore || response.nextPageToken) {
            return {
              status: "continue",
              continuationToken: JSON.stringify(state),
              list: seriesList,
            };
        }
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
    category: categoryContext,
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
        name: metaData.name || folderName,
        folderName: folderName,
        url: metaData.url || "", // V3 metadata doesn't have webViewLink by default unless requested
        booksCount: metaData.itemsCount || 0,
        cacheFileId: metaData.cacheFileId || "",
        thumbnailId: tid,
        thumbnail: tid ? "" : (metaData.thumbnail || ""), 
        hasCover: !!tid,
        lastModified: metaData.lastUpdated || folder.modifiedTime,
        category: metaData.category || categoryContext,
        vendor: metaData.vendor || "",
        metadata: {
            category: metaData.category || categoryContext,
            status: normalizeStatus(metaData.status) || "연재중",
            authors: metaData.author ? [metaData.author] : [],
            summary: metaData.summary || "",
            vendor: metaData.vendor || ""
        }
      };
    } catch (e) {
      Debug.log(`[Metadata] Failed to parse _toki_meta.json for ${folderName}: ${e}`);
    }
  }

  const idMatch = folderName.match(/^\[(\d+)\]/);
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
    const match = folderName.match(/^\[(\d+)\]\s*(.+)/);
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
    name: seriesName,
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
    name: metadata.name !== undefined ? metadata.name : (existingMeta.name || folderName.replace(/^\[\d+\]\s*/, '').trim()),
    category: metadata.category !== undefined ? metadata.category : (existingMeta.category || "Unknown"),
    author: metadata.author !== undefined ? metadata.author : (existingMeta.author || ""),
    vendor: metadata.vendor !== undefined ? metadata.vendor : (existingMeta.vendor || ""),
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
  
  // 4. Update index.json (Find and replace)
  if (rootFolderId) {
    const results = DriveAccessService.list(rootFolderId, {
      query: `name = '${INDEX_FILE_NAME}'`,
      fields: "files(id)"
    });
    
    if (results.length > 0) {
      try {
        const content = DriveAccessService.getFileContent(results[0].id);
        if (content && content.trim() !== "") {
          const list = JSON.parse(content);
          const idx = list.findIndex(s => s.id === seriesId);
          if (idx !== -1) {
            list[idx].name = updatedMeta.name;
            list[idx].category = updatedMeta.category;
            list[idx].thumbnail = updatedMeta.thumbnail;
            list[idx].thumbnailId = updatedMeta.thumbnailId;
            list[idx].lastModified = updatedMeta.lastUpdated;
            list[idx].vendor = updatedMeta.vendor;
            if (!list[idx].metadata) list[idx].metadata = {};
            list[idx].metadata.category = updatedMeta.category;
            list[idx].metadata.status = updatedMeta.status;
            list[idx].metadata.authors = updatedMeta.author ? [updatedMeta.author] : [];
            list[idx].metadata.summary = updatedMeta.summary;
            list[idx].metadata.vendor = updatedMeta.vendor;
            
            View_saveIndex(rootFolderId, list);
          }
        }
      } catch (e) {
        Logger.log("[Metadata] Failed to update index.json: " + e.toString());
      }
    }
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

