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
    const content = DriveAccessService.getFileContent(cacheFileId);
    return JSON.parse(content);
  } catch (e) {
    console.error(`[View_getBooksByCacheId] Error: ${e.toString()}`);
    throw e;
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

    // 1. Check Cache
    if (!bypassCache) {
      const cacheResults = DriveAccessService.list(seriesId, {
          query: `name = '${CACHE_FILE_NAME}'`,
          fields: "files(id)"
      });
      if (cacheResults.length > 0) {
        try {
          const content = DriveAccessService.getFileContent(cacheResults[0].id);
          const cacheData = JSON.parse(content);
          Debug.log(`[Cache Hit] Series: ${seriesId}`);
          return cacheData;
        } catch (e) {
          console.error("Cache Parse Error, falling back to scan");
        }
      }
    }

    // 2. Full Scan (V3)
    const items = DriveAccessService.list(seriesId, {
        fields: "files(id, name, mimeType, size, modifiedTime, createdTime, webContentLink)"
    });

    const books = [];
    let totalItems = 0;

    const createBook = (item, type) => {
      const name = item.name;
      let number = 0;
      const match = name.match(/(\d+)/);
      if (match) number = parseFloat(match[1]);

      return {
        id: item.id,
        seriesId: seriesId,
        name: name,
        number: number,
        url: "", // webViewLink is not returned by default in list, but we can synthesize it or leave empty for frontend to solve
        size: type === "file" ? parseInt(item.size || 0) : 0,
        media: {
          status: "READY",
          mediaType: type === "file" ? item.mimeType : "application/folder",
        },
        created: item.createdTime || new Date().toISOString(),
        lastModified: item.modifiedTime || new Date().toISOString(),
      };
    };

    const folders = items.filter(f => f.mimeType === "application/vnd.google-apps.folder");
    const files = items.filter(f => f.mimeType !== "application/vnd.google-apps.folder");

    for (const f of folders) {
        if (f.name === "info.json" || f.name === CACHE_FILE_NAME || f.name === INDEX_FILE_NAME) continue;
        books.push(createBook(f, "folder"));
    }

    for (const f of files) {
      totalItems++;
      const name = f.name;
      const mime = f.mimeType;
      const lowerName = name.toLowerCase();

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
    const existingCache = DriveAccessService.list(seriesId, {
        query: `name = '${CACHE_FILE_NAME}'`,
        fields: "files(id)"
    });

    if (existingCache.length > 0) {
        DriveAccessService.updateFileContent(existingCache[0].id, cacheContent);
        if (existingCache.length > 1) {
            for (let i = 1; i < existingCache.length; i++) {
                DriveAccessService.trash(existingCache[i].id);
            }
        }
    } else {
        DriveAccessService.createFile(seriesId, CACHE_FILE_NAME, cacheContent, "application/json");
    }

    console.log(
      `[View_getBooks] Series: ${seriesId}, Items Scanned: ${items.length}, Returned: ${books.length} (Cache Updated)`,
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
    // Fallback to DriveAccessService if API fails (e.g. scope issue)
    console.warn(
      "Drive API Partial Fetch failed, falling back to DriveAccessService: " +
        e,
    );
    const bytes = DriveAccessService.getFileBytes(fileId);

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
