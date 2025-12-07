// =====================================================
// 📊 TokiView Dashboard v1.0.0
// ⚙️ 설정 (스크립트 속성 사용 권장)
// =====================================================
// [1. 설정 및 상수] ==========================================================
// 배포 방식 변경(Execute as User)에 따라 ROOT_FOLDER_ID는 이제 사용자별로 설정됩니다.
const INDEX_FILE_NAME = "library_index.json";

// =====================================================
// 🖥️ [GET] 대시보드 페이지 로드 (CSR 방식)
// =====================================================
function doGet(e) {
  // 서버에서는 더 이상 데이터를 미리 로드하지 않음 (Stateless)
  // 클라이언트가 localStorage 또는 스크립트 주입을 통해 ID를 확보하고 요청해야 함
  const template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
      .setTitle('TokiView v3.0-BETA3')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =======================================================
// 🚀 라이브러리 (Series 목록) 가져오기
// =======================================================
function getSeriesList(folderId) {
  if (!folderId) throw new Error("Folder ID is required");

  // 1. 캐시 확인
  const root = DriveApp.getFolderById(folderId);
  const files = root.getFilesByName(INDEX_FILE_NAME);
  
  if (files.hasNext()) {
    const file = files.next();
    const content = file.getBlob().getDataAsString();
    if (content && content.trim() !== "") {
      try { return JSON.parse(content); } catch (e) {}
    }
  }

  // 2. 없으면 재구축
  return rebuildLibraryIndex(folderId);
}

// =======================================================
// 🔄 전체 폴더 스캔 (Series DTO 생성)
// =======================================================
function rebuildLibraryIndex(folderId) {
  if (!folderId) throw new Error("Folder ID is required");
  
  const root = DriveApp.getFolderById(folderId);
  const seriesFolders = root.getFolders();
  const seriesList = [];

  while (seriesFolders.hasNext()) {
    try {
      const folder = seriesFolders.next();
      const folderName = folder.getName();
      
      // index 파일 폴더 제외
      if (folderName === INDEX_FILE_NAME) continue;

      // 1. 기본 메타데이터 파싱
      let metadata = { status: 'ONGOING', authors: [], summary: '' };
      let seriesName = folderName;
      let thumbnail = '';
      let sourceId = ''; // [ID] from folder name

      // ID 파싱 (폴더명 기준)
      const idMatch = folderName.match(/^\[(\d+)\]/);
      if (idMatch) sourceId = idMatch[1];
      
      // info.json 읽기
      const infoFiles = folder.getFilesByName('info.json');
      if (infoFiles.hasNext()) {
        try {
          const jsonContent = infoFiles.next().getBlob().getDataAsString();
          const parsed = JSON.parse(jsonContent);
          
          if(parsed.title) seriesName = parsed.title;
          
          if (parsed.metadata) {
             // New Format
             if(parsed.metadata.authors) metadata.authors = parsed.metadata.authors;
             if(parsed.metadata.status) metadata.status = parsed.metadata.status;
          } else {
             // Legacy Format
             if(parsed.author) metadata.authors = [parsed.author];
             if(parsed.status) metadata.status = parsed.status;
          }
          
          if(parsed.thumbnail) thumbnail = parsed.thumbnail;
          if(parsed.id) sourceId = parsed.id; // info.json 우선
          
        } catch (e) {}
      } else {
        // 폴더명 파싱: [ID] 제목 (이미 위에서 ID는 땄음)
        const match = folderName.match(/^\[(\d+)\]\s*(.+)/);
        if (match) { 
           seriesName = match[2];
        }
      }

      // 2. Books Count (간이 계산)
      let booksCount = 0;
      // ... (생략)

      // Series DTO 생성
      const series = {
        id: folder.getId(),
        sourceId: sourceId,
        name: seriesName,
        booksCount: booksCount, // 추후 정확한 로직 필요
        booksCountCurrent: 0,   // 읽은 수 등 (구현 예정)
        metadata: metadata,
        thumbnail: thumbnail,
        url: folder.getUrl(),
        created: folder.getDateCreated(),
        lastModified: folder.getLastUpdated()
      };

      seriesList.push(series);

    } catch (e) {
      Logger.log("Error processing folder: " + e);
    }
  }
  
  // 정렬 (최신 수정순)
  seriesList.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

  // 캐시 저장
  const jsonString = JSON.stringify(seriesList);
  const indexFiles = root.getFilesByName(INDEX_FILE_NAME);
  if (indexFiles.hasNext()) {
    indexFiles.next().setContent(jsonString);
  } else {
    root.createFile(INDEX_FILE_NAME, jsonString, MimeType.PLAIN_TEXT);
  }
  
  return seriesList;
}

// 권한 승인용
function authorizeCheck() {
  DriveApp.getRootFolder();
  console.log("✅ 권한 승인 완료!");
}

// =======================================================
// 📚 회차 (Books) 가져오기
// =======================================================
function getBooks(seriesId) {
  if (!seriesId) throw new Error("Series ID is required");
  
  const folder = DriveApp.getFolderById(seriesId);
  const files = folder.getFiles();
  const folders = folder.getFolders();
  const books = [];

  // Helper to create Book DTO
  const createBook = (fileOrFolder, type) => {
    const name = fileOrFolder.getName();
    // 번호 파싱 (파일명의 첫 숫자)
    let number = 0;
    const match = name.match(/(\d+)/);
    if(match) number = parseFloat(match[1]);

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
      created: fileOrFolder.getDateCreated(),
      lastModified: fileOrFolder.getLastUpdated()
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
    const f = files.next();
    const name = f.getName();
    const mime = f.getMimeType();
    
    if (name === "info.json" || name === INDEX_FILE_NAME) continue;

    if (name.endsWith('.cbz') || name.endsWith('.zip') || mime.includes('zip') || mime.includes('archive')) {
       books.push(createBook(f, 'file'));
    }
  }

  // 정렬 (회차 번호 순)
  books.sort((a, b) => a.number - b.number);

  return books;
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