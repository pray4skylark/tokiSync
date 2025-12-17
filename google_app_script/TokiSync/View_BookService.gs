// =======================================================
// 📚 Viewer Book Service (Isolated)
// =======================================================

/**
 * 특정 시리즈(폴더) 내의 책(파일/폴더) 목록을 반환합니다.
 * 파일명에서 숫자 정보를 추출하여 정렬합니다.
 *
 * @param {string} seriesId - 시리즈 폴더 ID
 * @returns {Array<Object>} 책 목록
 */
function View_getBooks(seriesId) {
  try {
    if (!seriesId) throw new Error("Series ID is required");

    const folder = DriveApp.getFolderById(seriesId);
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
      if (f.getName() === "info.json") continue;
      books.push(createBook(f, "folder"));
    }

    while (files.hasNext()) {
      totalFiles++;
      const f = files.next();
      const name = f.getName();
      const mime = f.getMimeType();

      if (name === "info.json" || name === INDEX_FILE_NAME) continue;

      const lowerName = name.toLowerCase();
      if (
        lowerName.endsWith(".cbz") ||
        lowerName.endsWith(".zip") ||
        mime.includes("zip") ||
        mime.includes("archive")
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

    console.log(
      `[View_getBooks] Series: ${seriesId}, Total: ${totalFiles}, Returned: ${books.length}`
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
function View_getFileChunk(fileId, offset, length) {
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  const bytes = blob.getBytes();

  if (offset >= bytes.length) return null;

  const end = Math.min(offset + length, bytes.length);
  const chunk = bytes.slice(offset, end);

  return {
    data: Utilities.base64Encode(chunk),
    hasMore: end < bytes.length,
    totalSize: bytes.length,
    nextOffset: end,
  };
}
