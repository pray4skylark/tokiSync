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
    const file = DriveApp.getFileById(cacheFileId);
    const content = file.getBlob().getDataAsString();
    return JSON.parse(content);
  } catch (e) {
    console.error(`[View_getBooksByCacheId] Error: ${e.toString()}`);
    throw e; // Let the client handle the fallback
  }
}

/**
 * 특정 시리즈(폴더) 내의 책(파일/폴더) 목록을 반환합니다.
 * - info.json / _toki_cache.json 캐시 처리 추가
 *
 * @param {string} seriesId - 시리즈 폴더 ID
 * @param {boolean} bypassCache - 캐시 무시 여부 (새로고침)
 * @returns {Array<Object>} 책 목록
 */
function View_getBooks(seriesId, bypassCache = false) {
  try {
    if (!seriesId) throw new Error("Series ID is required");

    const CACHE_FILE_NAME = "_toki_cache.json";
    const folder = DriveApp.getFolderById(seriesId);

    // 1. Check Cache
    if (!bypassCache) {
      const cacheFiles = folder.getFilesByName(CACHE_FILE_NAME);
      if (cacheFiles.hasNext()) {
        const cacheFile = cacheFiles.next();
        try {
          const content = cacheFile.getBlob().getDataAsString();
          const cacheData = JSON.parse(content);
          Debug.log(`[Cache Hit] Series: ${seriesId}`);
          return cacheData;
        } catch (e) {
          console.error("Cache Parse Error, falling back to scan");
        }
      }
    }

    // 2. Full Scan (Existing Logic)
    const files = folder.getFiles();
    const folders = folder.getFolders();
    const books = [];
    let totalFiles = 0;

    const createBook = (fileOrFolder, type) => {
      const name = fileOrFolder.getName();
      let number = 0;
      const match = name.match(/(\d+)/);
      if (match) number = parseFloat(match[1]);

      const created = fileOrFolder.getDateCreated();
      const updated = fileOrFolder.getLastUpdated();

      return {
        id: fileOrFolder.getId(),
        seriesId: seriesId,
        name: name,
        number: number,
        url: fileOrFolder.getUrl(),
        size: type === "file" ? fileOrFolder.getSize() : 0,
        media: {
          status: "READY",
          mediaType:
            type === "file" ? fileOrFolder.getMimeType() : "application/folder",
        },
        created: created ? created.toISOString() : new Date().toISOString(),
        lastModified: updated
          ? updated.toISOString()
          : new Date().toISOString(),
      };
    };

    while (folders.hasNext()) {
      const f = folders.next();
      if (f.getName() === "info.json" || f.getName() === CACHE_FILE_NAME)
        continue;
      books.push(createBook(f, "folder"));
    }

    while (files.hasNext()) {
      totalFiles++;
      const f = files.next();
      const name = f.getName();
      const mime = f.getMimeType();
      const lowerName = name.toLowerCase();

      // Filter: System Files & Images
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
        books.push(createBook(f, "file"));
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
    const existingCache = folder.getFilesByName(CACHE_FILE_NAME);
    if (existingCache.hasNext()) {
      existingCache.next().setContent(cacheContent);
      while (existingCache.hasNext()) existingCache.next().setTrashed(true);
    } else {
      folder.createFile(CACHE_FILE_NAME, cacheContent, MimeType.PLAIN_TEXT);
    }

    console.log(
      `[View_getBooks] Series: ${seriesId}, Total: ${totalFiles}, Returned: ${books.length} (Cache Updated)`,
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
    // Fallback to DriveApp if API fails (e.g. scope issue) - Optional but Risky for memory
    console.warn(
      "Drive API Partial Fetch failed, falling back to DriveApp (High Memory Risk): " +
        e,
    );
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const bytes = blob.getBytes();

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
