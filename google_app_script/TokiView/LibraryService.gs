// =======================================================
// 🚀 라이브러리 (Series 목록) 서비스
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
      let booksCount = 0; // [FIX] 회차 수
      let booksCountDefined = false; // [FIX] info.json에서 count 읽었는지 여부

      // ID 파싱 (폴더명 기준)
      const idMatch = folderName.match(/^\[(\d+)\]/);
      if (idMatch) sourceId = idMatch[1];
      
      // info.json 읽기
      const infoFiles = folder.getFilesByName('info.json');
      let infoParsed = false;

      if (infoFiles.hasNext()) {
        try {
          const jsonContent = infoFiles.next().getBlob().getDataAsString();
          const parsed = JSON.parse(jsonContent);
          infoParsed = true;
          
          if(parsed.title) seriesName = parsed.title;
          
          if (parsed.metadata) {
             if(parsed.metadata.authors) metadata.authors = parsed.metadata.authors;
             if(parsed.metadata.status) metadata.status = parsed.metadata.status;
          } else {
             if(parsed.author) metadata.authors = [parsed.author];
             if(parsed.status) metadata.status = parsed.status;
          }
          
          if(parsed.thumbnail) thumbnail = parsed.thumbnail;
          if(parsed.id) sourceId = parsed.id;
          
          // [FIX] Read book count safely
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

      // [FIX] Fallback: info.json 없거나 count가 'undefined'이면 수동 스캔 (느리지만 정확)
      // count가 0이어도 info.json에 명시되어 있으면 신뢰하고 스캔 생략 (Timeout 방지)
      if (!booksCountDefined) {
         try {
             // 500개 이상이면 Timeout 위험 있으므로 제한 (Optional)
             // 여기서는 단순히 스캔
             const files = folder.getFiles();
             while(files.hasNext()) {
                 const f = files.next();
                 const name = f.getName();
                 if(name === 'info.json' || name === INDEX_FILE_NAME) continue;
                 if(name.endsWith('.cbz') || name.endsWith('.zip')) booksCount++;
             }
             const subFolders = folder.getFolders();
             while(subFolders.hasNext()) {
                 if(subFolders.next().getName() !== 'info.json') booksCount++;
             }
         } catch(e) {}
      }

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
