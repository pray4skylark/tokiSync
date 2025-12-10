// =======================================================
// 📚 회차 (Books) 서비스
// =======================================================

function getBooks(seriesId) {
  try {
    if (!seriesId) throw new Error("Series ID is required");
    
    const folder = DriveApp.getFolderById(seriesId);
    const files = folder.getFiles();
    const folders = folder.getFolders();
    const books = [];
    
    let totalFiles = 0;
    
    // Helper to create Book DTO
    const createBook = (fileOrFolder, type) => {
      const name = fileOrFolder.getName();
      // 번호 파싱 (파일명의 첫 숫자)
      let number = 0;
      const match = name.match(/(\d+)/);
      if(match) number = parseFloat(match[1]);

      const created = fileOrFolder.getDateCreated();
      const updated = fileOrFolder.getLastUpdated();

      return {
        id: fileOrFolder.getId(),
        seriesId: seriesId,
        name: name,
        number: number,
        url: fileOrFolder.getUrl(),
        size: type === 'file' ? fileOrFolder.getSize() : 0,
        media: { 
          status: 'READY', 
          mediaType: type === 'file' ? fileOrFolder.getMimeType() : 'application/folder' 
        },
        // [FIX] Convert Dates to ISO Strings for safe serialization
        created: created ? created.toISOString() : new Date().toISOString(),
        lastModified: updated ? updated.toISOString() : new Date().toISOString()
      };
    };

    // 1. 폴더 (일반 회차)
    while (folders.hasNext()) {
      const f = folders.next();
      if (f.getName() === "info.json") continue;
      books.push(createBook(f, 'folder'));
    }

    // 2. 파일 (.cbz, .zip 등)
    while (files.hasNext()) {
      totalFiles++;
      const f = files.next();
      const name = f.getName();
      const mime = f.getMimeType();
      
      if (name === "info.json" || name === INDEX_FILE_NAME) continue;

      const lowerName = name.toLowerCase();
      if (lowerName.endsWith('.cbz') || lowerName.endsWith('.zip') || mime.includes('zip') || mime.includes('archive')) {
         books.push(createBook(f, 'file'));
      }
    }

    // 정렬 (회차 번호 순, 번호 없으면 이름 순)
    books.sort((a, b) => {
        const numA = a.number || 0;
        const numB = b.number || 0;
        if (numA === numB) {
            return a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'});
        }
        return numA - numB;
    });

    console.log(`[getBooks] Series: ${seriesId}, Total: ${totalFiles}, Returned: ${books.length}`);
    return books;

  } catch (e) {
    console.error(`[getBooks] Error: ${e.toString()}`);
    throw e; // 클라이언트로 에러 전파
  }
}

// =======================================================
// 📦 파일 청크 다운로드 (50MB 제한 우회)
// =======================================================
function getFileChunk(fileId, offset, length) {
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  
  // 범위 체크
  if (offset >= bytes.length) return null;
  
  const end = Math.min(offset + length, bytes.length);
  const chunk = bytes.slice(offset, end);
  
  return {
    data: Utilities.base64Encode(chunk),
    hasMore: end < bytes.length,
    totalSize: bytes.length,
    nextOffset: end
  };
}
