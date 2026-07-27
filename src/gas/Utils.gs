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
    } else {
      // 3. Reverse Fallback: 순수 제목 실패 시, [ID] prefix 구 형식 검색
      Debug.log(`⚠️ Exact name failed. Trying contains search (legacy [ID] prefix)...`);
      const safeName = folderName.replace(/'/g, "\\'");
      const containsQuery = `'${rootFolderId}' in parents and name contains '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

      const containsRes = DriveAccessService.list(rootFolderId, {
        query: containsQuery,
        fields: "files(id, name)",
        pageSize: 1
      });

      if (containsRes.length > 0) {
        Debug.log(`   ✅ Contains Fallback Found: ${containsRes[0].name} (${containsRes[0].id})`);
        return containsRes[0].id;
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

  if (category) {
    const catFolder = findFolderId(category, rootFolderId);
    if (catFolder) {
      const catSeriesId = findFolderId(folderName, catFolder);
      if (catSeriesId) return catSeriesId;
    }
  }

  if (!createIfMissing) return null;

  Debug.log(`🆕 Creating New Series Folder in Root: ${folderName}`);
  return DriveAccessService.ensureFolder(rootFolderId, folderName);
}

/**
 * [v1.28.2] sourceId 기반 시리즈 폴더 검색.
 * _MergeIndex 아래의 merge fragment에서 series 폴더 ID를 조회합니다.
 * 신 정책 (폴더명에 [ID] prefix 없음) 환경에서도 폴더 탐색 가능.
 *
 * @param {string} rootFolderId - 루트 폴더 ID (GAS config.folderId)
 * @param {string} sourceId - 사이트 시리즈 ID (e.g. "33266")
 * @returns {string|null} 시리즈 폴더 ID 또는 null
 */
function lookupSeriesIdBySourceId(rootFolderId, sourceId) {
  try {
    const mergeFolders = DriveAccessService.list(rootFolderId, {
      query: "name = '_MergeIndex' and mimeType = 'application/vnd.google-apps.folder'",
      fields: "files(id)"
    });
    if (mergeFolders.length === 0) {
      Debug.log(`[IndexLookup] _MergeIndex folder not found under root`);
      return null;
    }

    const mergeFolderId = mergeFolders[0].id;
    const fragName = `_toki_merge_${sourceId}.json`;
    const fragFiles = DriveAccessService.list(mergeFolderId, {
      query: `name = '${fragName}'`,
      fields: "files(id)"
    });
    if (fragFiles.length === 0) {
      Debug.log(`[IndexLookup] Fragment not found: ${fragName}`);
      return null;
    }

    const content = DriveAccessService.getFileContent(fragFiles[0].id);
    const frag = JSON.parse(content);
    const seriesFolderId = frag.id || null;
    Debug.log(`[IndexLookup] Resolved sourceId=${sourceId} → folderId=${seriesFolderId}`);
    return seriesFolderId;
  } catch (e) {
    Debug.error(`[IndexLookup] Failed for sourceId=${sourceId}: ${e.toString()}`);
    return null;
  }
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
