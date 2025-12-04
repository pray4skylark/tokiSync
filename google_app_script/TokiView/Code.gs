// =====================================================
// 📊 TokiView Dashboard v1.0.0
// ⚙️ 설정 (스크립트 속성 사용 권장)
// =====================================================
// [1. 설정 및 상수] ==========================================================
// 배포 방식 변경(Execute as User)에 따라 ROOT_FOLDER_ID는 이제 사용자별로 설정됩니다.
const INDEX_FILE_NAME = "library_index.json";

/**
 * 사용자 설정(폴더 ID)을 저장합니다.
 * 클라이언트(Index.html)에서 google.script.run.saveUserConfig(id)로 호출합니다.
 */
function saveUserConfig(folderId) {
  const userProps = PropertiesService.getUserProperties();
  userProps.setProperty('ROOT_FOLDER_ID', folderId);
  return { success: true };
}

/**
 * 사용자 설정을 가져옵니다.
 */
function getUserConfig() {
  const userProps = PropertiesService.getUserProperties();
  return {
    rootFolderId: userProps.getProperty('ROOT_FOLDER_ID')
  };
}
// =====================================================

// 🖥️ [GET] 대시보드 페이지 로드 (SSR 적용)
// 🖥️ [GET] 대시보드 페이지 로드 (SSR 적용)
function doGet(e) {
  const config = getUserConfig();
  
  // 폴더 ID가 설정되지 않은 경우, 설정이 필요함을 클라이언트에 알림
  const initialData = {
    needsConfig: !config.rootFolderId,
    library: []
  };

  if (config.rootFolderId) {
    try {
      // 설정이 있다면 라이브러리 데이터를 로드
      initialData.library = getLibraryData(config.rootFolderId);
    } catch (err) {
      // 폴더 ID가 잘못되었거나 접근 권한이 없는 경우
      initialData.error = "폴더에 접근할 수 없습니다. ID를 확인해주세요.";
      initialData.needsConfig = true;
      Logger.log("Dashboard Load Error: " + err);
    }
  }

  const template = HtmlService.createTemplateFromFile('Index');
  template.initialData = JSON.stringify(initialData);
  
  return template.evaluate()
      .setTitle('TokiView v3.0')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =======================================================
// 🚀 라이브러리 데이터 가져오기 (캐시 우선)
// =======================================================
function getLibraryData(folderId) {
  const root = DriveApp.getFolderById(folderId);
  const files = root.getFilesByName(INDEX_FILE_NAME);
  
  if (files.hasNext()) {
    // 캐시 파일이 있으면 읽어서 반환 (Fast)
    const file = files.next();
    const content = file.getBlob().getDataAsString();
    
    if (!content || content.trim() === "") return rebuildLibraryIndex(folderId);
    
    try { 
      return JSON.parse(content); 
    } catch (e) { 
      return rebuildLibraryIndex(folderId); 
    }
  } else {
    // 없으면 전체 스캔 (Slow)
    return rebuildLibraryIndex(folderId);
  }
}

// =======================================================
// 🔄 전체 폴더 스캔 및 캐시 생성 (갱신용)
// =======================================================
function rebuildLibraryIndex(folderId) {
  const root = DriveApp.getFolderById(folderId);
  const seriesFolders = root.getFolders();
  const library = [];

  while (seriesFolders.hasNext()) {
    const folder = seriesFolders.next();
    const folderName = folder.getName();
    
    let info = { 
      id: '', title: folderName, author: '미상', category: '기타', 
      status: '', thumbnail: '', url: '', last_updated: ''
    };

    // info.json 읽기
    const infoFiles = folder.getFilesByName('info.json');
    if (infoFiles.hasNext()) {
      try {
        const jsonContent = infoFiles.next().getBlob().getDataAsString();
        const parsed = JSON.parse(jsonContent);
        info = { ...info, ...parsed };
      } catch (e) {}
    } else {
      const match = folderName.match(/^\[(\d+)\]\s*(.+)/);
      if (match) { info.id = match[1]; info.title = match[2]; }
    }

    // 회차 카운트
    let maxEpisode = 0;
    let fileCount = 0;

    // ⚡️ 최적화: info.json에 데이터가 있으면 파일 스캔 건너뜀
    if (info.last_episode && info.file_count) {
      maxEpisode = info.last_episode;
      fileCount = info.file_count;
    } else {
      // 데이터가 없으면 직접 스캔 (느림)
      const files = folder.getFiles();
      while(files.hasNext()) {
         const f = files.next();
         if(f.getName() === 'info.json') continue;
         const match = f.getName().match(/^(\d+)/);
         if(match) {
           const n = parseInt(match[1]);
           if(n > maxEpisode) maxEpisode = n;
           fileCount++;
         }
      }
      
      const subFolders = folder.getFolders();
      while(subFolders.hasNext()) {
         const sub = subFolders.next();
         const match = sub.getName().match(/^(\d+)/);
         if(match) {
           const n = parseInt(match[1]);
           if(n > maxEpisode) maxEpisode = n;
           fileCount++;
         }
      }
    }

    library.push({
      ...info,
      fileCount: fileCount,
      lastEpisode: maxEpisode,
      driveUrl: folder.getUrl()
    });
  }
  
  // 정렬 (최신순)
  library.sort((a, b) => {
     if (a.last_updated && b.last_updated) return new Date(b.last_updated) - new Date(a.last_updated);
     return parseInt(b.id || 0) - parseInt(a.id || 0);
  });

  // 캐시 파일 저장
  const jsonString = JSON.stringify(library);
  const indexFiles = root.getFilesByName(INDEX_FILE_NAME);
  if (indexFiles.hasNext()) {
    indexFiles.next().setContent(jsonString);
  } else {
    root.createFile(INDEX_FILE_NAME, jsonString, MimeType.PLAIN_TEXT);
  }
  
  return library;
}

// 권한 승인용
function authorizeCheck() {
  DriveApp.getRootFolder();
  console.log("✅ 권한 승인 완료!");
}