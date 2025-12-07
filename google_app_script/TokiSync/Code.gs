// =====================================================
// ⚙️ TokiSync API Server v3.0.0-BETA3 (Stateless)
// -----------------------------------------------------
// 🤝 Compatibility:
//    - Client v3.0.0-BETA3+ (User Execution Mode)
// -----------------------------------------------------
// ⚙️ 설정 (Stateless - 클라이언트 주도)
// =====================================================

// [GET] 서버 상태 확인용
function doGet(e) {
  return ContentService.createTextOutput("✅ TokiSync API Server v3.0-BETA3 (Stateless) is Running...");
}

// [POST] Tampermonkey 요청 처리 (핵심 로직)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // 1. 필수 파라미터 검증 (folderId)
    // Stateless 방식이므로 클라이언트가 반드시 folderId를 보내야 함
    if (!data.folderId) {
      return createRes("error", "Missing folderId in request payload");
    }

    const rootFolderId = data.folderId;

    // 2. 요청 타입 분기
    if (data.type === "init") return initResumableUpload(data, rootFolderId);
    if (data.type === "upload") return uploadChunk(data);
    if (data.type === "check_history") return checkDownloadHistory(data, rootFolderId);
    if (data.type === "save_info") return saveSeriesInfo(data, rootFolderId);
    if (data.type === "get_library") return getLibraryIndex(rootFolderId);
    if (data.type === "update_library_status") return updateLibraryStatus(data, rootFolderId);

    // 구버전 호환
    if (data.type === "history_get") return checkDownloadHistory(data, rootFolderId); 
    
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
    metadata: {
       authors: [data.author || "Unknown"],
       status: data.status || "Unknown",
       category: data.category || "Unknown",
       publisher: data.site || ""
    },
    thumbnail: data.thumbnail || "",
    url: data.url,
    
    // Legacy / Convenience fields
    author: data.author || "Unknown", // for backward compat if needed during migration
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
    if (!Array.isArray(library)) library = [];
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