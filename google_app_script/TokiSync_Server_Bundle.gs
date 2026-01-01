/* ⚙️ TokiSync Server Code Bundle v3.3.1 */

/* ========================================================================== */
/* FILE: Main.gs (Entry Point) */
/* ========================================================================== */

// ⚙️ TokiSync API Server v3.1.0-beta.251216.0001 (Stateless)
// Re-packaged for v3.3.1 Guide

/**
 * [GET] Server Status Check
 */
function doGet(e) {
  return ContentService.createTextOutput(
    "✅ TokiSync API Server v3.3.1 (Unified) is Running..."
  );
}

/**
 * [POST] API Gateway
 */
const SERVER_VERSION = "v3.3.1-260102"; 

function doPost(e) {
  Debug.start(); 
  try {
    const data = JSON.parse(e.postData.contents);

    // 1. Validate FolderId
    if (!data.folderId) {
      return createRes("error", "Missing folderId in request payload");
    }

    const rootFolderId = data.folderId;

    // 2. Dispatch Action
    let result;
    try {
      if (data.type === "init")
        result = initResumableUpload(data, rootFolderId);
      else if (data.type === "upload") result = uploadChunk(data);
      else if (data.type === "check_history")
        result = checkDownloadHistory(data, rootFolderId);
      else if (data.type === "save_info")
        result = saveSeriesInfo(data, rootFolderId);
      else if (data.type === "get_library")
        result = getLibraryIndex(rootFolderId);
      else if (data.type === "update_library_status")
        result = updateLibraryStatus(data, rootFolderId);
      else if (data.type === "get_server_info") {
        result = createRes("success", {
          name: "TokiSync API",
          status: "success",
          message: "TokiSync Server is Online",
          version: SERVER_VERSION,
          timestamp: new Date().toISOString(),
          url: ScriptApp.getService().getUrl(),
          user: Session.getActiveUser().getEmail(),
        });
      } else if (data.type === "history_get")
        result = checkDownloadHistory(data, rootFolderId);
      else if (data.type === "migrate")
        result = migrateLegacyStructure(rootFolderId);
      // Viewer Routing
      else if (data.type && data.type.startsWith("view_")) {
        result = View_Dispatcher(data);
      } else result = createRes("error", "Unknown type");
    } catch (handlerError) {
      Debug.error("❌ Handler Error", handlerError);
      return createRes("error", handlerError.toString(), Debug.getLogs());
    }

    return result;
  } catch (error) {
    return createRes("error", error.toString());
  }
}

/* ========================================================================== */
/* FILE: Utils.gs */
/* ========================================================================== */

/**
 * Helper: Create JSON Response
 */
function createRes(status, body, debugLogs = null) {
  const payload = { status: status, body: body };
  if (debugLogs) payload.debugLogs = debugLogs;

  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Find Folder ID by Name (Advanced Drive Service)
 * Supports [ID] tag or Exact Name
 */
function findFolderId(folderName, rootFolderId) {
  const idMatch = folderName.match(/^\[(\d+)\]/);
  const root = DriveApp.getFolderById(rootFolderId);

  Debug.log(`🔍 findFolderId: "${folderName}"`);

  let query = "";
  // 1. [ID] Search (Preferred)
  if (idMatch) {
    Debug.log(`   -> Detected ID: [${idMatch[1]}]`);
    query = `'${rootFolderId}' in parents and name contains '[${idMatch[1]}]' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  } else {
    Debug.log(`   -> Exact Name Search`);
    const safeName = folderName.replace(/'/g, "\\'");
    query = `'${rootFolderId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  }

  try {
    const response = Drive.Files.list({
      q: query,
      fields: "files(id, name)",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (response.files && response.files.length > 0) {
      Debug.log(
        `   ✅ Found: ${response.files[0].name} (${response.files[0].id})`
      );
      return response.files[0].id;
    }
    
    // 2. Fallback: Exact Name
    if (idMatch) {
      Debug.log(`⚠️ Primary search failed. Trying fallback (Exact Name)...`);
      const titleOnly = folderName.replace(idMatch[0], "").trim();
      const safeTitle = titleOnly.replace(/'/g, "\\'");
      const fallbackQuery = `'${rootFolderId}' in parents and name = '${safeTitle}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

      const fallbackRes = Drive.Files.list({
        q: fallbackQuery,
        fields: "files(id, name)",
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      if (fallbackRes.files && fallbackRes.files.length > 0) {
        return fallbackRes.files[0].id;
      }
    }
  } catch (e) {
    Debug.error("❌ Advanced Search Failed", e);
  }

  return null;
}

/**
 * Get or Create Series Folder (Category Aware)
 */
function getOrCreateSeriesFolder(
  rootFolderId,
  folderName,
  category = "Webtoon",
  createIfMissing = true
) {
  const root = DriveApp.getFolderById(rootFolderId);

  // 1. Check Legacy (Root Direct)
  const legacyId = findFolderId(folderName, rootFolderId);
  if (legacyId) {
    return DriveApp.getFolderById(legacyId);
  }

  // 2. Check/Create Category Folder
  const catName = category || "Webtoon";
  let catFolder;
  const catIter = root.getFoldersByName(catName);

  if (catIter.hasNext()) {
    catFolder = catIter.next();
  } else {
    if (!createIfMissing) return null;
    Debug.log(`📂 Creating Category Folder: ${catName}`);
    catFolder = root.createFolder(catName);
  }

  // 3. Check Series in Category
  const seriesId = findFolderId(folderName, catFolder.getId());
  if (seriesId) {
    return DriveApp.getFolderById(seriesId);
  }

  if (!createIfMissing) return null;

  // 4. Create New Series in Category
  Debug.log(`🆕 Creating New Series Folder in ${catName}: ${folderName}`);
  return catFolder.createFolder(folderName);
}

// Dummy for Scope Auth
function authorizeCheck() {
  DriveApp.getRootFolder();
  UrlFetchApp.fetch("https://www.google.com");
}

/* ========================================================================== */
/* FILE: SyncService.gs (Logic) */
/* ========================================================================== */

function checkDownloadHistory(data, rootFolderId) {
  Debug.log(`🚀 checkDownloadHistory Start`);
  const seriesFolder = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    false
  );

  if (!seriesFolder) {
    Debug.log(
      `❌ Folder not found in Root(${rootFolderId}) or Category(${data.category})`
    );
    return createRes("success", [], Debug.getLogs());
  }
  const folderId = seriesFolder.getId();

  Debug.log(`📂 Scanning Files in: ${folderId}`);
  const existingEpisodes = [];

  let pageToken = null;
  let fetchCount = 0;

  try {
    do {
      const response = Drive.Files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(name)",
        pageSize: 1000,
        pageToken: pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      if (response.files) {
        response.files.forEach((file) => {
          const match = file.name.match(/^(\d+)/);
          if (match) existingEpisodes.push(parseInt(match[1]));
        });
      }
      pageToken = response.nextPageToken;
      fetchCount++;
    } while (pageToken);

  } catch (e) {
    Debug.error("❌ Drive Scan Failed (Advanced)", e);
    return createRes("error", `Scan Error: ${e.message}`, Debug.getLogs());
  }

  const uniqueEpisodes = [...new Set(existingEpisodes)].sort((a, b) => a - b);
  Debug.log(`✅ Total Unique Episodes: ${uniqueEpisodes.length}`);

  return createRes("success", uniqueEpisodes, Debug.getLogs());
}

function saveSeriesInfo(data, rootFolderId) {
  const seriesFolder = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    true
  );

  const fileName = "info.json";
  const files = seriesFolder.getFilesByName(fileName);

  const infoData = {
    id: data.id,
    title: data.title,
    metadata: {
      authors: [data.author || "Unknown"],
      status: data.status || "Unknown",
      category: data.category || "Unknown",
      publisher: data.site || "",
    },
    thumbnail: data.thumbnail || "",
    url: data.url,
    author: data.author || "Unknown",
    last_episode: data.last_episode || 0,
    file_count: data.file_count || 0,
    last_updated: new Date().toISOString(),
  };

  const jsonString = JSON.stringify(infoData, null, 2);

  if (files.hasNext()) {
    files.next().setContent(jsonString);
  } else {
    seriesFolder.createFile(fileName, jsonString, MimeType.PLAIN_TEXT);
  }

  return createRes("success", "Info saved");
}

function getLibraryIndex(rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  const files = root.getFilesByName("library_index.json");

  if (files.hasNext()) {
    const content = files.next().getBlob().getDataAsString();
    try {
      return createRes("success", JSON.parse(content));
    } catch (e) {
      return createRes("success", []);
    }
  }
  return createRes("success", []);
}

function updateLibraryStatus(data, rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  const files = root.getFilesByName("library_index.json");

  if (!files.hasNext()) return createRes("error", "Index not found");

  const file = files.next();
  let library = [];
  try {
    library = JSON.parse(file.getBlob().getDataAsString());
    if (!Array.isArray(library)) library = [];
  } catch (e) {
    return createRes("error", "Invalid JSON");
  }

  const updates = data.updates;
  let changedCount = 0;

  updates.forEach((u) => {
    const item = library.find((i) => i.id === u.id);
    if (item) {
      item.latest_episode_in_site = u.latestEpisode;
      item.last_checked_at = new Date().toISOString();
      changedCount++;
    }
  });

  if (changedCount > 0) {
    file.setContent(JSON.stringify(library));
  }
}

function migrateLegacyStructure(rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  // Implementation omitted for brevity in Guide Bundle (Can be added if needed)
  return createRes("success", "Migration skipped in bundle");
}

/* ========================================================================== */
/* FILE: UploadService.gs */
/* ========================================================================== */

function initResumableUpload(data, rootFolderId) {
  const seriesFolder = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    true
  );
  const folderId = seriesFolder.getId();

  const url =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";

  const metadata = {
    name: data.fileName,
    parents: [folderId],
    mimeType: data.fileName.endsWith(".jpg") ? "image/jpeg" : 
              data.fileName.endsWith(".epub") ? "application/epub+zip" : "application/zip",
  };

  const params = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(metadata),
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, params);

  if (response.getResponseCode() === 200) {
    return createRes("success", {
      uploadUrl: response.getHeaders()["Location"],
      folderId: folderId,
    });
  } else {
    return createRes("error", response.getContentText());
  }
}

function uploadChunk(data) {
  const uploadUrl = data.uploadUrl;
  const chunkData = Utilities.base64Decode(data.chunkData);
  const blob = Utilities.newBlob(chunkData);
  const start = data.start;
  const total = data.total;
  const size = blob.getBytes().length;
  const end = start + size - 1;
  const rangeHeader = `bytes ${start}-${end}/${total}`;

  const params = {
    method: "put",
    payload: blob,
    headers: { "Content-Range": rangeHeader },
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(uploadUrl, params);
  const code = response.getResponseCode();

  if (code === 308 || code === 200 || code === 201) {
    return createRes("success", "Chunk uploaded");
  } else {
    return createRes("error", `Drive API Error: ${code}`);
  }
}

/* ========================================================================== */
/* FILE: View_Dispatcher.gs */
/* ========================================================================== */

function View_Dispatcher(data) {
  try {
    const action = data.type;
    const folderId = data.folderId;
    let resultBody = null;

    if (action === "view_get_library") {
      resultBody = View_getSeriesList(data.folderId);
    } else if (action === "view_get_books" || action === "view_refresh_cache") {
      const bypassCache = data.bypassCache === true || action === "view_refresh_cache";
      resultBody = View_getBooks(data.seriesId, bypassCache);
    } else if (action === "view_get_chunk") {
      resultBody = View_getFileChunk(data.fileId, data.offset || 0, data.length || 10485760);
    } else {
      throw new Error("Unknown Viewer Action: " + action);
    }
    return createRes("success", resultBody);
  } catch (e) {
    return createRes("error", e.toString());
  }
}

/* ========================================================================== */
/* FILE: View_Services.gs (Combined) */
/* ========================================================================== */

const INDEX_FILE_NAME = "library_index.json";

function View_getSeriesList(folderId) {
  const root = DriveApp.getFolderById(folderId);
  const files = root.getFilesByName(INDEX_FILE_NAME);

  if (files.hasNext()) {
    try {
       return JSON.parse(files.next().getBlob().getDataAsString());
    } catch (e) {}
  }
  return View_rebuildLibraryIndex(folderId);
}

function View_rebuildLibraryIndex(folderId) {
  const root = DriveApp.getFolderById(folderId);
  const folders = root.getFolders();
  const seriesList = [];
  const CATEGORIES = ["Webtoon", "Manga", "Novel"];

  while (folders.hasNext()) {
    const folder = folders.next();
    const name = folder.getName();
    if (name === INDEX_FILE_NAME) continue;

    if (CATEGORIES.includes(name)) {
      const sub = folder.getFolders();
      while (sub.hasNext()) {
         const s = processSeriesFolder(sub.next(), name);
         if (s) seriesList.push(s);
      }
    } else if (name.match(/^\[(\d+)\]/)) {
         const s = processSeriesFolder(folder, "Uncategorized");
         if (s) seriesList.push(s);
    }
  }

  seriesList.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  
  const jsonString = JSON.stringify(seriesList);
  const indexFiles = root.getFilesByName(INDEX_FILE_NAME);
  if (indexFiles.hasNext()) indexFiles.next().setContent(jsonString);
  else root.createFile(INDEX_FILE_NAME, jsonString, MimeType.PLAIN_TEXT);

  return seriesList;
}

function processSeriesFolder(folder, categoryContext) {
  let metadata = { status: "ONGOING", authors: [], category: categoryContext };
  let seriesName = folder.getName();
  let thumbnailId = "";
  let sourceId = "";

  const idMatch = seriesName.match(/^\[(\d+)\]/);
  if (idMatch) sourceId = idMatch[1];

  const coverFiles = folder.getFilesByName("cover.jpg");
  if (coverFiles.hasNext()) thumbnailId = coverFiles.next().getId();

  const infoFiles = folder.getFilesByName("info.json");
  if (infoFiles.hasNext()) {
    try {
      const parsed = JSON.parse(infoFiles.next().getBlob().getDataAsString());
      if (parsed.title) seriesName = parsed.title;
      if (parsed.id) sourceId = parsed.id;
      if (parsed.category && (!categoryContext || categoryContext === "Uncategorized")) {
        metadata.category = parsed.category;
      }
    } catch (e) {}
  } else {
     const match = seriesName.match(/^\[(\d+)\]\s*(.+)/);
     if (match) seriesName = match[2];
  }

  return {
    id: folder.getId(),
    sourceId: sourceId,
    name: seriesName,
    booksCount: 0, // Simplified for bundle
    metadata: metadata,
    thumbnailId: thumbnailId,
    hasCover: !!thumbnailId,
    lastModified: folder.getLastUpdated(),
    category: metadata.category,
  };
}

function View_getBooks(seriesId, bypassCache = false) {
    const CACHE_FILE_NAME = "_toki_cache.json";
    const folder = DriveApp.getFolderById(seriesId);

    if (!bypassCache) {
      const cacheFiles = folder.getFilesByName(CACHE_FILE_NAME);
      if (cacheFiles.hasNext()) {
        try { return JSON.parse(cacheFiles.next().getBlob().getDataAsString()); } catch (e) {}
      }
    }

    const files = folder.getFiles();
    const books = [];
    
    while (files.hasNext()) {
      const f = files.next();
      const n = f.getName().toLowerCase();
      if (n.endsWith(".zip") || n.endsWith(".cbz") || n.endsWith(".epub")) {
        let number = 0;
        const m = f.getName().match(/(\d+)/);
        if (m) number = parseFloat(m[1]);
        books.push({
          id: f.getId(),
          seriesId: seriesId,
          name: f.getName(),
          number: number,
          size: f.getSize(),
          media: { status: "READY", mediaType: f.getMimeType() }
        });
      }
    }
    
    books.sort((a,b) => a.number - b.number);
    
    const cacheContent = JSON.stringify(books);
    const existingCache = folder.getFilesByName(CACHE_FILE_NAME);
    if (existingCache.hasNext()) existingCache.next().setContent(cacheContent);
    else folder.createFile(CACHE_FILE_NAME, cacheContent, MimeType.PLAIN_TEXT);

    return books;
}

function View_getFileChunk(fileId, offset, length) {
  const token = ScriptApp.getOAuthToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const end = offset + length - 1;

  try {
    const response = UrlFetchApp.fetch(url, {
      headers: { Authorization: "Bearer " + token, Range: `bytes=${offset}-${end}` },
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() === 206 || response.getResponseCode() === 200) {
      const blob = response.getBlob();
      const bytes = blob.getBytes();
      const totalSizeStr = response.getHeaders()["Content-Range"]?.split("/")[1] || "*";
      const totalSize = totalSizeStr === "*" ? offset + bytes.length : parseInt(totalSizeStr);

      return {
        data: Utilities.base64Encode(bytes),
        hasMore: offset + bytes.length < totalSize,
        totalSize: totalSize,
        nextOffset: offset + bytes.length,
      };
    } else {
        throw new Error("API Error " + response.getResponseCode());
    }
  } catch (e) {
      // Fallback
      const file = DriveApp.getFileById(fileId);
      const allBytes = file.getBlob().getBytes();
      const chunk = allBytes.slice(offset, Math.min(offset + length, allBytes.length));
      return {
          data: Utilities.base64Encode(chunk),
          hasMore: offset + length < allBytes.length,
          totalSize: allBytes.length,
          nextOffset: offset + length
      };
  }
}

/* ========================================================================== */
/* FILE: Debug.gs */
/* ========================================================================== */

const Debug = {
  logs: [],
  start: function () { this.logs = []; },
  log: function (msg) { console.log(msg); this.logs.push(msg); },
  error: function (msg, err) { console.error(msg, err); this.logs.push("ERROR: " + msg); },
  getLogs: function () { return this.logs; }
};
