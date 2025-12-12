// =======================================================
// 🛠 유틸리티 함수
// =======================================================

function findFolderId(folderName, rootFolderId) {
  // 1. [ID] 포함된 폴더 검색 (제목 변경 대응 및 정확성 향상)
  const idMatch = folderName.match(/^\[(\d+)\]/);

  let query = "";
  if (idMatch) {
    // [ID]가 포함된 폴더 검색
    query = `'${rootFolderId}' in parents and name contains '[${idMatch[1]}]' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  } else {
    // 정확한 이름 검색
    // escape single quotes in folderName
    const safeName = folderName.replace(/'/g, "\\'");
    query = `'${rootFolderId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  }

  console.log(`🔍 findFolderId for: "${folderName}" (Root: ${rootFolderId})`);
  if (idMatch) console.log(`   -> Detected ID: [${idMatch[1]}]`);
  console.log(`   -> Primary Query: ${query}`);

  try {
    const response = Drive.Files.list({
      q: query,
      fields: "files(id, name)",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (response.files && response.files.length > 0) {
      console.log(
        `✅ Primary Found: ${response.files[0].name} (${response.files[0].id})`
      );
      return response.files[0].id;
    }

    // 2. Fallback: ID 검색 실패 시, 제목만으로(Exact Name) 재검색 (Legacy 지원)
    if (idMatch) {
      console.log(`⚠️ Primary search failed. Trying fallback (Exact Name)...`);
      const titleOnly = folderName.replace(idMatch[0], "").trim();
      const safeTitle = titleOnly.replace(/'/g, "\\'");
      const fallbackQuery = `'${rootFolderId}' in parents and name = '${safeTitle}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

      console.log(`🔎 Fallback Query: ${fallbackQuery}`);
      const fallbackRes = Drive.Files.list({
        q: fallbackQuery,
        fields: "files(id, name)",
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      if (fallbackRes.files && fallbackRes.files.length > 0) {
        console.log(
          `✅ Fallback Found: ${fallbackRes.files[0].name} (${fallbackRes.files[0].id})`
        );
        return fallbackRes.files[0].id;
      } else {
        console.warn(`❌ Fallback also failed.`);
      }
    }
  } catch (e) {
    console.error("Advanced Search Failed:", e);
    // Fallback (필요시) - DriveApp은 느리므로 여기선 생략하거나 Retry 로직 추가 가능
  }

  return null;
}

function createRes(status, body, debugLogs = null) {
  const payload = { status: status, body: body };
  if (debugLogs) payload.debugLogs = debugLogs; // 로그가 있으면 포함

  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// 권한 승인용 더미 함수
function authorizeCheck() {
  DriveApp.getRootFolder();
  UrlFetchApp.fetch("https://www.google.com");
  console.log("✅ 권한 승인 완료!");
}
