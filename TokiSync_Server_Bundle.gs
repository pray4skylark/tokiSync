/* ⚙️ TokiSync Server Code Bundle v1.0.0 (Generated: 2026-07-01T14:59:56.873Z) */

/* ========================================================================== */
/* FILE: Main.gs */
/* ========================================================================== */

// ⚙️ TokiSync API Server v1.26.4 (Stateless)
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
    "✅ TokiSync API Server v1.26.4 (Stateless) is Running...",
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
var SERVER_VERSION = "v1.26.4";
// API Key stored in Script Properties (Project Settings > Script Properties)
// Set property: API_KEY = your_secret_key

function getApiKey_() {
    return PropertiesService.getScriptProperties().getProperty("API_KEY");
}

function doPost(e) {
  Debug.start(); // 🐞 디버그 시작
  try {
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createRes("error", "Invalid JSON in request body");
    }

    // 0. API Key Validation (Security) - All Requests Including Viewer
    var apiKey = getApiKey_(); if (!apiKey) {
      return createRes(
        "error",
        "Server Configuration Error: API_KEY not set in Script Properties",
      );
    }
    if (!data.apiKey || data.apiKey !== apiKey) {
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
        SweepMergeIndex(folderId);
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
 * 시리즈 폴더를 Root 직속에서 찾거나 생성합니다. (Kavita 호환 플랫 구조)
 * 기존 카테고리(Webtoon/Novel/Manga) 구조는 제거되었습니다.
 */
function getOrCreateSeriesFolder(
  rootFolderId,
  folderName,
  category,
  createIfMissing = true
) {
  const seriesId = findFolderId(folderName, rootFolderId);
  if (seriesId) return seriesId;

  if (!createIfMissing) return null;

  Debug.log(`🆕 Creating New Series Folder in Root: ${folderName}`);
  return DriveAccessService.ensureFolder(rootFolderId, folderName);
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
/* FILE: DriveAccessService.gs */
/* ========================================================================== */

/**
 * @file DriveAccessService.gs
 * @description Google Drive API v3 (Advanced Service) 기반의 고성능 드라이브 접근 레이어
 * @version 1.0.0 (TokiSync v1.7.6+)
 */

var DriveAccessService = {
  /**
   * 내 드라이브(Root)의 ID를 가져옵니다.
   * @returns {string} Root ID
   */
  getRootId: function() {
    try {
      return Drive.Files.get("root", { fields: "id", supportsAllDrives: true }).id;
    } catch (e) {
      this._handleError("getRootId()", e);
    }
  },

  /**
   * 폴더 또는 파일의 메타데이터를 가져옵니다.
   * @param {string} id - Google Drive ID
   * @returns {Object} { id, name, mimeType, parents, size, modifiedTime }
   */
  getMetadata: function(id) {
    try {
      const file = Drive.Files.get(id, {
        fields: "id, name, mimeType, parents, size, modifiedTime",
        supportsAllDrives: true
      });
      return file;
    } catch (e) {
      this._handleError(`getMetadata(${id})`, e);
    }
  },

  /**
   * 폴더 내의 파일/폴더 목록을 조회합니다. (페이지네이션 지원)
   * @param {string} parentId - 부모 폴더 ID
   * @param {Object} options - { query, fields, pageSize, pageToken }
   * @returns {Object} { files: Array, nextPageToken: string }
   */
  listPaged: function(parentId, options = {}) {
    const query = [`'${parentId}' in parents`, "trashed = false"];
    if (options.query) query.push(options.query);

    try {
      const response = Drive.Files.list({
        q: query.join(" and "),
        fields: options.fields || "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
        pageSize: options.pageSize || 1000,
        pageToken: options.pageToken || null,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      return {
        files: response.files || [],
        nextPageToken: response.nextPageToken || null
      };
    } catch (e) {
      this._handleError(`listPaged(${parentId})`, e);
    }
  },

  /**
   * 폴더 내의 모든 파일/폴더 목록을 조회합니다. (자동 페이지네이션)
   * @param {string} parentId - 부모 폴더 ID
   * @param {Object} options - { query, fields, pageSize }
   * @returns {Array} 파일 메타데이터 배열
   */
  list: function(parentId, options = {}) {
    const results = [];
    let pageToken = null;

    do {
      const response = this.listPaged(parentId, { ...options, pageToken: pageToken });
      results.push(...response.files);
      pageToken = response.nextPageToken;
    } while (pageToken);

    return results;
  },

  /**
   * 특정 이름의 하위 폴더를 찾거나 생성합니다.
   * @param {string} parentId - 부모 폴더 ID
   * @param {string} name - 폴더 이름
   * @returns {string} 생성 또는 발견된 폴더 ID
   */
  ensureFolder: function(parentId, name) {
    const safeName = name.replace(/'/g, "\\'");
    const folders = this.list(parentId, {
      query: `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder'`,
      pageSize: 1
    });

    if (folders.length > 0) return folders[0].id;

    try {
      const newFolder = Drive.Files.create({
        name: name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId]
      }, null, { supportsAllDrives: true });
      return newFolder.id;
    } catch (e) {
      this._handleError(`ensureFolder(${name})`, e);
    }
  },

  /**
   * 파일 내용을 텍스트로 가져옵니다.
   * @param {string} fileId - 파일 ID
   * @returns {string} 파일 내용
   */
  getFileContent: function(fileId) {
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
      const res = UrlFetchApp.fetch(url, {
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200 && res.getResponseCode() !== 206) {
         throw new Error(`HTTP ${res.getResponseCode()}: ${res.getContentText()}`);
      }
      return res.getContentText();
    } catch (e) {
      this._handleError(`getFileContent(${fileId})`, e);
    }
  },

  /**
   * 파일 내용을 업데이트합니다.
   * @param {string} fileId - 파일 ID
   * @param {string} content - 저장할 텍스트 내용
   * @param {string} mimeType - MIME 타입
   */
  updateFileContent: function(fileId, content, mimeType = "application/json") {
    try {
      const blob = Utilities.newBlob(content, mimeType);
      return Drive.Files.update({}, fileId, blob, { supportsAllDrives: true });
    } catch (e) {
      this._handleError(`updateFileContent(${fileId})`, e);
    }
  },

  /**
   * 신규 파일을 생성합니다.
   * @param {string} parentId - 부모 폴더 ID
   * @param {string} name - 파일 이름
   * @param {string} content - 파일 내용
   * @param {string} mimeType - MIME 타입
   */
  createFile: function(parentId, name, content, mimeType = "text/plain") {
    try {
      const blob = Utilities.newBlob(content, mimeType);
      const metadata = {
        name: name,
        parents: [parentId]
      };
      return Drive.Files.create(metadata, blob, { supportsAllDrives: true }).id;
    } catch (e) {
      this._handleError(`createFile(${name})`, e);
    }
  },

  /**
   * 파일 또는 폴더를 이동합니다.
   * @param {string} fileId - 파일 ID
   * @param {string} oldParentId - 기존 부모 ID
   * @param {string} newParentId - 신규 부모 ID
   */
  move: function(fileId, oldParentId, newParentId) {
    try {
      return Drive.Files.update({}, fileId, null, {
        addParents: newParentId,
        removeParents: oldParentId,
        supportsAllDrives: true
      });
    } catch (e) {
      this._handleError(`move(${fileId})`, e);
    }
  },

  /**
   * 파일의 메타데이터(이름 등)를 패치합니다.
   * @param {string} fileId - 파일 ID
   * @param {Object} metadata - 업데이트할 메타데이터 (e.g. { name: "new_name" })
   */
  patch: function(fileId, metadata) {
    try {
      return Drive.Files.update(metadata, fileId, null, { supportsAllDrives: true });
    } catch (e) {
      this._handleError(`patch(${fileId})`, e);
    }
  },

  /**
   * 파일의 모든 바이트를 가져옵니다.
   * @param {string} fileId - 파일 ID
   * @returns {Byte[]} 바이트 배열
   */
  getFileBytes: function(fileId) {
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
      const res = UrlFetchApp.fetch(url, {
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200 && res.getResponseCode() !== 206) {
         throw new Error(`HTTP ${res.getResponseCode()}: ${res.getContentText()}`);
      }
      return res.getBlob().getBytes();
    } catch (e) {
      this._handleError(`getFileBytes(${fileId})`, e);
    }
  },

  /**
   * 파일을 휴지통으로 보냅니다.
   * @param {string} fileId - 파일 ID
   */
  trash: function(fileId) {
    try {
      return Drive.Files.update({ trashed: true }, fileId, null, { supportsAllDrives: true });
    } catch (e) {
      this._handleError(`trash(${fileId})`, e);
    }
  },

  /**
   * 내부 에러 핸들러
   * @private
   */
  _handleError: function(context, e) {
    const errorMsg = `[DriveAccessService] ${context} 실패: ${e.message}`;
    console.error(errorMsg);
    // Option 2-B: Exception 발생
    throw new Error(errorMsg);
  }
};


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
  const folderId = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    null,
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
      let num = null;
      // 1. Kavita 스타일 'c001' 또는 'ch001' 매칭
      const kavitaMatch = file.name.match(/[-_ ]c(?:h)?(\d+)/i);
      if (kavitaMatch) {
        num = parseInt(kavitaMatch[1]);
      } else {
        // 2. '1화' 등의 명시적 화수 매칭
        const hwaMatch = file.name.match(/(\d+)화/);
        if (hwaMatch) {
          num = parseInt(hwaMatch[1]);
        } else {
          // 3. 파일명의 첫 숫자로 시작하는 레거시 매칭
          const startNumMatch = file.name.match(/^(\d+)/);
          if (startNumMatch) {
            num = parseInt(startNumMatch[1]);
          }
        }
      }
      if (num !== null && !isNaN(num)) {
        existingEpisodes.push(num);
      }
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
  const folderId = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    null,
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
    vendor: data.vendor || "",
    metadata: {
      authors: [data.author || "Unknown"],
      status: data.status || "Unknown",
      category: data.category || "Unknown",
      publisher: data.site || "",
      vendor: data.vendor || "",
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
    null,
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
    } else if (action === "view_migrate_kavita") {
      // Legacy Kavita filename migration
      const executeRename = data.executeRename === true;
      resultBody = Migrate_KavitaFormat(data.folderId, executeRename);
    } else if (action === "view_kavita_restructure") {
      // Kavita flat structure migration (Phase 3)
      if (!data.folderId) throw new Error("folderId is required for restructure");
      const selectedIds = data.selectedIds || [];
      resultBody = Kavita_Restructure(data.folderId, selectedIds);
    } else if (action === "view_kavita_status") {
      // Structure diagnosis
      if (!data.folderId) throw new Error("folderId is required for status");
      resultBody = Kavita_GetStatus(data.folderId);
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
        null,
        false,
      );
      if (!seriesId) {
        resultBody = { updated: false, reason: "folder not found" };
      } else {
        const extraMeta = data.metadata || {};
        const booksArray = View_getBooks(seriesId, true, extraMeta.episodeTitles || null);
        const itemsCount = booksArray ? booksArray.length : 0;
        
        // [v1.6.1] Merge Index Fragment Creation
        try {
            // 1. Find or create _MergeIndex folder
            const mergeFolderId = DriveAccessService.ensureFolder(folderId, "_MergeIndex");
            
            // 2. Extract sourceId & find cacheFileId
            const meta = DriveAccessService.getMetadata(seriesId);
            const seriesFolderName = meta.name;
            const idMatch = seriesFolderName.match(/^\[([a-zA-Z0-9_\-]+)\]/);
            
            const extraMeta = data.metadata || {};
            const sourceId = extraMeta.sourceId || extraMeta.id || (idMatch ? idMatch[1] : seriesId);
            
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
                const titleClean = seriesFolderName.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, '').trim();
                
                // [v1.22.0] 기존 _toki_meta.json 내용을 병합하여 수동 편집 내역 보존
                let existingMeta = {};
                const metaName = "_toki_meta.json";
                const metaResults = DriveAccessService.list(seriesId, {
                    query: `name = '${metaName}'`,
                    fields: "files(id)"
                });

                if (metaResults.length > 0) {
                    try {
                        const content = DriveAccessService.getFileContent(metaResults[0].id);
                        if (content && content.trim() !== "") {
                            existingMeta = JSON.parse(content);
                        }
                    } catch (e) {
                        Debug.log(`[MergeIndex] Failed to parse existing metadata: ${e.toString()}`);
                    }
                }
                
                const mergedMeta = {
                    ...existingMeta,
                    id: seriesId,
                    sourceId: sourceId,
                    vendorId: extraMeta.vendorId || existingMeta.vendorId || sourceId,
                    name: titleClean || existingMeta.name || seriesFolderName.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, '').trim(),
                    originalSeriesTitle: extraMeta.originalSeriesTitle || existingMeta.originalSeriesTitle || "",
                    folderName: seriesFolderName,
                    url: existingMeta.url || "", 
                    category: data.category || existingMeta.category || "Unknown",
                    author: existingMeta.author || extraMeta.author || "",
                    vendor: data.vendor || existingMeta.vendor || extraMeta.vendor || "",
                    status: normalizeStatus(existingMeta.status || extraMeta.status || "연재중"),
                    summary: existingMeta.summary || extraMeta.summary || "",
                    thumbnail: existingMeta.thumbnail || extraMeta.thumbnail || "",
                    thumbnailId: existingMeta.thumbnailId || extraMeta.thumbnailId || "",
                    created: existingMeta.created || meta.modifiedTime, 
                    cacheFileId: cacheFileId,
                    itemsCount: itemsCount,
                    lastUpdated: new Date().toISOString()
                };
                
                const fragData = JSON.stringify(mergedMeta);
                
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
    } else if (action === "view_update_metadata") {
      if (!data.seriesId) throw new Error("seriesId is required");
      if (!data.metadata) throw new Error("metadata is required");
      resultBody = View_updateMetadata(data.seriesId, data.metadata, folderId);
    } else if (action === "view_upload_thumbnail") {
      if (!data.seriesId) throw new Error("seriesId is required");
      if (!data.base64Data) throw new Error("base64Data is required");
      resultBody = View_uploadThumbnail(data.seriesId, data.base64Data, folderId);
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
 * @param {Object} [episodeTitles=null] - 클라이언트가 제공한 회차별 제목 맵
 * @returns {Array<Object>} 책 목록
 */
function View_getBooks(seriesId, bypassCache = false, episodeTitles = null) {
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

    const createBook = (item, type, episodeTitlesMap = null) => {
      const name = item.name;
      let number = 0;
      
      // 1. 에피소드 번호 파싱 (Kavita c000 패턴 우선 추출)
      const kavitaMatch = name.match(/[-_ ]c(?:h)?(\d+)/i);
      if (kavitaMatch) {
        number = parseFloat(kavitaMatch[1]);
      } else {
        const hwaMatch = name.match(/(\d+)화/);
        if (hwaMatch) {
          number = parseFloat(hwaMatch[1]);
        } else {
          const match = name.match(/(\d+)/);
          if (match) number = parseFloat(match[1]);
        }
      }
      
      // 2. 에피소드 상세 부제목 (episodeTitle) 추출
      let epTitle = "";
      const numKey = Math.floor(number).toString();
      
      if (episodeTitlesMap && episodeTitlesMap[numKey]) {
        epTitle = episodeTitlesMap[numKey].trim();
      } else {
        // Fallback: 파일명 기반 파싱 방식 적용
        const cleanName = name.replace(/\.[^/.]+$/, "");
        const parts = cleanName.split(" - ");
        if (parts.length >= 3) {
          epTitle = parts.slice(2).join(" - ").trim();
        } else if (parts.length >= 2) {
          epTitle = parts[1].trim();
        } else {
          epTitle = cleanName;
        }
      }

      return {
        id: item.id,
        seriesId: seriesId,
        name: name,
        number: number,
        episodeTitle: epTitle,
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
        books.push(createBook(f, "folder", episodeTitles));
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
        books.push(createBook(f, "file", episodeTitles));
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

    try {
      const meta = DriveAccessService.getMetadata(fileId);
      const fileSize = parseInt(meta.size || '0');
      var SAFE_LIMIT = 30 * 1024 * 1024; // 30MB
      if (fileSize > SAFE_LIMIT) {
        throw new Error(`File too large for fallback download: ${(fileSize/1024/1024).toFixed(1)}MB exceeds 30MB safety limit. Range fetch failed: ${e.message}`);
      }
    } catch (sizeCheckErr) {
      if (sizeCheckErr.message.includes('too large')) throw sizeCheckErr;
      // If meta fetch also fails, proceed with original fallback
    }

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



/* ========================================================================== */
/* FILE: View_HistoryService.gs */
/* ========================================================================== */

// =======================================================
// 📖 View History Service
// Drive 루트에 read_history.json 저장/불러오기
// Merge 로직은 클라이언트(뷰어)에서 처리
// =======================================================

var HISTORY_FILE_NAME = "read_history.json";

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
/* FILE: Migrate_Service.gs */
/* ========================================================================== */

/**
 * 🛠️ Migration Service
 * Handles one-time data migration tasks for system updates.
 */

// Centralized Thumbnail Folder Name provided by View_LibraryService.gs
var THUMB_FOLDER_NAME = "_Thumbnails";

/**
 * [Migration] Moves 'cover.jpg' from series folders to '_Thumbnails/{SeriesID}.jpg'
 * This is a heavy operation and should be run carefully.
 *
 * @param {string} rootFolderId - Root folder ID of the library
 */
function Migrate_MoveThumbnails(rootFolderId) {
  const thumbFolderId = DriveAccessService.ensureFolder(rootFolderId, THUMB_FOLDER_NAME);
  
  const logs = [];
  logs.push(`[Start] Migration started... Target: ${THUMB_FOLDER_NAME} (${thumbFolderId})`);

  const CATS = ["Webtoon", "Manga", "Novel"];
  const folders = DriveAccessService.list(rootFolderId, {
      query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)"
  });

  // Iterate Categories
  for (const catFolder of folders) {
    if (!CATS.includes(catFolder.name)) continue;

    logs.push(`[Scan] Category: ${catFolder.name}`);

    // Iterate Series
    const seriesFolders = DriveAccessService.list(catFolder.id, {
        query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: "files(id, name)"
    });

    for (const sFolder of seriesFolders) {
      const sName = sFolder.name;

      // Extract Series ID (Supports alphanumeric IDs v1.9.4+)
      const match = sName.match(/^\[([a-zA-Z0-9_\-]+)\]/);
      if (!match) continue;

      const seriesId = match[1];

      // Check for 'cover.jpg'
      const covers = DriveAccessService.list(sFolder.id, {
          query: "name = 'cover.jpg' and trashed = false",
          fields: "files(id, parents)"
      });

      if (covers.length > 0) {
        const coverFile = covers[0];
        try {
          // Move (V3 Style)
          DriveAccessService.move(coverFile.id, sFolder.id, thumbFolderId);
          // Rename
          DriveAccessService.patch(coverFile.id, { name: `${seriesId}.jpg` });
          
          logs.push(`  ✅ Moved: ${sName} -> ${seriesId}.jpg`);
        } catch (e) {
          logs.push(`  ❌ Failed: ${sName} - ${e.toString()}`);
        }
      }
    }
  }

  logs.push("[Done] Migration completed.");
  return logs;
}

/**
 * [Migration] Rename files to include Series Title
 * Target: "0001 - 1화.cbz" -> "0001 - SeriesTitle 1화.cbz"
 *
 * @param {string} seriesId
 * @param {string} rootFolderId
 */
function Migrate_RenameFiles(seriesId, rootFolderId) {
  let targetSeriesFolderId = null;
  let targetSeriesFolderName = "";
  let seriesTitle = "";

  // 1. Find Series Folder: "[ID] Title"
  const CATS = ["Webtoon", "Manga", "Novel"];
  const folders = DriveAccessService.list(rootFolderId, {
      query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)"
  });

  for (const catFolder of folders) {
    if (!CATS.includes(catFolder.name)) continue;

    const seriesFolders = DriveAccessService.list(catFolder.id, {
        query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: "files(id, name)"
    });

    for (const sFolder of seriesFolders) {
      if (sFolder.name.includes(`[${seriesId}]`)) {
        targetSeriesFolderId = sFolder.id;
        targetSeriesFolderName = sFolder.name;
        seriesTitle = sFolder.name.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, "").trim();
        break;
      }
    }
    if (targetSeriesFolderId) break;
  }

  if (!targetSeriesFolderId) return ["Error: Series Folder Not Found"];

  const logs = [];
  logs.push(`[Start] Renaming files in: ${targetSeriesFolderName} (Title: ${seriesTitle})`);

  const files = DriveAccessService.list(targetSeriesFolderId, {
      query: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)"
  });
  let count = 0;

  for (const file of files) {
    const name = file.name;

    if (name.match(/^\d{4}\s-\s/) && !name.includes(seriesTitle)) {
      const parts = name.split(" - ");
      if (parts.length >= 2) {
        const numPart = parts[0]; 
        const restPart = parts.slice(1).join(" - "); 

        const newName = `${numPart} - ${seriesTitle} ${restPart}`;
        DriveAccessService.patch(file.id, { name: newName });
        logs.push(`  Renamed: ${name} -> ${newName}`);
        count++;
      }
    }
  }

  logs.push(`[Done] ${count} files renamed.`);
  return logs;
}

/**
 * [Migration] Kavita 규격에 맞게 폴더 내 파일명을 일괄 변경하고 메타데이터 자가 치유(Self-Healing)를 수행합니다.
 * 타겟 파일명: "0001 - 1화.cbz" ➔ "시리즈제목 - c001 - 1화.cbz"
 * 자가 치유: sourceId가 드라이브 폴더 ID로 꼬인 경우 info.json을 읽어 원본 사이트 ID로 복원
 *
 * @param {string} rootFolderId - 라이브러리 루트 폴더 ID
 * @param {boolean} executeRename - 파일명 실제 변경 여부 (false인 경우 Dry-Run으로 로그만 출력)
 * @returns {Array<string>} 마이그레이션 작업 로그
 */
function Migrate_KavitaFormat(rootFolderId, executeRename = false) {
  const startTime = new Date().getTime();
  const TIME_LIMIT = 20000; // 20초 제한 (GAS 6분 초과 방지)
  const logs = [];
  logs.push(`[Start] Kavita 마이그레이션 시작 (실제 변경 여부: ${executeRename})`);

  const CATS = ["Webtoon", "Manga", "Novel"];
  const folders = DriveAccessService.list(rootFolderId, {
      query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)"
  });

  let processedCount = 0;
  let skippedCount = 0;
  let timeoutFlag = false;

  for (const catFolder of folders) {
    if (!CATS.includes(catFolder.name)) continue;
    if (timeoutFlag) break;

    logs.push(`[Scan] 카테고리 폴더: ${catFolder.name}`);

    const seriesFolders = DriveAccessService.list(catFolder.id, {
        query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: "files(id, name)"
    });

    for (const sFolder of seriesFolders) {
      if (new Date().getTime() - startTime > TIME_LIMIT) {
        logs.push(`[Timeout] 실행 시간(20초)이 초과되어 마이그레이션을 일시 중단합니다. 이어서 다시 실행해 주세요.`);
        timeoutFlag = true;
        break;
      }

      const folderId = sFolder.id;
      const folderName = sFolder.name;
      
      // 1. 대괄호 ID 추출 (영숫자 정규식 교정 적용)
      const idMatch = folderName.match(/^\[([a-zA-Z0-9_\-]+)\]/);
      let folderSeriesId = idMatch ? idMatch[1] : null;
      let seriesTitle = folderName.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, "").trim();

      // _toki_meta.json 로드 시도
      let metaFileId = null;
      let metaData = null;
      const metaName = "_toki_meta.json";
      const metaResults = DriveAccessService.list(folderId, {
        query: `name = '${metaName}' and trashed = false`,
        fields: "files(id)"
      });
      if (metaResults.length > 0) {
        metaFileId = metaResults[0].id;
        try {
          const content = DriveAccessService.getFileContent(metaFileId);
          metaData = JSON.parse(content);
        } catch (e) {
          logs.push(`  ⚠️ [${folderName}] _toki_meta.json 파싱 오류 (새로 생성 예정)`);
        }
      }

      // 이미 마이그레이션이 완료된 폴더인지 체크 (기록 보존 및 중복 실행 방지)
      if (metaData && metaData.kavitaMigrated === true) {
        skippedCount++;
        continue;
      }

      logs.push(`⚙️ [Process] 작품 처리 중: "${folderName}"`);

      // 2. info.json 조회 및 파싱 (소스 ID 복구/정상성 검증 목적)
      let infoData = null;
      const infoResults = DriveAccessService.list(folderId, {
        query: "name = 'info.json' and trashed = false",
        fields: "files(id)"
      });
      if (infoResults.length > 0) {
        try {
          const infoContent = DriveAccessService.getFileContent(infoResults[0].id);
          infoData = JSON.parse(infoContent);
        } catch (e) {
          logs.push(`  ⚠️ [${folderName}] info.json 읽기 실패: ${e.message}`);
        }
      }

      // 3. 소스 ID 자가 치유 (Self-Healing)
      let finalSourceId = folderSeriesId || (metaData ? metaData.sourceId : null);
      
      // 만약 소스 ID가 드라이브 폴더 ID이거나 비어있다면 info.json의 ID로 복원
      if (!finalSourceId || finalSourceId === folderId) {
        if (infoData && infoData.id) {
          finalSourceId = infoData.id;
          logs.push(`  ✅ [Self-Healing] 소스 ID 복구: ${folderId} ➔ ${finalSourceId}`);
        } else {
          finalSourceId = folderId; // 복구할 정보가 없다면 폴더 ID 유지
        }
      }

      // 4. 메타데이터 갱신 및 저장
      const updatedMeta = {
        ...(metaData || {}),
        id: folderId,
        sourceId: finalSourceId,
        vendorId: (infoData && infoData.id) ? infoData.id : finalSourceId,
        name: seriesTitle,
        originalSeriesTitle: (infoData && infoData.title) ? infoData.title : (metaData && metaData.originalSeriesTitle ? metaData.originalSeriesTitle : seriesTitle),
        folderName: folderName,
        category: catFolder.name,
        vendor: (infoData && infoData.vendor) ? infoData.vendor : (metaData && metaData.vendor ? metaData.vendor : ""),
        status: normalizeStatus((infoData && infoData.status) ? infoData.status : (metaData && metaData.status ? metaData.status : "연재중")),
        summary: (infoData && infoData.summary) ? infoData.summary : (metaData && metaData.summary ? metaData.summary : ""),
        kavitaMigrated: true, // 마이그레이션 완료 플래그 기록
        lastUpdated: new Date().toISOString()
      };

      try {
        const metaString = JSON.stringify(updatedMeta);
        if (metaFileId) {
          DriveAccessService.updateFileContent(metaFileId, metaString);
        } else {
          DriveAccessService.createFile(folderId, metaName, metaString, "application/json");
        }
        logs.push(`  💾 [Metadata] _toki_meta.json 자가 치유 및 갱신 완료`);
      } catch (metaErr) {
        logs.push(`  ❌ [Metadata] 메타데이터 저장 실패: ${metaErr.message}`);
      }

      // 5. 파일명 일괄 변경 (Kavita 규격)
      if (executeRename) {
        const files = DriveAccessService.list(folderId, {
            query: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
            fields: "files(id, name)"
        });

        let fileRenameCount = 0;
        for (const file of files) {
          const name = file.name;
          // 시스템 파일 제외
          if (name === "info.json" || name === "_toki_meta.json" || name === "_toki_cache.json") continue;

          // 이미 규격에 맞는 파일명인지 체크 (예: "Title - c001" 등 포함 여부)
          if (name.includes(seriesTitle) && name.match(/[-_ ]c(?:h)?\d+/i)) {
            continue;
          }

          // 에피소드 번호 파싱
          let number = null;
          const kavitaMatch = name.match(/[-_ ]c(?:h)?(\d+)/i);
          if (kavitaMatch) {
            number = parseInt(kavitaMatch[1]);
          } else {
            const hwaMatch = name.match(/(\d+)화/);
            if (hwaMatch) {
              number = parseInt(hwaMatch[1]);
            } else {
              const startNumMatch = name.match(/^(\d+)/);
              if (startNumMatch) {
                number = parseInt(startNumMatch[1]);
              }
            }
          }

          if (number !== null) {
            const padNum = String(number).padStart(3, '0');
            const ext = name.split('.').pop();
            
            // 기존 파일명에서 부제목 파싱 시도
            const cleanName = name.replace(/\.[^/.]+$/, "");
            const parts = cleanName.split(" - ");
            let epTitle = "";
            if (parts.length >= 3) {
              epTitle = parts.slice(2).join(" - ").trim();
            } else if (parts.length >= 2) {
              epTitle = parts[1].trim();
            } else {
              epTitle = cleanName;
            }

            // 파일명에 'c001' 혹은 '1화' 가 없을 경우 부제목에 추가 보장
            if (!epTitle.includes(`${number}화`) && !epTitle.includes(`c${padNum}`)) {
              epTitle = `${number}화 ${epTitle}`.trim();
            }

            // 새 파일명 조합: "시리즈명 - c001 - 부제목.확장자"
            const newName = `${seriesTitle} - c${padNum} - ${epTitle}.${ext}`;

            try {
              DriveAccessService.patch(file.id, { name: newName });
              fileRenameCount++;
            } catch (renameErr) {
              logs.push(`  ❌ [Rename] 파일명 변경 실패: ${name} ➔ ${renameErr.message}`);
            }
          }
        }
        if (fileRenameCount > 0) {
          logs.push(`  📂 [Rename] ${fileRenameCount}개 파일명 변경 완료 (Kavita 규격)`);
        }
      }

      processedCount++;
    }
  }

  logs.push(`[Done] 마이그레이션 실행 완료. (신규 처리: ${processedCount}개, 스킵: ${skippedCount}개)`);
  return logs;
}


/* ========================================================================== */
/* FILE: View_KavitaService.gs */
/* ========================================================================== */

// =======================================================
// 🔄 Kavita Library Structure Migration Service
// =======================================================

/**
 * [Phase 3] 시리즈 폴더를 Root 직속 플랫 구조로 변환 (Kavita 호환)
 * - CATS(Webtoon/Novel/Manga) 폴더에서 시리즈를 Root로 이동
 * - 폴더명/파일명에서 [ID] 접두사 제거
 * - _toki_meta.json에 _restructured: true 기록 (멱등성)
 *
 * @param {string} rootFolderId - Root 폴더 ID
 * @param {string[]} selectedIds - 변환할 시리즈 폴더 ID 목록 (빈 배열 = 전체)
 * @returns {Object} { ok, moved, total, errors }
 */
function Kavita_Restructure(rootFolderId, selectedIds) {
  const result = { ok: true, moved: 0, total: 0, errors: [] };
  const CATS = ["Webtoon", "Manga", "Novel"];
  const startTime = new Date().getTime();
  const TIME_LIMIT = 300000; // 5 minutes

  // 1. Collect target series folders
  let targets = [];
  
  if (selectedIds && selectedIds.length > 0) {
    // Specific selection
    targets = selectedIds.map(id => ({ id, name: DriveAccessService.getMetadata(id).name }));
  } else {
    // Scan all category folders
    for (const catName of CATS) {
      const catFolder = findFolderId(catName, rootFolderId);
      if (!catFolder) continue;
      const seriesList = DriveAccessService.list(catFolder, {
        query: "mimeType = 'application/vnd.google-apps.folder'",
        fields: "files(id, name)"
      });
      targets.push(...seriesList);
    }
  }

  result.total = targets.length;
  Debug.log(`[Kavita] 변환 대상: ${result.total}개 시리즈`);

  // 2. Process each series
  for (const series of targets) {
    if (new Date().getTime() - startTime > TIME_LIMIT) {
      Debug.log(`[Kavita] ⏰ 타임아웃 approaching, ${result.moved}/${result.total} 완료`);
      break;
    }

    try {
      const seriesMeta = _kavitaProcessSeries(series, rootFolderId);
      if (seriesMeta) result.moved++;
    } catch (e) {
      result.errors.push({ id: series.id, reason: e.message });
      Debug.error(`[Kavita] ❌ 실패: ${series.name}: ${e.message}`);
    }
  }

  // 3. Clean up empty category folders
  for (const catName of CATS) {
    try {
      const catFolder = findFolderId(catName, rootFolderId);
      if (!catFolder) continue;
      const remaining = DriveAccessService.list(catFolder, {
        query: "mimeType = 'application/vnd.google-apps.folder'",
        fields: "files(id)"
      });
      if (remaining.length === 0) {
        DriveAccessService.trash(catFolder);
        Debug.log(`[Kavita] 🗑️ 빈 카테고리 폴더 정리: ${catName}`);
      }
    } catch (e) {}
  }

  return result;
}

/**
 * 개별 시리즈 폴더를 플랫 구조로 변환
 */
function _kavitaProcessSeries(series, rootFolderId) {
  const folderId = series.id;
  const folderName = series.name;
  
  // 멱등성: 이미 처리되었는지 확인
  const metaResults = DriveAccessService.list(folderId, {
    query: "name = '_toki_meta.json'",
    fields: "files(id)"
  });
  
  let alreadyRestructured = false;
  if (metaResults.length > 0) {
    try {
      const content = DriveAccessService.getFileContent(metaResults[0].id);
      const meta = JSON.parse(content);
      alreadyRestructured = meta._restructured === true;
    } catch (e) { Debug.error("[Kavita] processSeries error: " + e.message); }
  }
  
  if (alreadyRestructured) {
    Debug.log(`[Kavita] ⏭️ 이미 변환됨: ${folderName}`);
    return null;
  }

  // Clean folder name: remove [ID] prefix
  const cleanName = folderName.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, '').trim() || folderName;
  
  // If already in root and no [ID] prefix, just mark as done
  if (cleanName === folderName && !folderName.match(/^\[/)) {
    _kavitaMarkMigrated(folderId, folderName);
    Debug.log(`[Kavita] ✅ 이미 플랫 구조: ${folderName}`);
    return folderId;
  }

  // Create or find destination folder in root
  let destFolderId;
  try {
    destFolderId = DriveAccessService.ensureFolder(rootFolderId, cleanName);
  } catch (e) {
    throw new Error(`대상 폴더 생성 실패: ${cleanName} (${e.message})`);
  }

  // Move all files
  const files = DriveAccessService.list(folderId, {
    query: "mimeType != 'application/vnd.google-apps.folder'",
    fields: "files(id, name)"
  });

  for (const file of files) {
    if (file.name === 'info.json' || file.name === '_toki_meta.json') {
      DriveAccessService.move(file.id, folderId, destFolderId);
      continue;
    }
    
    // Clean file name: remove [ID] prefix
    const cleanFileName = file.name.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, '').trim() || file.name;
    if (cleanFileName !== file.name) {
      DriveAccessService.patch(file.id, { name: cleanFileName });
    }
    DriveAccessService.move(file.id, folderId, destFolderId);
  }

  // Mark source folder as migrated
  _kavitaMarkMigrated(destFolderId, cleanName);

  // Trash the old series folder
  try {
    DriveAccessService.trash(folderId);
  } catch (e) {
    Debug.log(`[Kavita] ⚠️ 구 폴더 정리 실패 (무시 가능): ${folderId}`);
  }

  Debug.log(`[Kavita] ✅ 변환 완료: ${folderName} → ${cleanName}`);
  return destFolderId;
}

function _kavitaMarkMigrated(folderId, seriesName) {
  let meta = {};
  let existing = [];
  try {
    existing = DriveAccessService.list(folderId, {
      query: "name = '_toki_meta.json'",
      fields: "files(id)"
    });
    if (existing.length > 0) {
      const raw = DriveAccessService.getFileContent(existing[0].id);
      try {
        meta = JSON.parse(raw);
      } catch (parseErr) {
        Debug.error(`[Kavita] _toki_meta.json parse failed for ${seriesName}: ${parseErr.message}. Skip write to prevent data loss.`);
        return;
      }
    }
  } catch (e) {
    Debug.error(`[Kavita] Drive access failed for ${seriesName}: ${e.message}`);
    return;
  }

  meta._restructured = true;
  meta._restructuredAt = new Date().toISOString();
  meta.name = meta.name || seriesName;
  meta.lastUpdated = new Date().toISOString();

  const body = JSON.stringify(meta, null, 2);
  if (existing.length > 0) {
    DriveAccessService.updateFileContent(existing[0].id, body, "application/json");
  } else {
    DriveAccessService.createFile(folderId, "_toki_meta.json", body, "application/json");
  }
}

/**
 * 현재 라이브러리 구조 진단
 */
function Kavita_GetStatus(rootFolderId) {
  const CATS = ["Webtoon", "Manga", "Novel"];
  const SYSTEM_FOLDERS = ["_Thumbnails", "_MergeIndex"];
  
  const result = {
    stats: { totalSeries: 0, legacyCategory: 0, alreadyFlat: 0, restructured: 0 },
    byCategory: [],
    conflicts: []
  };
  
  const nameCount = {};
  
  // Scan category folders
  for (const catName of CATS) {
    const catFolder = findFolderId(catName, rootFolderId);
    if (!catFolder) continue;
    
    const seriesList = DriveAccessService.list(catFolder, {
      query: "mimeType = 'application/vnd.google-apps.folder'",
      fields: "files(id, name)"
    });
    
    if (seriesList.length === 0) continue;
    
    const entry = { name: catName, series: [] };
    for (const s of seriesList) {
      const cleanName = s.name.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, '').trim() || s.name;
      entry.series.push({ id: s.id, name: s.name, cleanName });
      
      // Check for conflicts
      if (nameCount[cleanName]) {
        nameCount[cleanName].push({ path: `${catName}/${s.name}`, id: s.id });
      } else {
        nameCount[cleanName] = [{ path: `${catName}/${s.name}`, id: s.id }];
      }
      
      // Check if already restructured
      try {
        const metaFiles = DriveAccessService.list(s.id, {
          query: "name = '_toki_meta.json'",
          fields: "files(id)"
        });
        if (metaFiles.length > 0) {
          const content = DriveAccessService.getFileContent(metaFiles[0].id);
          const meta = JSON.parse(content);
          if (meta._restructured) result.stats.restructured++;
        }
      } catch (e) {}
      
      result.stats.legacyCategory++;
    }
    result.byCategory.push(entry);
  }
  
  // Scan root for already-flat series
  const rootFolders = DriveAccessService.list(rootFolderId, {
    query: "mimeType = 'application/vnd.google-apps.folder'",
    fields: "files(id, name)"
  });
  
  for (const f of rootFolders) {
    if (CATS.includes(f.name) || SYSTEM_FOLDERS.includes(f.name)) continue;
    if (!f.name.match(/^\[/)) {
      result.stats.alreadyFlat++;
    }
  }
  
  result.stats.totalSeries = result.stats.legacyCategory + result.stats.alreadyFlat;
  
  // Find conflicts
  for (const [name, sources] of Object.entries(nameCount)) {
    if (sources.length > 1) {
      result.conflicts.push({ name, sources });
    }
  }
  
  return result;
}


/* ========================================================================== */
/* FILE: Debug.gs */
/* ========================================================================== */

// =====================================================
// 🐞 디버깅 모듈 (In-Memory Log Collector)
// =====================================================

var Debug = {
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

  warn: function (msg) {
    const elapsed = new Date().getTime() - this.startTime;
    const timestamp = `[+${elapsed}ms]`;
    console.warn(msg);
    this.logs.push(`⚠️ ${timestamp} ${msg}`);
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


