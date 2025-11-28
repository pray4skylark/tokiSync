// =====================================================
// 🔒 설정
// =====================================================
const ROOT_FOLDER_ID = ""; // 사용자님 ID 유지
const SECRET_KEY = "";       // 사용자님 Key 유지
// =====================================================


function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.key !== SECRET_KEY) return createRes("error", "Unauthorized");

    if (data.type === "init") return initResumableUpload(data);
    if (data.type === "upload") return uploadChunk(data);
    if (data.type === "check_history") return checkDownloadHistory(data); // ⭐️ 수정됨
    if (data.type === "save_info") return saveSeriesInfo(data);

    return createRes("error", "Unknown type");
  } catch (error) {
    return createRes("error", error.toString());
  }
}

// -------------------------------------------------------
// 📂 기능 1: 다운로드 기록 확인 (ID 기반 검색 & 유연한 파싱)
// -------------------------------------------------------
function checkDownloadHistory(data) {
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  
  // 클라이언트가 보낸 폴더명에서 [ID] 추출 (예: "[12345] 제목" -> "12345")
  const idMatch = data.folderName.match(/^\[(\d+)\]/);
  let seriesFolder;

  if (idMatch) {
    // 1. 제목이 달라도 ID가 포함된 폴더 검색 (가장 정확함)
    const id = idMatch[1];
    const search = root.searchFolders(`title contains '[${id}]' and trashed = false`);
    if (search.hasNext()) {
      seriesFolder = search.next();
    }
  }
  
  // ID 검색 실패 시, 이름으로 재시도 (Fallback)
  if (!seriesFolder) {
    const sFolders = root.getFoldersByName(data.folderName);
    if (sFolders.hasNext()) seriesFolder = sFolders.next();
  }

  // 폴더를 못 찾았으면 -> 다운로드 내역 없음 (빈 배열 반환)
  if (!seriesFolder) return createRes("success", []);

  // 2. 파일 스캔 (CBZ/ZIP 등)
  const existingEpisodes = [];
  const files = seriesFolder.getFiles();
  
  while (files.hasNext()) {
    const name = files.next().getName();
    // ⭐️ 수정: "0001 - " 뿐만 아니라 "1 - ", "1화" 등 숫자로 시작하면 다 잡음
    const match = name.match(/^(\d+)/); 
    if (match) {
      existingEpisodes.push(parseInt(match[1]));
    }
  }
  
  // 폴더 방식(v0.8.0 시절) 데이터도 스캔
  const folders = seriesFolder.getFolders();
  while (folders.hasNext()) {
    const name = folders.next().getName();
    const match = name.match(/^(\d+)/); 
    if (match) {
      existingEpisodes.push(parseInt(match[1]));
    }
  }

  // 중복 제거 및 정렬
  const uniqueEpisodes = [...new Set(existingEpisodes)].sort((a, b) => a - b);
  
  return createRes("success", uniqueEpisodes);
}

// -------------------------------------------------------
// 📝 기능 2: 작품 정보 저장 (기존 유지)
// -------------------------------------------------------
function saveSeriesInfo(data) {
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  // 여기도 ID 기반 검색 적용
  const idMatch = data.folderName.match(/^\[(\d+)\]/);
  let seriesFolder;

  if (idMatch) {
    const search = root.searchFolders(`title contains '[${idMatch[1]}]' and trashed = false`);
    if (search.hasNext()) seriesFolder = search.next();
  }
  
  if (!seriesFolder) {
     // 없으면 새로 생성 (클라이언트가 보낸 이름 그대로)
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
    last_updated: new Date().toISOString()
  };
  
  const jsonString = JSON.stringify(infoData, null, 2);
  if (files.hasNext()) files.next().setContent(jsonString);
  else seriesFolder.createFile(fileName, jsonString, MimeType.PLAIN_TEXT);

  return createRes("success", "Info saved");
}

// -------------------------------------------------------
// ☁️ 기능 3: 이어 올리기 (기존 유지 + ID기반 폴더찾기 적용)
// -------------------------------------------------------
function initResumableUpload(data) {
  const folderId = getFolderId(data.folderName); 
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
  if (response.getResponseCode() === 200) return createRes("success", response.getHeaders()["Location"]);
  else return createRes("error", response.getContentText());
}

function uploadChunk(data) {
  const uploadUrl = data.uploadUrl;
  const chunkData = Utilities.base64Decode(data.chunkData);
  const blob = Utilities.newBlob(chunkData);
  const start = data.start;
  const size = blob.getBytes().length;
  const end = start + size - 1;
  const total = data.total;
  const rangeHeader = `bytes ${start}-${end}/${total}`;

  const params = {
    method: "put", payload: blob,
    headers: { "Content-Range": rangeHeader }, muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(uploadUrl, params);
  const code = response.getResponseCode();

  if (code === 308 || code === 200 || code === 201) return createRes("success", "Chunk uploaded");
  else return createRes("error", `Drive API Error: ${code}`);
}

// ⭐️ ID 기반 폴더 찾기 헬퍼 함수 (중요!)
function getFolderId(folderName) {
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  
  // [ID] 추출
  const idMatch = folderName.match(/^\[(\d+)\]/);
  if (idMatch) {
    const id = idMatch[1];
    // ID가 포함된 폴더 검색
    const search = root.searchFolders(`title contains '[${id}]' and trashed = false`);
    if (search.hasNext()) return search.next().getId();
  }
  
  // 검색 실패 시 이름으로 찾거나 생성
  const folders = root.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next().getId();
  else return root.createFolder(folderName).getId();
}

function createRes(status, body) {
  return ContentService.createTextOutput(JSON.stringify({status: status, body: body})).setMimeType(ContentService.MimeType.JSON);
}
