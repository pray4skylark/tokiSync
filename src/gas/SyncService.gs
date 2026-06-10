// =======================================================
// 📂 동기화 및 라이브러리 서비스
// =======================================================

// 기능: 다운로드 기록 확인 (폴더/파일 스캔)
// 기능: 다운로드 기록 확인 (폴더/파일 스캔)
function checkDownloadHistory(data, rootFolderId) {
  Debug.log(`🚀 checkDownloadHistory Start`);
  // Use Helper with Category support (Create=false)
  const folderId = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    false,
  );

  if (!folderId) {
    Debug.log(`❌ Folder not found in Root or Category: ${data.folderName}`);
    return createRes("success", [], Debug.getLogs());
  }

  Debug.log(`📂 Scanning Files in: ${folderId}`);
  const existingEpisodes = [];

  try {
    const files = DriveAccessService.list(folderId, {
      fields: "files(name)"
    });

    files.forEach((file) => {
      const match = file.name.match(/^(\d+)/);
      if (match) existingEpisodes.push(parseInt(match[1]));
    });

    Debug.log(`🎉 Scan Complete. Found ${existingEpisodes.length} episodes.`);
  } catch (e) {
    Debug.error("❌ Drive Scan Failed (Advanced)", e);
    return createRes("error", `Scan Error: ${e.message}`, Debug.getLogs());
  }

  // 중복 제거 및 정렬
  const uniqueEpisodes = [...new Set(existingEpisodes)].sort((a, b) => a - b);
  Debug.log(`✅ Total Unique Episodes: ${uniqueEpisodes.length}`);

  return createRes("success", uniqueEpisodes, Debug.getLogs());
}

// 기능: 작품 정보(info.json) 저장
function saveSeriesInfo(data, rootFolderId) {
  // Use Helper with Category support (Create=true)
  const folderId = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    true,
  );

  const fileName = "info.json";
  const results = DriveAccessService.list(folderId, {
    query: `name = '${fileName}'`,
    fields: "files(id)"
  });

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
    author: data.author || "Unknown",
    last_episode: data.last_episode || 0,
    file_count: data.file_count || 0,
    last_updated: new Date().toISOString(),
  };

  const jsonString = JSON.stringify(infoData, null, 2);

  if (results.length > 0) {
    DriveAccessService.updateFileContent(results[0].id, jsonString);
    // 중복 파일 제거
    for (let i = 1; i < results.length; i++) {
      DriveAccessService.trash(results[i].id);
    }
  } else {
    DriveAccessService.createFile(folderId, fileName, jsonString, "application/json");
  }

  return createRes("success", "Info saved");
}

// 기능: 라이브러리 인덱스 조회 (TokiView 캐시 공유)
function getLibraryIndex(rootFolderId) {
  const results = DriveAccessService.list(rootFolderId, {
    query: "name = 'index.json'",
    fields: "files(id)"
  });

  if (results.length > 0) {
    const content = DriveAccessService.getFileContent(results[0].id);
    try {
      return createRes("success", JSON.parse(content));
    } catch (e) {
      return createRes("success", []);
    }
  }
  return createRes("success", []);
}

// 기능: 라이브러리 상태 업데이트 (클라이언트 결과 저장)
function updateLibraryStatus(data, rootFolderId) {
  const results = DriveAccessService.list(rootFolderId, {
    query: "name = 'index.json'",
    fields: "files(id)"
  });

  if (results.length === 0) return createRes("error", "Index not found");

  const fileId = results[0].id;
  let library = [];
  try {
    const content = DriveAccessService.getFileContent(fileId);
    library = JSON.parse(content);
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
    DriveAccessService.updateFileContent(fileId, JSON.stringify(library));
    return createRes("success", `Updated ${changedCount} items`);
  }
  return createRes("success", "No changes");
}

// =======================================================
// 📦 마이그레이션 서비스 (Legacy -> v3.1 Structure)
// =======================================================

function migrateLegacyStructure(rootFolderId) {
  const catWebtoonId = DriveAccessService.ensureFolder(rootFolderId, "Webtoon");
  const catNovelId = DriveAccessService.ensureFolder(rootFolderId, "Novel");
  const catMangaId = DriveAccessService.ensureFolder(rootFolderId, "Manga");

  const items = DriveAccessService.list(rootFolderId, {
      fields: "files(id, name, mimeType)"
  });
  const folders = items.filter(f => f.mimeType === "application/vnd.google-apps.folder");
  
  const toMigrate = [];
  const EXT = ["Webtoon", "Novel", "Manga", "Libraries", "System", "_Thumbnails", "_MergeIndex"];

  folders.forEach((folder) => {
    const name = folder.name;
    if (!EXT.includes(name) && name !== "index.json" && name !== "info.json") {
      toMigrate.push(folder);
    }
  });

  let movedCount = 0;
  let fixedThumbnails = 0;

  toMigrate.forEach((folder) => {
    try {
      const folderId = folder.id;
      const folderName = folder.name;
      Debug.log(`🔄 Migrating: ${folderName}`);

      let category = "Webtoon"; // Default

      // 1. Analyze info.json for Category & Thumbnail
      const infoResults = DriveAccessService.list(folderId, {
          query: "name = 'info.json'",
          fields: "files(id)"
      });

      if (infoResults.length > 0) {
        const infoFileId = infoResults[0].id;
        const content = DriveAccessService.getFileContent(infoFileId);
        try {
          const json = JSON.parse(content);
          const metaPublisher = (
            json.publisher ||
            (json.metadata && json.metadata.publisher) ||
            ""
          ).toString();
          const metaSite = (json.site || "").toString();

          if (json.category === "Novel" || (json.metadata && json.metadata.category === "Novel")) {
            category = "Novel";
          } else if (json.category === "Manga" || metaPublisher.includes("마나토끼") || metaSite.includes("마나토끼")) {
            category = "Manga";
          }

          let needsUpdate = false;
          if (json.category !== category) {
            json.category = category;
            if (json.metadata) json.metadata.category = category;
            needsUpdate = true;
          }

          if (json.thumbnail && json.thumbnail.length > 500) {
            DriveAccessService.createFile(folderId, "cover.jpg", Utilities.base64Decode(json.thumbnail), "image/jpeg");
            json.thumbnail = ""; 
            needsUpdate = true;
            fixedThumbnails++;
            Debug.log(`   -> Extracted Thumbnail`);
          }

          if (needsUpdate) {
            DriveAccessService.updateFileContent(infoFileId, JSON.stringify(json, null, 2));
            Debug.log(`   -> Updated info.json (Category/Thumbnail)`);
          }
        } catch (e) {
          Debug.log(`   -> JSON Parse Error: ${e}`);
        }
      }

      // 2. Move Folder
      let targetCatId = catWebtoonId;
      if (category === "Novel") targetCatId = catNovelId;
      else if (category === "Manga") targetCatId = catMangaId;

      DriveAccessService.move(folderId, rootFolderId, targetCatId);
      movedCount++;
      Debug.log(`   -> Moved to ${category}`);
    } catch (e) {
      Debug.log(`   -> Migration Failed: ${e}`);
    }
  });

  return createRes(
    "success",
    `Migration Complete. Moved: ${movedCount}, Thumbnails: ${fixedThumbnails}`,
    Debug.getLogs(),
  );
}

// =======================================================
// 🔑 Direct Drive Access Token Provider
// =======================================================

/**
 * Provides OAuth Access Token for Client-Side Direct Drive Upload
 *
 * This endpoint enables the UserScript to bypass GAS relay and directly
 * upload files to Google Drive using GM_xmlhttpRequest.
 *
 * Security: Token is valid for 1 hour and scoped to Drive access only.
 *
 * @returns {Object} Response with access token
 */
function view_get_token() {
  Debug.log("🔑 view_get_token: Generating OAuth token");

  try {
    const token = ScriptApp.getOAuthToken();

    if (!token) {
      Debug.error("❌ Token generation failed");
      return createRes(
        "error",
        "Failed to generate OAuth token",
        Debug.getLogs(),
      );
    }

    Debug.log("✅ Token generated successfully");

    return createRes(
      "success",
      {
        token: token,
        expiresIn: 3600, // 1 hour (approximate)
        scope: "https://www.googleapis.com/auth/drive",
        timestamp: new Date().toISOString(),
      },
      Debug.getLogs(),
    );
  } catch (e) {
    Debug.error("❌ Token generation error:", e);
    return createRes("error", `Token Error: ${e.message}`, Debug.getLogs());
  }
}
