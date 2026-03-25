// =======================================================
// 🚀 Viewer Library Service (Isolated) - v1.4.0 Centralized Thumbnails
// =======================================================

const INDEX_FILE_NAME = "index.json";
const THUMB_FOLDER_NAME = "_Thumbnails";

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
    const root = DriveApp.getFolderById(folderId);
    const files = root.getFilesByName(INDEX_FILE_NAME);

    if (files.hasNext()) {
      const file = files.next();
      const content = file.getBlob().getDataAsString();
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
    let root;
    try {
        root = DriveApp.getFolderById(folderId);
    } catch (e) {
        Debug.log(`[SweepMergeIndex] Service Error: Cannot access root folder ${folderId}: ${e.message}`);
        return null; // Silent abort, try again next cron tick
    }

    let masterList = cachedList;
    
    // If no cachedList provided (e.g., from cron job), try to load it first
    if (!masterList) {
        try {
            const files = root.getFilesByName(INDEX_FILE_NAME);
            if (files.hasNext()) {
                const content = files.next().getBlob().getDataAsString();
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
    let mergeFolders;
    try {
        mergeFolders = root.getFoldersByName("_MergeIndex");
    } catch (e) {
        Debug.log(`[SweepMergeIndex] Service Error accessing _MergeIndex: ${e.message}`);
        return null;
    }

    if (mergeFolders.hasNext()) {
        const mFolder = mergeFolders.next();
        let mFiles;
        try {
            mFiles = mFolder.getFiles();
        } catch (e) {
            Debug.log(`[SweepMergeIndex] Service Error reading files in _MergeIndex: ${e.message}`);
            return null;
        }
        
        while (mFiles.hasNext()) {
            let mFile;
            try {
                mFile = mFiles.next();
            } catch (e) {
                Debug.log(`[SweepMergeIndex] Skip corrupted or inaccessible fragment: ${e.message}`);
                continue;
            }
            
            try {
                if (mFile.getName().startsWith("_toki_merge_")) {
                    const fragData = JSON.parse(mFile.getBlob().getDataAsString());
                    
                    const targetIndex = masterList.findIndex(s => s.sourceId === fragData.sourceId || s.id === fragData.id);
                    if (targetIndex !== -1) {
                        // [UPDATE] Existing series — patch fields
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
                        // [v1.6.2] INSERT — Brand-new series not yet in master index
                        // Guard against race condition duplicates before pushing
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
                    mFile.setTrashed(true);
                }
            } catch (e) {
                Debug.log(`[MergeIndex] Failed to process fragment ${mFile.getName()}: ${e}`);
            }
        }
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
  const root = DriveApp.getFolderById(folderId);
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
    // Assumption: _Thumbnails has reasonable count (<10k).
    // If >10k, we might need pagination here too, but GAS iterator handles it.
    // We try to fill it in 5s.
    const thumbFolders = root.getFoldersByName(THUMB_FOLDER_NAME);
    if (thumbFolders.hasNext()) {
      const tFolder = thumbFolders.next();
      const tFiles = tFolder.getFiles();
      while (tFiles.hasNext()) {
        // Safety check for time in Map building?
        // If huge, this loop might timeout.
        // Ideally we assume it fits. If not, we need a separate Step for Map building.
        // Let's rely on GAS speed for listing files.
        const tf = tFiles.next();
        // Name: "12345.jpg" -> ID: "12345"
        const tid = tf.getName().replace(/\.[^/.]+$/, "");
        state.thumbMap[tid] = tf.getId();
      }
    }

    // 2. Plan Targets
    state.targets.push({ id: folderId, category: "Uncategorized" }); // Root
    const CATS = ["Webtoon", "Manga", "Novel"];
    const folders = root.getFolders();
    while (folders.hasNext()) {
      const f = folders.next();
      if (CATS.includes(f.getName())) {
        state.targets.push({ id: f.getId(), category: f.getName() });
      }
    }
  }

  let hasMore = false;

  // Execution Loop
  while (state.step < state.targets.length) {
    const current = state.targets[state.step];
    let iterator;

    try {
      if (state.driveToken) {
        iterator = DriveApp.continueFolderIterator(state.driveToken);
      } else {
        iterator = DriveApp.getFolderById(current.id).getFolders();
      }

      while (iterator.hasNext()) {
        if (new Date().getTime() - startTime > TIME_LIMIT) {
          hasMore = true;
          break;
        }

        const folder = iterator.next();
        const name = folder.getName();

        if (name === INDEX_FILE_NAME || name === THUMB_FOLDER_NAME) continue;
        if (
          ["Webtoon", "Manga", "Novel"].includes(name) &&
          current.category === "Uncategorized"
        )
          continue;

        try {
          // Pass thumbMap
          const s = processSeriesFolder(
            folder,
            current.category,
            state.thumbMap,
          );
          if (s) seriesList.push(s);
        } catch (e) {}
      }

      if (hasMore) {
        state.driveToken = iterator.getContinuationToken();
        return {
          status: "continue",
          continuationToken: JSON.stringify(state),
          list: seriesList,
        };
      } else {
        state.step++;
        state.driveToken = null;
      }
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
  const root = DriveApp.getFolderById(folderId);
  const jsonString = JSON.stringify(list);
  const files = root.getFilesByName(INDEX_FILE_NAME);
  if (files.hasNext()) {
    files.next().setContent(jsonString);
    // 중복 파일이 존재할 경우 삭제 (처음 한 개 이후의 파일들)
    while (files.hasNext()) {
      files.next().setTrashed(true);
    }
  } else {
    root.createFile(INDEX_FILE_NAME, jsonString, MimeType.PLAIN_TEXT);
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
  const folderName = folder.getName();

  let metadata = {
    status: "ONGOING",
    authors: [],
    summary: "",
    category: categoryContext,
  };
  let seriesName = folderName;
  let sourceId = "";
  let booksCount = 0;
  let thumbnailId = "";

  // 1. [v1.7.0] Metadata Persistence (Phase 3) - Self-Healing
  const metaFiles = folder.getFilesByName("_toki_meta.json");
  if (metaFiles.hasNext()) {
    try {
      const metaData = JSON.parse(metaFiles.next().getBlob().getDataAsString());
      const tid = (thumbMap && metaData.sourceId) ? thumbMap[metaData.sourceId] : "";
      return {
        id: metaData.id || folder.getId(),
        sourceId: metaData.sourceId || "",
        name: metaData.name || folderName,
        folderName: folderName,
        url: metaData.url || folder.getUrl(),
        booksCount: metaData.itemsCount || 0,
        cacheFileId: metaData.cacheFileId || "",
        thumbnailId: tid,
        thumbnail: tid ? "" : (metaData.thumbnail || ""), 
        hasCover: !!tid,
        lastModified: metaData.lastUpdated || folder.getLastUpdated().toISOString(),
        category: metaData.category || categoryContext,
        metadata: {
            category: metaData.category || categoryContext,
            status: metaData.status || "ONGOING",
            authors: metaData.author ? [metaData.author] : [],
            summary: metaData.summary || ""
        }
      };
    } catch (e) {
      Debug.log(`[Metadata] Failed to parse _toki_meta.json for ${folderName}: ${e}`);
    }
  }

  // 2. ID Parsing "[12345] Title" (Fallback)
  const idMatch = folderName.match(/^\[(\d+)\]/);
  if (idMatch) {
    sourceId = idMatch[1];
    // Lookup Optimized Map
    if (thumbMap && thumbMap[sourceId]) {
      thumbnailId = thumbMap[sourceId];
    }
  }

  // Parse info.json (Still needed for name/author)
  const infoFiles = folder.getFilesByName("info.json");
  let thumbnailOld = "";

  if (infoFiles.hasNext()) {
    try {
      const content = infoFiles.next().getBlob().getDataAsString();
      const parsed = JSON.parse(content);

      if (parsed.title) seriesName = parsed.title;
      // If we didn't get ID from folder, try info.json (rare fallback)
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
      if (parsed.status) metadata.status = parsed.status;
      if (parsed.metadata && parsed.metadata.authors)
        metadata.authors = parsed.metadata.authors;
      else if (parsed.author) metadata.authors = [parsed.author];

      // Fallback text thumb (http)
      if (parsed.thumbnail) thumbnailOld = parsed.thumbnail;
    } catch (e) {}
  } else {
    const match = folderName.match(/^\[(\d+)\]\s*(.+)/);
    if (match) seriesName = match[2];
  }

  // Decide Final Thumbnail
  // Rule: If we have thumbnailId (from Map), use it.
  // Rule: If not, use thumbnailOld URL (but NOT base64)
  let finalThumbnail = "";
  if (thumbnailId) {
    // Good.
  } else if (thumbnailOld) {
    if (!thumbnailOld.startsWith("data:image")) {
      finalThumbnail = thumbnailOld;
    }
  } // <-- 누락된 괄호 복구

  // [v1.6.0] Task A-1: Find cacheFileId
  let cacheFileId = "";
  const cacheFiles = folder.getFilesByName("_toki_cache.json");
  if (cacheFiles.hasNext()) {
      cacheFileId = cacheFiles.next().getId();
  }

  return {
    id: folder.getId(),
    sourceId: sourceId,
    name: seriesName,
    booksCount: booksCount,
    metadata: metadata,
    thumbnail: finalThumbnail,
    thumbnailId: thumbnailId,
    hasCover: !!thumbnailId,
    cacheFileId: cacheFileId, // [v1.6.0] Store cache file ID for fast access
    lastModified: folder.getLastUpdated(),
    category: metadata.category,
  };
}

