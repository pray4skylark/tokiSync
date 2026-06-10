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
