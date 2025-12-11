// =======================================================
// 📂 동기화 및 라이브러리 서비스
// =======================================================

// 기능: 다운로드 기록 확인 (폴더/파일 스캔)
// 기능: 다운로드 기록 확인 (폴더/파일 스캔) - [Optimized]
function checkDownloadHistory(data, rootFolderId) {
  Debug.log(`🔍 checkDownloadHistory Start. Target: ${data.folderName}`);

  const folderId = findFolderId(data.folderName, rootFolderId);

  if (!folderId) {
    Debug.log("⚠️ Folder not found.");
    return createRes("success", [], Debug.getLogs()); // 로그 포함 반환
  }
  Debug.log(`✅ Folder Found: ${folderId}`);

  // 🚀 Optimization: Drive Advanced Service (Drive.Files.list)
  // 기존 DriveApp 반복문보다 훨씬 빠름 (Batch Fetch)
  let pageToken = null;
  const existingEpisodes = [];
  let fetchCount = 0;

  try {
    do {
      Debug.log(`☁️ Fetching file list (Page: ${fetchCount + 1})...`);
      const response = Drive.Files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(name)",
        pageSize: 1000, // 최대 1000개씩 가져옴
        pageToken: pageToken,
      });

      if (response.files) {
        Debug.log(`   -> Retrieved ${response.files.length} files.`);
        response.files.forEach((file) => {
          const match = file.name.match(/^(\d+)/);
          if (match) existingEpisodes.push(parseInt(match[1]));
        });
      }
      pageToken = response.nextPageToken;
      fetchCount++;
    } while (pageToken);

    Debug.log(`🎉 Scan Complete. Found ${existingEpisodes.length} episodes.`);
  } catch (e) {
    Debug.error("❌ Drive Scan Failed", e);
    // 에러 발생 시에도 빈 배열보다는 현재까지 찾은거라도 줄 수 있지만, 안전하게 에러 리턴
    // 또는, 로그를 포함해서 성공으로 처리하되 빈 배열 (디버깅용)
    return createRes("error", `Scan Error: ${e.message}`, Debug.getLogs());
  }

  // 중복 제거 및 정렬
  const uniqueEpisodes = [...new Set(existingEpisodes)].sort((a, b) => a - b);

  return createRes("success", uniqueEpisodes, Debug.getLogs()); // 성공 시에도 로그 반환 (필요시)
}

// 기능: 작품 정보(info.json) 저장
function saveSeriesInfo(data, rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  let seriesFolder;

  const folderId = findFolderId(data.folderName, rootFolderId);
  if (folderId) {
    seriesFolder = DriveApp.getFolderById(folderId);
  } else {
    seriesFolder = root.createFolder(data.folderName);
  }

  const fileName = "info.json";
  const files = seriesFolder.getFilesByName(fileName);

  const infoData = {
    id: data.id,
    title: data.title,
    metadata: {
      authors: [data.author || "Unknown"],
      status: data.status || "Unknown",
      category: data.category || "Unknown",
      publisher: data.site || "",
    },
    thumbnail: data.thumbnail || "",
    url: data.url,

    // Legacy / Convenience fields
    author: data.author || "Unknown", // for backward compat if needed during migration
    last_episode: data.last_episode || 0,
    file_count: data.file_count || 0,
    last_updated: new Date().toISOString(),
  };

  const jsonString = JSON.stringify(infoData, null, 2);

  if (files.hasNext()) {
    files.next().setContent(jsonString);
  } else {
    seriesFolder.createFile(fileName, jsonString, MimeType.PLAIN_TEXT);
  }

  return createRes("success", "Info saved");
}

// 기능: 라이브러리 인덱스 조회 (TokiView 캐시 공유)
function getLibraryIndex(rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  const files = root.getFilesByName("library_index.json");

  if (files.hasNext()) {
    const content = files.next().getBlob().getDataAsString();
    try {
      return createRes("success", JSON.parse(content));
    } catch (e) {
      return createRes("success", []);
    }
  }
  return createRes("success", []); // 파일 없으면 빈 배열
}

// 기능: 라이브러리 상태 업데이트 (클라이언트 결과 저장)
function updateLibraryStatus(data, rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  const files = root.getFilesByName("library_index.json");

  if (!files.hasNext()) return createRes("error", "Index not found");

  const file = files.next();
  let library = [];
  try {
    library = JSON.parse(file.getBlob().getDataAsString());
    if (!Array.isArray(library)) library = [];
  } catch (e) {
    return createRes("error", "Invalid JSON");
  }

  // 업데이트 반영
  const updates = data.updates;
  let changedCount = 0;

  updates.forEach((u) => {
    const item = library.find((i) => i.id === u.id);
    if (item) {
      item.latest_episode_in_site = u.latestEpisode;
      item.last_checked_at = new Date().toISOString();
      changedCount++;
    }
  });

  if (changedCount > 0) {
    file.setContent(JSON.stringify(library));
  }

  return createRes("success", `Updated ${changedCount} items`);
}
