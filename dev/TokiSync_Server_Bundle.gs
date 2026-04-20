/* ⚙️ TokiSync Server Code Bundle v1.0.0 (Generated: 2026-04-20T01:56:02.732Z) */

/* ========================================================================== */
/* FILE: Main.gs */
/* ========================================================================== */

// ⚙️ TokiSync API Server v1.8.0 (Stateless)
// -----------------------------------------------------
// 🤝 Compatibility:
//    - Client v1.8.0+ (User Execution Mode)
// -----------------------------------------------------

// [GET] 서버 상태 확인용
/**
 * [GET] 서버 상태 확인용 엔드포인트
 * 웹 앱 URL 접근 시 서버가 작동 중인지 확인하는 메시지를 반환합니다.
 *
 * @param {Object} e - 이벤트 객체
 * @returns {TextOutput} 서버 상태 메시지
 */
function doGet(e) {
  return ContentService.createTextOutput(
    "✅ TokiSync API Server v1.8.0 (Stateless) is Running...",
  );
}

// [POST] Tampermonkey 요청 처리 (핵심 로직)
/**
 * [POST] API 요청 처리 핸들러
 * 클라이언트(Tampermonkey, Web App)로부터의 JSON 요청을 처리합니다.
 *
 * [요청 흐름]
 * 1. Payload 파싱 및 `folderId` 검증
 * 2. `data.type`에 따라 적절한 서비스 함수로 분기
 * 3. `view_*` 요청은 `View_Dispatcher`로 위임
 * 4. 결과(JSON) 반환
 *
 * @param {Object} e - 이벤트 객체 (postData 포함)
 * @returns {TextOutput} JSON 응답
 */
// [CONSTANTS]
const SERVER_VERSION = "v1.8.0"; // Drive API V3 Migration
// API Key stored in Script Properties (Project Settings > Script Properties)
// Set property: API_KEY = your_secret_key
const API_KEY = PropertiesService.getScriptProperties().getProperty("API_KEY");

function doPost(e) {
  Debug.start(); // 🐞 디버그 시작
  try {
    const data = JSON.parse(e.postData.contents);

    // 0. API Key Validation (Security) - All Requests Including Viewer
    if (!API_KEY) {
      return createRes(
        "error",
        "Server Configuration Error: API_KEY not set in Script Properties",
      );
    }
    if (!data.apiKey || data.apiKey !== API_KEY) {
      return createRes("error", "Unauthorized: Invalid API Key");
    }

    // 1. 필수 파라미터 검증 (folderId)
    // Stateless 방식이므로 클라이언트가 반드시 folderId를 보내야 함
    if (!data.folderId) {
      return createRes("error", "Missing folderId in request payload");
    }

    // [v1.6.1] Auto-save folderId for background triggers
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty("FOLDER_ID") !== data.folderId) {
        props.setProperty("FOLDER_ID", data.folderId);
    }

    // 🔒 [New] 클라이언트 프로토콜 버전 검증 (Major Version 기준)
    // const MIN_PROTOCOL_VERSION = 3;
    // const MIN_CLIENT_VERSION = "3.0.0-beta.251215.0002";
    // const clientProtocol = data.protocolVersion || 0;

    // [Verified] Strict Check Disabled for Safety during Rollout
    /*
    if (clientProtocol < MIN_PROTOCOL_VERSION) {
        return createRes({
            status: 'error',
            error: `Client Incompatible (Requires Protocol v${MIN_PROTOCOL_VERSION}+)`,
            message: '클라이언트 업데이트가 필요합니다.'
        });
    }
    */
    const rootFolderId = data.folderId;

    // 2. 요청 타입 분기
    let result;
    try {
      if (data.type === "init")
        result = initResumableUpload(data, rootFolderId);
      else if (data.type === "init_update")
        result = initUpdateResumableUpload(data); // [v1.6.0] Task A-4
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
      // [Viewer Migration] Isolated Routing
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

/**
 * [v1.6.1] Time-driven trigger function to sweep Merge Index.
 * Automatically runs in the background to merge _toki_merge fragments into master_index.
 * (Set this up on a Time-Driven trigger in the GAS panel, e.g., every 5 minutes)
 */
function TimeDriven_SweepMergeIndex() {
    const props = PropertiesService.getScriptProperties();
    const folderId = props.getProperty("FOLDER_ID");
    if (!folderId) {
        console.warn("[SweepMergeIndex] FOLDER_ID not found in Script Properties. Run normal API once to auto-save.");
        return;
    }
    
    // Call the Sweep function defined in View_LibraryService.gs
    if (typeof SweepMergeIndex === 'function') {
        SweepMergeIndex(folderId, null);
    } else {
        console.error("[SweepMergeIndex] SweepMergeIndex function not found. Verify deployment.");
    }
}


/* ========================================================================== */
/* FILE: Utils.gs */
/* ========================================================================== */

// =======================================================
// 🛠 유틸리티 함수
// =======================================================

/**
 * 폴더명으로 Google Drive 폴더 ID를 검색합니다.
 * Advanced Drive Service를 사용하여 빠르고 정확하게 검색합니다.
 * [ID] 태그가 있는 경우 해당 태그를 우선적으로 검색합니다.
 *
 * @param {string} folderName - 검색할 폴더명 (e.g. "[123] 제목")
 * @param {string} rootFolderId - 검색 대상 루트 폴더 ID
 * @returns {string|null} 검색된 폴더 ID 또는 null
 */
function findFolderId(folderName, rootFolderId) {
  const idMatch = folderName.match(/^\[(\d+)\]/);

  console.log(`🔍 findFolderId: "${folderName}"`); // Stackdriver Log
  Debug.log(`🔍 findFolderId: "${folderName}"`);

  console.log(`🔍 findFolderId: "${folderName}"`);
  Debug.log(`🔍 findFolderId (Advanced): "${folderName}"`);

  let query = "";
  // 1. [ID] 포함된 폴더 검색 (제목 변경 대응 및 정확성 향상)
  if (idMatch) {
    Debug.log(`   -> Detected ID: [${idMatch[1]}]`);
    query = `'${rootFolderId}' in parents and name contains '[${idMatch[1]}]' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  } else {
    Debug.log(`   -> Exact Name Search`);
    const safeName = folderName.replace(/'/g, "\\'");
    query = `'${rootFolderId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  }
  Debug.log(`   -> Query: ${query}`);

  try {
    const results = DriveAccessService.list(rootFolderId, {
      query: query,
      fields: "files(id, name)",
      pageSize: 1
    });

    if (results.length > 0) {
      Debug.log(`   ✅ Found: ${results[0].name} (${results[0].id})`);
      return results[0].id;
    }
    Debug.log(`   ⚠️ Primary Search returned 0 results.`);

    // 2. Fallback: ID 검색 실패 시, 제목만으로(Exact Name) 재검색 (Legacy 지원)
    if (idMatch) {
      Debug.log(`⚠️ Primary search failed. Trying fallback (Exact Name)...`);
      const titleOnly = folderName.replace(idMatch[0], "").trim();
      const safeTitle = titleOnly.replace(/'/g, "\\'");
      const fallbackQuery = `'${rootFolderId}' in parents and name = '${safeTitle}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

      const fallbackRes = DriveAccessService.list(rootFolderId, {
        query: fallbackQuery,
        fields: "files(id, name)",
        pageSize: 1
      });

      if (fallbackRes.length > 0) {
        Debug.log(`   ✅ Fallback Found: ${fallbackRes[0].name} (${fallbackRes[0].id})`);
        return fallbackRes[0].id;
      }
    }
  } catch (e) {
    Debug.error("❌ Advanced Search Failed", e);
  }

  return null;
}

/**
 * [New] 카테고리(Webtoon/Novel) 구조를 반영하여 시리즈 폴더를 찾거나 생성합니다.
 * Legacy(Root 직속) 폴더가 있으면 그걸 우선 사용(마이그레이션 전 호환성).
 */
function getOrCreateSeriesFolder(
  rootFolderId,
  folderName,
  category = "Webtoon",
  createIfMissing = true
) {
  // 1. Check Legacy (Root Direct)
  const legacyId = findFolderId(folderName, rootFolderId);
  if (legacyId) {
    Debug.log(`♻️ Found Legacy Series Folder in Root: ${legacyId}`);
    return legacyId;
  }

  // 2. Check/Create Category Folder
  const catName = category || "Webtoon";
  const catId = DriveAccessService.ensureFolder(rootFolderId, catName);

  // 3. Check Series in Category
  const seriesId = findFolderId(folderName, catId);
  if (seriesId) return seriesId;

  if (!createIfMissing) return null;

  // 4. Create New Series in Category
  Debug.log(`🆕 Creating New Series Folder in ${catName}: ${folderName}`);
  return DriveAccessService.ensureFolder(catId, folderName);
}

/**
 * JSON 응답 객체(TextOutput)를 생성합니다.
 *
 * @param {string} status - 응답 상태 ('success' | 'error')
 * @param {any} body - 응답 데이터
 * @param {Array} [debugLogs=null] - 디버그 로그 (옵션)
 * @returns {TextOutput} JSON TextOutput
 */
function createRes(status, body, debugLogs = null) {
  const payload = { status: status, body: body };
  if (debugLogs) payload.debugLogs = debugLogs;

  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// 권한 승인용 더미 함수
function authorizeCheck() {
  DriveAccessService.getRootId();
  UrlFetchApp.fetch("https://www.google.com");
  console.log("✅ 권한 승인 완료!");
}


/* ========================================================================== */
/* FILE: SyncService.gs */
/* ========================================================================== */

// =======================================================
// 📂 동기화 및 라이브러리 서비스
// =======================================================

// 기능: 다운로드 기록 확인 (폴더/파일 스캔)
// 기능: 다운로드 기록 확인 (폴더/파일 스캔)
function checkDownloadHistory(data, rootFolderId) {
  Debug.log(`🚀 checkDownloadHistory Start`);
  // Use Helper with Category support (Create=false)
  const folderId = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    false,
  );

  if (!folderId) {
    Debug.log(`❌ Folder not found in Root or Category: ${data.folderName}`);
    return createRes("success", [], Debug.getLogs());
  }

  Debug.log(`📂 Scanning Files in: ${folderId}`);
  const existingEpisodes = [];

  try {
    const files = DriveAccessService.list(folderId, {
      fields: "files(name)"
    });

    files.forEach((file) => {
      const match = file.name.match(/^(\d+)/);
      if (match) existingEpisodes.push(parseInt(match[1]));
    });

    Debug.log(`🎉 Scan Complete. Found ${existingEpisodes.length} episodes.`);
  } catch (e) {
    Debug.error("❌ Drive Scan Failed (Advanced)", e);
    return createRes("error", `Scan Error: ${e.message}`, Debug.getLogs());
  }

  // 중복 제거 및 정렬
  const uniqueEpisodes = [...new Set(existingEpisodes)].sort((a, b) => a - b);
  Debug.log(`✅ Total Unique Episodes: ${uniqueEpisodes.length}`);

  return createRes("success", uniqueEpisodes, Debug.getLogs());
}

// 기능: 작품 정보(info.json) 저장
function saveSeriesInfo(data, rootFolderId) {
  // Use Helper with Category support (Create=true)
  const folderId = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    true,
  );

  const fileName = "info.json";
  const results = DriveAccessService.list(folderId, {
    query: `name = '${fileName}'`,
    fields: "files(id)"
  });

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

  if (results.length > 0) {
    DriveAccessService.updateFileContent(results[0].id, jsonString);
    // 중복 파일 제거
    for (let i = 1; i < results.length; i++) {
      DriveAccessService.trash(results[i].id);
    }
  } else {
    DriveAccessService.createFile(folderId, fileName, jsonString, "application/json");
  }

  return createRes("success", "Info saved");
}

// 기능: 라이브러리 인덱스 조회 (TokiView 캐시 공유)
function getLibraryIndex(rootFolderId) {
  const results = DriveAccessService.list(rootFolderId, {
    query: "name = 'index.json'",
    fields: "files(id)"
  });

  if (results.length > 0) {
    const content = DriveAccessService.getFileContent(results[0].id);
    try {
      return createRes("success", JSON.parse(content));
    } catch (e) {
      return createRes("success", []);
    }
  }
  return createRes("success", []);
}

// 기능: 라이브러리 상태 업데이트 (클라이언트 결과 저장)
function updateLibraryStatus(data, rootFolderId) {
  const results = DriveAccessService.list(rootFolderId, {
    query: "name = 'index.json'",
    fields: "files(id)"
  });

  if (results.length === 0) return createRes("error", "Index not found");

  const fileId = results[0].id;
  let library = [];
  try {
    const content = DriveAccessService.getFileContent(fileId);
    library = JSON.parse(content);
    if (!Array.isArray(library)) library = [];
  } catch (e) {
    return createRes("error", "Invalid JSON");
  }

  // 업데이트 반영
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
    DriveAccessService.updateFileContent(fileId, JSON.stringify(library));
    return createRes("success", `Updated ${changedCount} items`);
  }
  return createRes("success", "No changes");
}

// =======================================================
// 📦 마이그레이션 서비스 (Legacy -> v3.1 Structure)
// =======================================================

function migrateLegacyStructure(rootFolderId) {
  const catWebtoonId = DriveAccessService.ensureFolder(rootFolderId, "Webtoon");
  const catNovelId = DriveAccessService.ensureFolder(rootFolderId, "Novel");
  const catMangaId = DriveAccessService.ensureFolder(rootFolderId, "Manga");

  const items = DriveAccessService.list(rootFolderId, {
      fields: "files(id, name, mimeType)"
  });
  const folders = items.filter(f => f.mimeType === "application/vnd.google-apps.folder");
  
  const toMigrate = [];
  const EXT = ["Webtoon", "Novel", "Manga", "Libraries", "System", "_Thumbnails", "_MergeIndex"];

  folders.forEach((folder) => {
    const name = folder.name;
    if (!EXT.includes(name) && name !== "index.json" && name !== "info.json") {
      toMigrate.push(folder);
    }
  });

  let movedCount = 0;
  let fixedThumbnails = 0;

  toMigrate.forEach((folder) => {
    try {
      const folderId = folder.id;
      const folderName = folder.name;
      Debug.log(`🔄 Migrating: ${folderName}`);

      let category = "Webtoon"; // Default

      // 1. Analyze info.json for Category & Thumbnail
      const infoResults = DriveAccessService.list(folderId, {
          query: "name = 'info.json'",
          fields: "files(id)"
      });

      if (infoResults.length > 0) {
        const infoFileId = infoResults[0].id;
        const content = DriveAccessService.getFileContent(infoFileId);
        try {
          const json = JSON.parse(content);
          const metaPublisher = (
            json.publisher ||
            (json.metadata && json.metadata.publisher) ||
            ""
          ).toString();
          const metaSite = (json.site || "").toString();

          if (json.category === "Novel" || (json.metadata && json.metadata.category === "Novel")) {
            category = "Novel";
          } else if (json.category === "Manga" || metaPublisher.includes("마나토끼") || metaSite.includes("마나토끼")) {
            category = "Manga";
          }

          let needsUpdate = false;
          if (json.category !== category) {
            json.category = category;
            if (json.metadata) json.metadata.category = category;
            needsUpdate = true;
          }

          if (json.thumbnail && json.thumbnail.length > 500) {
            DriveAccessService.createFile(folderId, "cover.jpg", Utilities.base64Decode(json.thumbnail), "image/jpeg");
            json.thumbnail = ""; 
            needsUpdate = true;
            fixedThumbnails++;
            Debug.log(`   -> Extracted Thumbnail`);
          }

          if (needsUpdate) {
            DriveAccessService.updateFileContent(infoFileId, JSON.stringify(json, null, 2));
            Debug.log(`   -> Updated info.json (Category/Thumbnail)`);
          }
        } catch (e) {
          Debug.log(`   -> JSON Parse Error: ${e}`);
        }
      }

      // 2. Move Folder
      let targetCatId = catWebtoonId;
      if (category === "Novel") targetCatId = catNovelId;
      else if (category === "Manga") targetCatId = catMangaId;

      DriveAccessService.move(folderId, rootFolderId, targetCatId);
      movedCount++;
      Debug.log(`   -> Moved to ${category}`);
    } catch (e) {
      Debug.log(`   -> Migration Failed: ${e}`);
    }
  });

  return createRes(
    "success",
    `Migration Complete. Moved: ${movedCount}, Thumbnails: ${fixedThumbnails}`,
    Debug.getLogs(),
  );
}

// =======================================================
// 🔑 Direct Drive Access Token Provider
// =======================================================

/**
 * Provides OAuth Access Token for Client-Side Direct Drive Upload
 *
 * This endpoint enables the UserScript to bypass GAS relay and directly
 * upload files to Google Drive using GM_xmlhttpRequest.
 *
 * Security: Token is valid for 1 hour and scoped to Drive access only.
 *
 * @returns {Object} Response with access token
 */
function view_get_token() {
  Debug.log("🔑 view_get_token: Generating OAuth token");

  try {
    const token = ScriptApp.getOAuthToken();

    if (!token) {
      Debug.error("❌ Token generation failed");
      return createRes(
        "error",
        "Failed to generate OAuth token",
        Debug.getLogs(),
      );
    }

    Debug.log("✅ Token generated successfully");

    return createRes(
      "success",
      {
        token: token,
        expiresIn: 3600, // 1 hour (approximate)
        scope: "https://www.googleapis.com/auth/drive",
        timestamp: new Date().toISOString(),
      },
      Debug.getLogs(),
    );
  } catch (e) {
    Debug.error("❌ Token generation error:", e);
    return createRes("error", `Token Error: ${e.message}`, Debug.getLogs());
  }
}


/* ========================================================================== */
/* FILE: UploadService.gs */
/* ========================================================================== */

// =======================================================
// ☁️ 업로드 서비스 (대용량 업로드)
// =======================================================

function initResumableUpload(data, rootFolderId) {
  const folderId = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    true,
  );

  // [Fix] Prevent Duplicate Files: Delete existing file with the same name before uploading a new one
  const existingFiles = DriveAccessService.list(folderId, {
    query: `name = '${data.fileName.replace(/'/g, "\\'")}'`,
    fields: "files(id)"
  });

  existingFiles.forEach(file => {
    DriveAccessService.trash(file.id);
  });

  const url =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";

  const metadata = {
    name: data.fileName,
    parents: [folderId],
    mimeType:
      data.fileName.endsWith(".jpg") || data.fileName.endsWith(".jpeg")
        ? "image/jpeg"
        : data.fileName.endsWith(".epub")
          ? "application/epub+zip"
          : "application/zip",
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

  if (code === 308) {
    return createRes("success", "Chunk uploaded");
  } else if (code === 200 || code === 201) {
    // [v1.6.0] Task A-1: Return the new fileId upon completion
    let newFileId = null;
    try {
      const responseData = JSON.parse(response.getContentText());
      if (responseData && responseData.id) {
        newFileId = responseData.id;
      }
    } catch (e) {
      console.warn("Failed to parse upload completion response", e);
    }
    return createRes("success", { message: "Upload complete", fileId: newFileId });
  } else {
    return createRes("error", `Drive API Error: ${code}`);
  }
}

/**
 * [v1.6.0] Task A-3: initUpdateResumableUpload
 * 해당 파일 ID를 알고 있을 때 파일 이름 검색 없이 바로 덮어쓰기 세션을 엽니다.
 */
function initUpdateResumableUpload(data) {
  const { fileId, fileName } = data;
  
  if (!fileId) {
      return createRes("error", "Missing fileId for update operation");
  }

  // [v1.7.3-hotfix] Check if file exists and is NOT in trash
  try {
    const meta = DriveAccessService.getMetadata(fileId);
    // V3 get response doesn't have trashed field by default unless requested, 
    // but in V3 hidden/trashed files are usually not returned by get unless using special flags.
    // However, for safety we can check or rely on the error thrown by getMetadata.
    if (!meta) throw new Error("Metadata not found");
  } catch (e) {
    return createRes("error", "File not found, in trash, or access denied: " + fileId);
  }

  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`;
  
  const params = {
    method: "patch", // Use PATCH to update existing file content
    contentType: "application/json",
    payload: JSON.stringify({ name: fileName }), // Ensure name stays correct
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, params);
  const code = response.getResponseCode();

  if (code === 200) {
    return createRes("success", { 
        uploadUrl: response.getHeaders()["Location"] 
    });
  } else {
    return createRes("error", `initUpdate failed: ${code} - ${response.getContentText()}`);
  }
}


/* ========================================================================== */
/* FILE: View_Dispatcher.gs */
/* ========================================================================== */

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


/* ========================================================================== */
/* FILE: View_BookService.gs */
/* ========================================================================== */

// =======================================================
// 📚 Viewer Book Service (Isolated)
// =======================================================

/**
 * [v1.6.0] 캐시 파일 ID를 이용해 폴더 스캔 없이 에피소드 목록을 직접 가져옵니다.
 *
 * @param {string} cacheFileId - _toki_cache.json 파일의 고유 ID
 * @returns {Array<Object>} 캐시된 책 목록 또는 에러
 */
function View_getBooksByCacheId(cacheFileId) {
  try {
    if (!cacheFileId) throw new Error("cacheFileId is required");
    const content = DriveAccessService.getFileContent(cacheFileId);
    return JSON.parse(content);
  } catch (e) {
    console.error(`[View_getBooksByCacheId] Error: ${e.toString()}`);
    throw e;
  }
}

/**
 * 특정 시리즈(폴더) 내의 책(파일/폴더) 목록을 반환합니다.
 * - info.json / _toki_cache.json 캐시 처리 추가
 *
 * @param {string} seriesId - 시리즈 폴더 ID
 * @param {boolean} bypassCache - 캐시 무시 여부 (새로고침)
 * @returns {Array<Object>} 책 목록
 */
function View_getBooks(seriesId, bypassCache = false) {
  try {
    if (!seriesId) throw new Error("Series ID is required");

    const CACHE_FILE_NAME = "_toki_cache.json";

    // 1. Check Cache
    if (!bypassCache) {
      const cacheResults = DriveAccessService.list(seriesId, {
          query: `name = '${CACHE_FILE_NAME}'`,
          fields: "files(id)"
      });
      if (cacheResults.length > 0) {
        try {
          const content = DriveAccessService.getFileContent(cacheResults[0].id);
          const cacheData = JSON.parse(content);
          Debug.log(`[Cache Hit] Series: ${seriesId}`);
          return cacheData;
        } catch (e) {
          console.error("Cache Parse Error, falling back to scan");
        }
      }
    }

    // 2. Full Scan (V3)
    const items = DriveAccessService.list(seriesId, {
        fields: "files(id, name, mimeType, size, modifiedTime, createdTime, webContentLink)"
    });

    const books = [];
    let totalItems = 0;

    const createBook = (item, type) => {
      const name = item.name;
      let number = 0;
      const match = name.match(/(\d+)/);
      if (match) number = parseFloat(match[1]);

      return {
        id: item.id,
        seriesId: seriesId,
        name: name,
        number: number,
        url: "", // webViewLink is not returned by default in list, but we can synthesize it or leave empty for frontend to solve
        size: type === "file" ? parseInt(item.size || 0) : 0,
        media: {
          status: "READY",
          mediaType: type === "file" ? item.mimeType : "application/folder",
        },
        created: item.createdTime || new Date().toISOString(),
        lastModified: item.modifiedTime || new Date().toISOString(),
      };
    };

    const folders = items.filter(f => f.mimeType === "application/vnd.google-apps.folder");
    const files = items.filter(f => f.mimeType !== "application/vnd.google-apps.folder");

    for (const f of folders) {
        if (f.name === "info.json" || f.name === CACHE_FILE_NAME || f.name === INDEX_FILE_NAME) continue;
        books.push(createBook(f, "folder"));
    }

    for (const f of files) {
      totalItems++;
      const name = f.name;
      const mime = f.mimeType;
      const lowerName = name.toLowerCase();

      if (
        name === "info.json" ||
        name === INDEX_FILE_NAME ||
        name === CACHE_FILE_NAME ||
        name === "cover.jpg" ||
        lowerName.endsWith(".jpg") ||
        lowerName.endsWith(".png") ||
        lowerName.endsWith(".json")
      )
        continue;

      if (
        lowerName.endsWith(".cbz") ||
        lowerName.endsWith(".zip") ||
        lowerName.endsWith(".epub") ||
        mime.includes("zip") ||
        mime.includes("archive") ||
        mime.includes("epub")
      ) {
        books.push(createBook(f, "file"));
      }
    }

    books.sort((a, b) => {
      const numA = a.number || 0;
      const numB = b.number || 0;
      if (numA === numB) {
        return a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      return numA - numB;
    });

    // 3. Write Cache
    const cacheContent = JSON.stringify(books);
    const existingCache = DriveAccessService.list(seriesId, {
        query: `name = '${CACHE_FILE_NAME}'`,
        fields: "files(id)"
    });

    if (existingCache.length > 0) {
        DriveAccessService.updateFileContent(existingCache[0].id, cacheContent);
        if (existingCache.length > 1) {
            for (let i = 1; i < existingCache.length; i++) {
                DriveAccessService.trash(existingCache[i].id);
            }
        }
    } else {
        DriveAccessService.createFile(seriesId, CACHE_FILE_NAME, cacheContent, "application/json");
    }

    console.log(
      `[View_getBooks] Series: ${seriesId}, Items Scanned: ${items.length}, Returned: ${books.length} (Cache Updated)`,
    );
    return books;
  } catch (e) {
    console.error(`[View_getBooks] Error: ${e.toString()}`);
    throw e;
  }
}

/**
 * 파일을 청크(Chunk) 단위로 분할하여 반환합니다.
 * 대용량 파일(CBZ 등)을 브라우저로 전송하기 위해 사용됩니다.
 *
 * @param {string} fileId - 대상 파일 ID
 * @param {number} offset - 시작 바이트 위치
 * @param {number} length - 읽을 바이트 길이
 * @returns {Object} { data: Base64String, hasMore: boolean, totalSize: number, nextOffset: number }
 */
/**
 * 파일을 청크(Chunk) 단위로 분할하여 반환합니다.
 * Drive API (Advanced Service)를 사용하여 메모리 효율적으로 다운로드합니다.
 */
function View_getFileChunk(fileId, offset, length) {
  // Use Drive API for partial download (Range Header)
  // Note: Drive API v2/v3 support 'Range' header but GAS wrapper behavior varies.
  // Using UrlFetchApp with user token is the most reliable way to enforce Range.
  const token = ScriptApp.getOAuthToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  // Calculate End
  // Note: Range is inclusive (start-end). However, we usually don't know total size here efficiently without extra call.
  // Ideally, we fetch a bit more or exact.
  // "bytes=0-1048575"
  const end = offset + length - 1;

  try {
    const response = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: "Bearer " + token,
        Range: `bytes=${offset}-${end}`,
      },
      muteHttpExceptions: true,
    });

    if (
      response.getResponseCode() === 206 ||
      response.getResponseCode() === 200
    ) {
      const blob = response.getBlob();
      const bytes = blob.getBytes();
      const totalSizeStr =
        response.getHeaders()["Content-Range"]?.split("/")[1] || "*";
      const totalSize =
        totalSizeStr === "*" ? offset + bytes.length : parseInt(totalSizeStr);

      // If we got full content (200 OK) but requested partial? Usually Drive returns 200 if file small? No, Drive with Range usually returns 206.

      return {
        data: Utilities.base64Encode(bytes),
        hasMore: offset + bytes.length < totalSize,
        totalSize: totalSize,
        nextOffset: offset + bytes.length,
      };
    } else {
      throw new Error(
        `Drive API Failed: ${response.getResponseCode()} ${response.getContentText()}`,
      );
    }
  } catch (e) {
    // Fallback to DriveAccessService if API fails (e.g. scope issue)
    console.warn(
      "Drive API Partial Fetch failed, falling back to DriveAccessService: " +
        e,
    );
    const bytes = DriveAccessService.getFileBytes(fileId);

    if (offset >= bytes.length) return null;
    const chunkEnd = Math.min(offset + length, bytes.length);
    const chunk = bytes.slice(offset, chunkEnd);

    return {
      data: Utilities.base64Encode(chunk),
      hasMore: chunkEnd < bytes.length,
      totalSize: bytes.length,
      nextOffset: chunkEnd,
    };
  }
}


/* ========================================================================== */
/* FILE: View_LibraryService.gs */
/* ========================================================================== */

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
  const metaResults = DriveAccessService.list(folderId, {
    query: "name = '_toki_meta.json'",
    fields: "files(id)"
  });

  if (metaResults.length > 0) {
    try {
      const content = DriveAccessService.getFileContent(metaResults[0].id);
      const metaData = JSON.parse(content);
      const tid = (thumbMap && metaData.sourceId) ? thumbMap[metaData.sourceId] : "";
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
      if (parsed.status) metadata.status = parsed.status;
      if (parsed.metadata && parsed.metadata.authors)
        metadata.authors = parsed.metadata.authors;
      else if (parsed.author) metadata.authors = [parsed.author];

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
    thumbnail: finalThumbnail,
    thumbnailId: thumbnailId,
    hasCover: !!thumbnailId,
    cacheFileId: cacheFileId, 
    lastModified: folder.modifiedTime,
    category: metadata.category,
  };
}



/* ========================================================================== */
/* FILE: View_HistoryService.gs */
/* ========================================================================== */

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


/* ========================================================================== */
/* FILE: View_Utils.gs */
/* ========================================================================== */

// =======================================================
// 🛠 Viewer Utility Functions (Isolated)
// =======================================================

// const INDEX_FILE_NAME declared in View_LibraryService.gs
// const INDEX_FILE_NAME = "library_index.json";

/**
 * Viewer 전용 권한 확인 함수
 * 이 함수를 실행하여 View 관련 스코프(DriveApp) 권한을 승인받습니다.
 */
function View_authorizeCheck() {
  DriveAccessService.getRootId();
  console.log("✅ [Viewer] Auth Check Complete");
}


/* ========================================================================== */
/* FILE: Debug.gs */
/* ========================================================================== */

// =====================================================
// 🐞 디버깅 모듈 (In-Memory Log Collector)
// =====================================================

const Debug = {
  logs: [],
  startTime: 0,

  start: function () {
    this.logs = [];
    this.startTime = new Date().getTime();
    this.log("🕒 Execution Started");
  },

  log: function (msg) {
    const elapsed = new Date().getTime() - this.startTime;
    const timestamp = `[+${elapsed}ms]`;
    console.log(msg); // Stackdriver에도 남김
    this.logs.push(`${timestamp} ${msg}`);
  },

  error: function (msg, err) {
    const elapsed = new Date().getTime() - this.startTime;
    const timestamp = `[+${elapsed}ms]`;
    const errMsg = err ? ` | Error: ${err.message}\nStack: ${err.stack}` : "";
    console.error(msg + errMsg);
    this.logs.push(`❌ ${timestamp} ${msg}${errMsg}`);
  },

  getLogs: function () {
    return this.logs;
  },
};

// 테스트용 함수 (유지)
function testSetup() {
  Debug.start();
  Debug.log("Test Log 1");
  try {
    throw new Error("Test Error");
  } catch (e) {
    Debug.error("Test Exception catch", e);
  }
  return Debug.getLogs();
}


