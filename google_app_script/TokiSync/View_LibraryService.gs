// =======================================================
// 🚀 Viewer Library Service (Isolated)
// =======================================================

/**
 * 해당 폴더(Libraries)의 시리즈 목록을 반환합니다.
 * 성능을 위해 `index.json` 캐시 파일을 우선 확인하고, 없으면 재구축합니다.
 *
 * @param {string} folderId - 라이브러리 루트 폴더 ID
 * @returns {Array<Object>} 시리즈 목록 (JSON)
 */
function View_getSeriesList(folderId) {
  if (!folderId) throw new Error("Folder ID is required");

  // 1. Check Cache
  const root = DriveApp.getFolderById(folderId);
  const files = root.getFilesByName(INDEX_FILE_NAME);

  if (files.hasNext()) {
    const file = files.next();
    const content = file.getBlob().getDataAsString();
    if (content && content.trim() !== "") {
      try {
        return JSON.parse(content);
      } catch (e) {}
    }
  }

  // 2. Rebuild if missing
  return View_rebuildLibraryIndex(folderId);
}

/**
 * 라이브러리 폴더 구조를 스캔하여 인덱스(시리즈 목록)를 생성합니다.
 * `info.json` 메타데이터를 우선순위로 하며, 폴더명 파싱도 지원합니다.
 * 생성된 인덱스는 `index.json` 파일로 저장됩니다.
 *
 * @param {string} folderId - 라이브러리 루트 폴더 ID
 * @returns {Array<Object>} 생성된 시리즈 목록
 */
/**
 * 라이브러리 폴더 구조를 스캔하여 인덱스(시리즈 목록)를 생성합니다.
 * Root > Category > Series 구조와 Legacy(Root > Series) 구조를 모두 지원합니다.
 */
function View_rebuildLibraryIndex(folderId) {
  if (!folderId) throw new Error("Folder ID is required");

  const root = DriveApp.getFolderById(folderId);
  const folders = root.getFolders();
  const seriesList = [];

  // Known Categories
  const CATEGORIES = ["Webtoon", "Novel"];

  while (folders.hasNext()) {
    const folder = folders.next();
    const name = folder.getName();

    if (name === INDEX_FILE_NAME) continue;

    // 1. Check if it's a Category Folder
    if (CATEGORIES.includes(name)) {
      const subFolders = folder.getFolders();
      while (subFolders.hasNext()) {
        try {
          const s = processSeriesFolder(subFolders.next(), name);
          if (s) seriesList.push(s);
        } catch (e) {
          Debug.log(`Error processing series in ${name}: ${e}`);
        }
      }
    }
    // 2. Otherwise/Fallback: Treat as Legacy Series in Root
    else {
      try {
        // Simple check: does it look like a series? (Has [ID] or info.json)
        // We do a full process check, if valid it returns object, else null/partial
        // But for performance, maybe check name pattern first?
        // [ID] pattern is strong indicator.
        if (name.match(/^\[(\d+)\]/)) {
          const s = processSeriesFolder(folder, "Uncategorized");
          if (s) seriesList.push(s);
        }
      } catch (e) {
        Debug.log(`Error processing legacy series: ${e}`);
      }
    }
  }

  seriesList.sort(
    (a, b) => new Date(b.lastModified) - new Date(a.lastModified)
  ); // Sort by Recent

  // Save Lightweight Index
  const jsonString = JSON.stringify(seriesList);
  const indexFiles = root.getFilesByName(INDEX_FILE_NAME);
  if (indexFiles.hasNext()) {
    indexFiles.next().setContent(jsonString);
  } else {
    root.createFile(INDEX_FILE_NAME, jsonString, MimeType.PLAIN_TEXT);
  }

  return seriesList;
}

/**
 * [Helper] 단일 시리즈 폴더를 처리하여 메타데이터 객체를 반환합니다.
 */
function processSeriesFolder(folder, categoryContext) {
  const folderName = folder.getName();
  let metadata = {
    status: "ONGOING",
    authors: [],
    summary: "",
    category: categoryContext,
  };
  let seriesName = folderName;
  let thumbnailId = ""; // Optimized: Use File ID instead of Base64
  let thumbnailOld = ""; // Fallback
  let sourceId = "";
  let booksCount = 0;

  // ID Parsing
  const idMatch = folderName.match(/^\[(\d+)\]/);
  if (idMatch) sourceId = idMatch[1];

  // 1. Check for 'cover.jpg' (Preferred)
  const coverFiles = folder.getFilesByName("cover.jpg");
  if (coverFiles.hasNext()) {
    thumbnailId = coverFiles.next().getId();
  }

  // 2. Parse info.json
  const infoFiles = folder.getFilesByName("info.json");
  if (infoFiles.hasNext()) {
    try {
      // To optimize scan time, we might skip parsing if we already have cover.jpg and just need name?
      // But we need total count etc.
      const content = infoFiles.next().getBlob().getDataAsString();
      const parsed = JSON.parse(content);

      if (parsed.title) seriesName = parsed.title;
      if (parsed.id) sourceId = parsed.id;
      if (parsed.file_count) booksCount = parsed.file_count;

      // Metadata overrides
      if (parsed.category) metadata.category = parsed.category;
      if (parsed.status) metadata.status = parsed.status;
      if (parsed.metadata && parsed.metadata.authors)
        metadata.authors = parsed.metadata.authors;
      else if (parsed.author) metadata.authors = [parsed.author];

      // Fallback Thumbnail (URL or Base64 - avoid Base64 if possible in Index)
      // If thumbnailId is empty, we might check parsed.thumbnail
      // But we want to Avoid Base64.
      if (!thumbnailId && parsed.thumbnail) {
        if (parsed.thumbnail.startsWith("http"))
          thumbnailOld = parsed.thumbnail;
        // parsed.thumbnail might be base64. If so, ignore for index size optimization?
        // Or keep it? The user wanted optimization.
        // Let's Skip Base64 in Index. Only allow http links.
      }
    } catch (e) {}
  } else {
    // Fallback Name Parsing
    const match = folderName.match(/^\[(\d+)\]\s*(.+)/);
    if (match) seriesName = match[2];
  }

  // 3. Count Books (if not in info.json)
  if (booksCount === 0) {
    // Fast approximation? Or accurate scan?
    // Accurate scan is slow. Let's try to trust info.json or just check file (slow).
    // For optimization, trusting info.json is best.
    // If 0, maybe just leave it 0 or do a quick check?
    // Let's do a quick iterator check but limit it? No, explicit scan.
    /* 
        const files = folder.getFiles();
        while(files.hasNext()) {
            if (files.next().getMimeType() === MimeType.ZIP || files.next().getName().endsWith('.cbz')) booksCount++;
        }
        */
    // Skip for performance unless critical.
  }

  return {
    id: folder.getId(),
    sourceId: sourceId,
    name: seriesName,
    booksCount: booksCount,
    metadata: metadata,
    thumbnailId: thumbnailId, // NEW
    thumbnail: thumbnailOld, // Legacy/External URL
    hasCover: !!thumbnailId,
    lastModified: folder.getLastUpdated(),
    category: metadata.category, // Top level access
  };
}
