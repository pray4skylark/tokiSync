// =====================================================
// ⚙️ TokiSync API Server v3.0.0
// -----------------------------------------------------
// 🤝 Compatibility:
//    - Client v3.0.0+ (User Execution Mode)
// -----------------------------------------------------
// ⚙️ 설정 (사용자 속성 사용)
// =====================================================

/**
 * 사용자 설정(폴더 ID, 시크릿 키)을 저장합니다.
 * 클라이언트에서 'save_config' 요청 시 실행됩니다.
 */
function saveUserConfig(folderId) {
  const userProps = PropertiesService.getUserProperties();
  
  // 1. 시크릿 키 자동 생성 (UUID)
  const secretKey = Utilities.getUuid();
  
  // 2. UserProperties에 저장
  userProps.setProperties({
    'ROOT_FOLDER_ID': folderId,
    'SECRET_KEY': secretKey
  });
  
  // 3. 라이브러리 인덱스 파일에 백업 (분실 대비)
  try {
    backupSecretKeyToDrive(folderId, secretKey);
  } catch (e) {
    return { success: false, error: "Drive Backup Failed: " + e.message };
  }
  
  return { success: true, secretKey: secretKey };
}

/**
 * 사용자 설정을 가져옵니다.
 */
function getUserConfig() {
  const userProps = PropertiesService.getUserProperties();
  return {
    rootFolderId: userProps.getProperty('ROOT_FOLDER_ID'),
    secretKey: userProps.getProperty('SECRET_KEY')
  };
}

/**
 * 시크릿 키를 드라이브(library_index.json)에 백업합니다.
 */
function backupSecretKeyToDrive(folderId, secretKey) {
  const root = DriveApp.getFolderById(folderId);
  const fileName = "library_index.json";
  const files = root.getFilesByName(fileName);
  
  let data = [];
  let file;
  
  if (files.hasNext()) {
    file = files.next();
    try {
      data = JSON.parse(file.getBlob().getDataAsString());
    } catch (e) { data = []; }
  } else {
    file = root.createFile(fileName, "[]", MimeType.PLAIN_TEXT);
  }
  
  // 메타데이터 객체 찾기 (id가 'metadata'인 항목)
  let metadata = data.find(item => item.id === 'metadata');
  if (!metadata) {
    metadata = { id: 'metadata', type: 'system' };
    data.unshift(metadata); // 맨 앞에 추가
  }
  
  // 키 업데이트
  metadata.secret_key_backup = secretKey;
  metadata.updated_at = new Date().toISOString();
  
  file.setContent(JSON.stringify(data));
}

// =====================================================

// [GET] 서버 상태 확인용
function doGet(e) {
  return ContentService.createTextOutput("✅ TokiSync API Server v3.0 is Running...");
}

// [POST] Tampermonkey 요청 처리 (핵심 로직)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // 0. 설정 저장 요청 (인증 불필요)
    if (data.type === 'save_config') {
      if (!data.folderId) return createRes("error", "Missing folderId");
      const result = saveUserConfig(data.folderId);
      if (result.success) {
        return createRes("success", { secretKey: result.secretKey });
      } else {
        return createRes("error", result.error);
      }
    }

    // 1. 설정 로드 및 인증
    const config = getUserConfig();
    if (!config.rootFolderId || !config.secretKey) {
      return createRes("error", "Server Config Missing. Please run 'save_config' first.");
    }

    // 2. 보안 검사
    if (data.key !== config.secretKey) return createRes("error", "Unauthorized");

    // 전역 변수 대신 config 객체 전달을 위해 래퍼 함수 사용 필요
    // 하지만 기존 구조 유지를 위해 각 함수에 config를 전달하는 방식으로 변경하거나
    // 여기서 전역 변수처럼 동작하도록 인자를 넘겨줘야 함.
    // -> 각 함수가 ROOT_FOLDER_ID를 참조하므로, 인자로 넘겨주도록 리팩토링 필요.
    
    // 3. 요청 타입 분기
    if (data.type === "init") return initResumableUpload(data, config.rootFolderId);
    if (data.type === "upload") return uploadChunk(data);
    if (data.type === "check_history") return checkDownloadHistory(data, config.rootFolderId);
    if (data.type === "save_info") return saveSeriesInfo(data, config.rootFolderId);
    if (data.type === "get_library") return getLibraryIndex(config.rootFolderId);
    if (data.type === "update_library_status") return updateLibraryStatus(data, config.rootFolderId);

    // 구버전 호환
    if (data.type === "history_get") return checkDownloadHistory(data, config.rootFolderId); 
    
    return createRes("error", "Unknown type");

  } catch (error) {
    return createRes("error", error.toString());
  }
}

// -------------------------------------------------------
// 📂 기능 1: 다운로드 기록 확인 (폴더/파일 스캔)
// -------------------------------------------------------
function checkDownloadHistory(data, rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  const folderId = findFolderId(data.folderName, rootFolderId);
  
  if (!folderId) {
    return createRes("success", []); // 폴더 없으면 기록 없음
  }

  const seriesFolder = DriveApp.getFolderById(folderId);
  const existingEpisodes = [];
  
  // 파일(CBZ) 스캔
  const files = seriesFolder.getFiles();
  while (files.hasNext()) {
    const name = files.next().getName();
    const match = name.match(/^(\d+)/); 
    if (match) existingEpisodes.push(parseInt(match[1]));
  }
  
  // 폴더 스캔 (구버전 호환)
  const subFolders = seriesFolder.getFolders();
  while (subFolders.hasNext()) {
    const name = subFolders.next().getName();
    const match = name.match(/^(\d+)/);
    if (match) existingEpisodes.push(parseInt(match[1]));
  }

  // 중복 제거 및 정렬
  const uniqueEpisodes = [...new Set(existingEpisodes)].sort((a, b) => a - b);
  
  return createRes("success", uniqueEpisodes);
}

// -------------------------------------------------------
// 📝 기능 2: 작품 정보(info.json) 저장
// -------------------------------------------------------
function saveSeriesInfo(data, rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  let seriesFolder;
  
  const folderId = findFolderId(data.folderName, rootFolderId);
  if (folderId) {
    seriesFolder = DriveApp.getFolderById(folderId);
  } else {
    seriesFolder = root.createFolder(data.folderName);
  }

  const fileName = "info.json";
  const files = seriesFolder.getFilesByName(fileName);
  
  const infoData = {
    id: data.id,
    title: data.title,
    author: data.author || "Unknown",
    category: data.category || "Unknown",
    status: data.status || "Unknown",
    thumbnail: data.thumbnail || "",
    url: data.url,
    site: data.site,
    last_episode: data.last_episode || 0,
    file_count: data.file_count || 0,
    last_updated: new Date().toISOString()
  };
  
  const jsonString = JSON.stringify(infoData, null, 2);

  if (files.hasNext()) {
    files.next().setContent(jsonString);
  } else {
    seriesFolder.createFile(fileName, jsonString, MimeType.PLAIN_TEXT);
  }

  return createRes("success", "Info saved");
}

// -------------------------------------------------------
// 📚 기능 4: 라이브러리 인덱스 조회 (TokiView 캐시 공유)
// -------------------------------------------------------
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
  return createRes("success", []); // 파일 없으면 빈 배열
}

// -------------------------------------------------------
// 🔄 기능 5: 라이브러리 상태 업데이트 (클라이언트 결과 저장)
// -------------------------------------------------------
function updateLibraryStatus(data, rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  const files = root.getFilesByName("library_index.json");
  
  if (!files.hasNext()) return createRes("error", "Index not found");
  
  const file = files.next();
  let library = [];
  try {
    library = JSON.parse(file.getBlob().getDataAsString());
  } catch (e) { return createRes("error", "Invalid JSON"); }

  // 업데이트 반영
  const updates = data.updates; 
  let changedCount = 0;

  updates.forEach(u => {
    const item = library.find(i => i.id === u.id);
    if (item) {
      item.latest_episode_in_site = u.latestEpisode;
      item.last_checked_at = new Date().toISOString();
      changedCount++;
    }
  });

  if (changedCount > 0) {
    file.setContent(JSON.stringify(library));
  }

  return createRes("success", `Updated ${changedCount} items`);
}

// -------------------------------------------------------
// ☁️ 기능 3: 대용량 이어 올리기 (Resumable Upload)
// -------------------------------------------------------
function initResumableUpload(data, rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  let folderId = findFolderId(data.folderName, rootFolderId);
  if (!folderId) {
    folderId = root.createFolder(data.folderName).getId();
  }

  const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
  
  const metadata = {
    name: data.fileName,
    parents: [folderId],
    mimeType: "application/zip"
  };

  const params = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(metadata),
    headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, params);
  
  if (response.getResponseCode() === 200) {
    return createRes("success", response.getHeaders()["Location"]);
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
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(uploadUrl, params);
  const code = response.getResponseCode();

  if (code === 308 || code === 200 || code === 201) {
    return createRes("success", "Chunk uploaded");
  } else {
    return createRes("error", `Drive API Error: ${code}`);
  }
}

// -------------------------------------------------------
// 🛠 헬퍼 함수
// -------------------------------------------------------
function findFolderId(folderName, rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  
  // 1. [ID] 포함된 폴더 검색 (제목 변경 대응)
  const idMatch = folderName.match(/^\[(\d+)\]/);
  if (idMatch) {
    const search = root.searchFolders(`title contains '[${idMatch[1]}]' and trashed = false`);
    if (search.hasNext()) return search.next().getId();
  }
  
  // 2. 이름 일치 검색
  const folders = root.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next().getId();
  
  return null;
}

function createRes(status, body) {
  return ContentService.createTextOutput(JSON.stringify({status: status, body: body}))
    .setMimeType(ContentService.MimeType.JSON);
}

// 권한 승인용 더미 함수
function authorizeCheck() {
  DriveApp.getRootFolder();
  UrlFetchApp.fetch("https://www.google.com");
  console.log("✅ 권한 승인 완료!");
}