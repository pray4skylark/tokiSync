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
function View_rebuildLibraryIndex(folderId) {
  if (!folderId) throw new Error("Folder ID is required");

  const root = DriveApp.getFolderById(folderId);
  const seriesFolders = root.getFolders();
  const seriesList = [];

  while (seriesFolders.hasNext()) {
    try {
      const folder = seriesFolders.next();
      const folderName = folder.getName();

      if (folderName === INDEX_FILE_NAME) continue;

      let metadata = { status: "ONGOING", authors: [], summary: "" };
      let seriesName = folderName;
      let thumbnail = "";
      let sourceId = "";
      let booksCount = 0;
      let booksCountDefined = false;

      const idMatch = folderName.match(/^\[(\d+)\]/);
      if (idMatch) sourceId = idMatch[1];

      const infoFiles = folder.getFilesByName("info.json");

      if (infoFiles.hasNext()) {
        try {
          const jsonContent = infoFiles.next().getBlob().getDataAsString();
          const parsed = JSON.parse(jsonContent);

          if (parsed.title) seriesName = parsed.title;

          if (parsed.metadata) {
            if (parsed.metadata.authors)
              metadata.authors = parsed.metadata.authors;
            if (parsed.metadata.status)
              metadata.status = parsed.metadata.status;
          } else {
            if (parsed.author) metadata.authors = [parsed.author];
            if (parsed.status) metadata.status = parsed.status;
          }

          if (parsed.thumbnail) thumbnail = parsed.thumbnail;
          if (parsed.id) sourceId = parsed.id;

          if (parsed.file_count !== undefined && parsed.file_count !== null) {
            booksCount = parsed.file_count;
            booksCountDefined = true;
          }
        } catch (e) {}
      } else {
        const match = folderName.match(/^\[(\d+)\]\s*(.+)/);
        if (match) {
          seriesName = match[2];
        }
      }

      if (!booksCountDefined) {
        try {
          const files = folder.getFiles();
          while (files.hasNext()) {
            const f = files.next();
            const name = f.getName();
            if (name === "info.json" || name === INDEX_FILE_NAME) continue;
            if (name.endsWith(".cbz") || name.endsWith(".zip")) booksCount++;
          }
          const subFolders = folder.getFolders();
          while (subFolders.hasNext()) {
            if (subFolders.next().getName() !== "info.json") booksCount++;
          }
        } catch (e) {}
      }

      const series = {
        id: folder.getId(),
        sourceId: sourceId,
        name: seriesName,
        booksCount: booksCount,
        booksCountCurrent: 0,
        metadata: metadata,
        thumbnail: thumbnail,
        url: folder.getUrl(),
        created: folder.getDateCreated(),
        lastModified: folder.getLastUpdated(),
      };

      seriesList.push(series);
    } catch (e) {
      console.log("Error processing folder: " + e);
    }
  }

  seriesList.sort(
    (a, b) => new Date(b.lastModified) - new Date(a.lastModified)
  );

  const jsonString = JSON.stringify(seriesList);
  const indexFiles = root.getFilesByName(INDEX_FILE_NAME);
  if (indexFiles.hasNext()) {
    indexFiles.next().setContent(jsonString);
  } else {
    root.createFile(INDEX_FILE_NAME, jsonString, MimeType.PLAIN_TEXT);
  }

  return seriesList;
}
