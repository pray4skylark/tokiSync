// =======================================================
// 🔄 Kavita Library Structure Migration Service
// =======================================================

/**
 * [Phase 3] 시리즈 폴더를 Root 직속 플랫 구조로 변환 (Kavita 호환)
 * - CATS(Webtoon/Novel/Manga) 폴더에서 시리즈를 Root로 이동
 * - 폴더명/파일명에서 [ID] 접두사 제거
 * - _toki_meta.json에 _restructured: true 기록 (멱등성)
 *
 * @param {string} rootFolderId - Root 폴더 ID
 * @param {string[]} selectedIds - 변환할 시리즈 폴더 ID 목록 (빈 배열 = 전체)
 * @returns {Object} { ok, moved, total, errors }
 */
function Kavita_Restructure(rootFolderId, selectedIds) {
  const result = { ok: true, moved: 0, total: 0, errors: [] };
  const CATS = ["Webtoon", "Manga", "Novel"];
  const startTime = new Date().getTime();
  const TIME_LIMIT = 300000; // 5 minutes

  // 1. Collect target series folders
  let targets = [];
  
  if (selectedIds && selectedIds.length > 0) {
    // Specific selection
    targets = selectedIds.map(id => ({ id, name: DriveAccessService.getMetadata(id).name }));
  } else {
    // Scan all category folders
    for (const catName of CATS) {
      const catFolder = findFolderId(catName, rootFolderId);
      if (!catFolder) continue;
      const seriesList = DriveAccessService.list(catFolder, {
        query: "mimeType = 'application/vnd.google-apps.folder'",
        fields: "files(id, name)"
      });
      targets.push(...seriesList);
    }
  }

  result.total = targets.length;
  Debug.log(`[Kavita] 변환 대상: ${result.total}개 시리즈`);

  // 2. Process each series
  for (const series of targets) {
    if (new Date().getTime() - startTime > TIME_LIMIT) {
      Debug.log(`[Kavita] ⏰ 타임아웃 approaching, ${result.moved}/${result.total} 완료`);
      break;
    }

    try {
      const seriesMeta = _kavitaProcessSeries(series, rootFolderId);
      if (seriesMeta) result.moved++;
    } catch (e) {
      result.errors.push({ id: series.id, reason: e.message });
      Debug.error(`[Kavita] ❌ 실패: ${series.name}: ${e.message}`);
    }
  }

  // 3. Clean up empty category folders
  for (const catName of CATS) {
    try {
      const catFolder = findFolderId(catName, rootFolderId);
      if (!catFolder) continue;
      const remaining = DriveAccessService.list(catFolder, {
        query: "mimeType = 'application/vnd.google-apps.folder'",
        fields: "files(id)"
      });
      if (remaining.length === 0) {
        DriveAccessService.trash(catFolder);
        Debug.log(`[Kavita] 🗑️ 빈 카테고리 폴더 정리: ${catName}`);
      }
    } catch (e) {}
  }

  return result;
}

/**
 * 개별 시리즈 폴더를 플랫 구조로 변환
 */
function _kavitaProcessSeries(series, rootFolderId) {
  const folderId = series.id;
  const folderName = series.name;
  
  // 멱등성: 이미 처리되었는지 확인
  const metaResults = DriveAccessService.list(folderId, {
    query: "name = '_toki_meta.json'",
    fields: "files(id)"
  });
  
  let alreadyRestructured = false;
  if (metaResults.length > 0) {
    try {
      const content = DriveAccessService.getFileContent(metaResults[0].id);
      const meta = JSON.parse(content);
      alreadyRestructured = meta._restructured === true;
    } catch (e) { Debug.error("[Kavita] processSeries error: " + e.message); }
  }
  
  if (alreadyRestructured) {
    Debug.log(`[Kavita] ⏭️ 이미 변환됨: ${folderName}`);
    return null;
  }

  // Clean folder name: remove [ID] prefix
  const cleanName = folderName.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, '').trim() || folderName;
  
  // If already in root and no [ID] prefix, just mark as done
  if (cleanName === folderName && !folderName.match(/^\[/)) {
    _kavitaMarkMigrated(folderId, folderName);
    Debug.log(`[Kavita] ✅ 이미 플랫 구조: ${folderName}`);
    return folderId;
  }

  // Create or find destination folder in root
  let destFolderId;
  try {
    destFolderId = DriveAccessService.ensureFolder(rootFolderId, cleanName);
  } catch (e) {
    throw new Error(`대상 폴더 생성 실패: ${cleanName} (${e.message})`);
  }

  // Move all files
  const files = DriveAccessService.list(folderId, {
    query: "mimeType != 'application/vnd.google-apps.folder'",
    fields: "files(id, name)"
  });

  for (const file of files) {
    if (file.name === 'info.json' || file.name === '_toki_meta.json') {
      DriveAccessService.move(file.id, folderId, destFolderId);
      continue;
    }
    
    // Clean file name: remove [ID] prefix
    const cleanFileName = file.name.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, '').trim() || file.name;
    if (cleanFileName !== file.name) {
      DriveAccessService.patch(file.id, { name: cleanFileName });
    }
    DriveAccessService.move(file.id, folderId, destFolderId);
  }

  // Mark source folder as migrated
  _kavitaMarkMigrated(destFolderId, cleanName);

  // Trash the old series folder
  try {
    DriveAccessService.trash(folderId);
  } catch (e) {
    Debug.log(`[Kavita] ⚠️ 구 폴더 정리 실패 (무시 가능): ${folderId}`);
  }

  Debug.log(`[Kavita] ✅ 변환 완료: ${folderName} → ${cleanName}`);
  return destFolderId;
}

function _kavitaMarkMigrated(folderId, seriesName) {
  let meta = {};
  let existing = [];
  try {
    existing = DriveAccessService.list(folderId, {
      query: "name = '_toki_meta.json'",
      fields: "files(id)"
    });
    if (existing.length > 0) {
      const raw = DriveAccessService.getFileContent(existing[0].id);
      try {
        meta = JSON.parse(raw);
      } catch (parseErr) {
        Debug.error(`[Kavita] _toki_meta.json parse failed for ${seriesName}: ${parseErr.message}. Skip write to prevent data loss.`);
        return;
      }
    }
  } catch (e) {
    Debug.error(`[Kavita] Drive access failed for ${seriesName}: ${e.message}`);
    return;
  }

  meta._restructured = true;
  meta._restructuredAt = new Date().toISOString();
  meta.name = meta.name || seriesName;
  meta.lastUpdated = new Date().toISOString();

  const body = JSON.stringify(meta, null, 2);
  if (existing.length > 0) {
    DriveAccessService.updateFileContent(existing[0].id, body, "application/json");
  } else {
    DriveAccessService.createFile(folderId, "_toki_meta.json", body, "application/json");
  }
}

/**
 * 현재 라이브러리 구조 진단
 */
function Kavita_GetStatus(rootFolderId) {
  const CATS = ["Webtoon", "Manga", "Novel"];
  const SYSTEM_FOLDERS = ["_Thumbnails", "_MergeIndex"];
  
  const result = {
    stats: { totalSeries: 0, legacyCategory: 0, alreadyFlat: 0, restructured: 0 },
    byCategory: [],
    conflicts: []
  };
  
  const nameCount = {};
  
  // Scan category folders
  for (const catName of CATS) {
    const catFolder = findFolderId(catName, rootFolderId);
    if (!catFolder) continue;
    
    const seriesList = DriveAccessService.list(catFolder, {
      query: "mimeType = 'application/vnd.google-apps.folder'",
      fields: "files(id, name)"
    });
    
    if (seriesList.length === 0) continue;
    
    const entry = { name: catName, series: [] };
    for (const s of seriesList) {
      const cleanName = s.name.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, '').trim() || s.name;
      entry.series.push({ id: s.id, name: s.name, cleanName });
      
      // Check for conflicts
      if (nameCount[cleanName]) {
        nameCount[cleanName].push({ path: `${catName}/${s.name}`, id: s.id });
      } else {
        nameCount[cleanName] = [{ path: `${catName}/${s.name}`, id: s.id }];
      }
      
      // Check if already restructured
      try {
        const metaFiles = DriveAccessService.list(s.id, {
          query: "name = '_toki_meta.json'",
          fields: "files(id)"
        });
        if (metaFiles.length > 0) {
          const content = DriveAccessService.getFileContent(metaFiles[0].id);
          const meta = JSON.parse(content);
          if (meta._restructured) result.stats.restructured++;
        }
      } catch (e) {}
      
      result.stats.legacyCategory++;
    }
    result.byCategory.push(entry);
  }
  
  // Scan root for already-flat series
  const rootFolders = DriveAccessService.list(rootFolderId, {
    query: "mimeType = 'application/vnd.google-apps.folder'",
    fields: "files(id, name)"
  });
  
  for (const f of rootFolders) {
    if (CATS.includes(f.name) || SYSTEM_FOLDERS.includes(f.name)) continue;
    if (!f.name.match(/^\[/)) {
      result.stats.alreadyFlat++;
    }
  }
  
  result.stats.totalSeries = result.stats.legacyCategory + result.stats.alreadyFlat;
  
  // Find conflicts
  for (const [name, sources] of Object.entries(nameCount)) {
    if (sources.length > 1) {
      result.conflicts.push({ name, sources });
    }
  }
  
  return result;
}
