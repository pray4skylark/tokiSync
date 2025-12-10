// =======================================================
// 🛠 유틸리티 함수
// =======================================================

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
