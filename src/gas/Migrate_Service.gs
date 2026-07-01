/**
 * 🛠️ Migration Service
 * Handles one-time data migration tasks for system updates.
 */

// Centralized Thumbnail Folder Name provided by View_LibraryService.gs
var THUMB_FOLDER_NAME = "_Thumbnails";

/**
 * [Migration] Moves 'cover.jpg' from series folders to '_Thumbnails/{SeriesID}.jpg'
 * This is a heavy operation and should be run carefully.
 *
 * @param {string} rootFolderId - Root folder ID of the library
 */
function Migrate_MoveThumbnails(rootFolderId) {
  const thumbFolderId = DriveAccessService.ensureFolder(rootFolderId, THUMB_FOLDER_NAME);
  
  const logs = [];
  logs.push(`[Start] Migration started... Target: ${THUMB_FOLDER_NAME} (${thumbFolderId})`);

  const CATS = ["Webtoon", "Manga", "Novel"];
  const folders = DriveAccessService.list(rootFolderId, {
      query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)"
  });

  // Iterate Categories
  for (const catFolder of folders) {
    if (!CATS.includes(catFolder.name)) continue;

    logs.push(`[Scan] Category: ${catFolder.name}`);

    // Iterate Series
    const seriesFolders = DriveAccessService.list(catFolder.id, {
        query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: "files(id, name)"
    });

    for (const sFolder of seriesFolders) {
      const sName = sFolder.name;

      // Extract Series ID (Supports alphanumeric IDs v1.9.4+)
      const match = sName.match(/^\[([a-zA-Z0-9_\-]+)\]/);
      if (!match) continue;

      const seriesId = match[1];

      // Check for 'cover.jpg'
      const covers = DriveAccessService.list(sFolder.id, {
          query: "name = 'cover.jpg' and trashed = false",
          fields: "files(id, parents)"
      });

      if (covers.length > 0) {
        const coverFile = covers[0];
        try {
          // Move (V3 Style)
          DriveAccessService.move(coverFile.id, sFolder.id, thumbFolderId);
          // Rename
          DriveAccessService.patch(coverFile.id, { name: `${seriesId}.jpg` });
          
          logs.push(`  ✅ Moved: ${sName} -> ${seriesId}.jpg`);
        } catch (e) {
          logs.push(`  ❌ Failed: ${sName} - ${e.toString()}`);
        }
      }
    }
  }

  logs.push("[Done] Migration completed.");
  return logs;
}

/**
 * [Migration] Rename files to include Series Title
 * Target: "0001 - 1화.cbz" -> "0001 - SeriesTitle 1화.cbz"
 *
 * @param {string} seriesId
 * @param {string} rootFolderId
 */
function Migrate_RenameFiles(seriesId, rootFolderId) {
  let targetSeriesFolderId = null;
  let targetSeriesFolderName = "";
  let seriesTitle = "";

  // 1. Find Series Folder: "[ID] Title"
  const CATS = ["Webtoon", "Manga", "Novel"];
  const folders = DriveAccessService.list(rootFolderId, {
      query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)"
  });

  for (const catFolder of folders) {
    if (!CATS.includes(catFolder.name)) continue;

    const seriesFolders = DriveAccessService.list(catFolder.id, {
        query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: "files(id, name)"
    });

    for (const sFolder of seriesFolders) {
      if (sFolder.name.includes(`[${seriesId}]`)) {
        targetSeriesFolderId = sFolder.id;
        targetSeriesFolderName = sFolder.name;
        seriesTitle = sFolder.name.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, "").trim();
        break;
      }
    }
    if (targetSeriesFolderId) break;
  }

  if (!targetSeriesFolderId) return ["Error: Series Folder Not Found"];

  const logs = [];
  logs.push(`[Start] Renaming files in: ${targetSeriesFolderName} (Title: ${seriesTitle})`);

  const files = DriveAccessService.list(targetSeriesFolderId, {
      query: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)"
  });
  let count = 0;

  for (const file of files) {
    const name = file.name;

    if (name.match(/^\d{4}\s-\s/) && !name.includes(seriesTitle)) {
      const parts = name.split(" - ");
      if (parts.length >= 2) {
        const numPart = parts[0]; 
        const restPart = parts.slice(1).join(" - "); 

        const newName = `${numPart} - ${seriesTitle} ${restPart}`;
        DriveAccessService.patch(file.id, { name: newName });
        logs.push(`  Renamed: ${name} -> ${newName}`);
        count++;
      }
    }
  }

  logs.push(`[Done] ${count} files renamed.`);
  return logs;
}

/**
 * [Migration] Kavita 규격에 맞게 폴더 내 파일명을 일괄 변경하고 메타데이터 자가 치유(Self-Healing)를 수행합니다.
 * 타겟 파일명: "0001 - 1화.cbz" ➔ "시리즈제목 - c001 - 1화.cbz"
 * 자가 치유: sourceId가 드라이브 폴더 ID로 꼬인 경우 info.json을 읽어 원본 사이트 ID로 복원
 *
 * @param {string} rootFolderId - 라이브러리 루트 폴더 ID
 * @param {boolean} executeRename - 파일명 실제 변경 여부 (false인 경우 Dry-Run으로 로그만 출력)
 * @returns {Array<string>} 마이그레이션 작업 로그
 */
function Migrate_KavitaFormat(rootFolderId, executeRename = false) {
  const startTime = new Date().getTime();
  const TIME_LIMIT = 20000; // 20초 제한 (GAS 6분 초과 방지)
  const logs = [];
  logs.push(`[Start] Kavita 마이그레이션 시작 (실제 변경 여부: ${executeRename})`);

  const CATS = ["Webtoon", "Manga", "Novel"];
  const folders = DriveAccessService.list(rootFolderId, {
      query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)"
  });

  let processedCount = 0;
  let skippedCount = 0;
  let timeoutFlag = false;

  for (const catFolder of folders) {
    if (!CATS.includes(catFolder.name)) continue;
    if (timeoutFlag) break;

    logs.push(`[Scan] 카테고리 폴더: ${catFolder.name}`);

    const seriesFolders = DriveAccessService.list(catFolder.id, {
        query: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: "files(id, name)"
    });

    for (const sFolder of seriesFolders) {
      if (new Date().getTime() - startTime > TIME_LIMIT) {
        logs.push(`[Timeout] 실행 시간(20초)이 초과되어 마이그레이션을 일시 중단합니다. 이어서 다시 실행해 주세요.`);
        timeoutFlag = true;
        break;
      }

      const folderId = sFolder.id;
      const folderName = sFolder.name;
      
      // 1. 대괄호 ID 추출 (영숫자 정규식 교정 적용)
      const idMatch = folderName.match(/^\[([a-zA-Z0-9_\-]+)\]/);
      let folderSeriesId = idMatch ? idMatch[1] : null;
      let seriesTitle = folderName.replace(/^\[[a-zA-Z0-9_\-]+\]\s*/, "").trim();

      // _toki_meta.json 로드 시도
      let metaFileId = null;
      let metaData = null;
      const metaName = "_toki_meta.json";
      const metaResults = DriveAccessService.list(folderId, {
        query: `name = '${metaName}' and trashed = false`,
        fields: "files(id)"
      });
      if (metaResults.length > 0) {
        metaFileId = metaResults[0].id;
        try {
          const content = DriveAccessService.getFileContent(metaFileId);
          metaData = JSON.parse(content);
        } catch (e) {
          logs.push(`  ⚠️ [${folderName}] _toki_meta.json 파싱 오류 (새로 생성 예정)`);
        }
      }

      // 이미 마이그레이션이 완료된 폴더인지 체크 (기록 보존 및 중복 실행 방지)
      if (metaData && metaData.kavitaMigrated === true) {
        skippedCount++;
        continue;
      }

      logs.push(`⚙️ [Process] 작품 처리 중: "${folderName}"`);

      // 2. info.json 조회 및 파싱 (소스 ID 복구/정상성 검증 목적)
      let infoData = null;
      const infoResults = DriveAccessService.list(folderId, {
        query: "name = 'info.json' and trashed = false",
        fields: "files(id)"
      });
      if (infoResults.length > 0) {
        try {
          const infoContent = DriveAccessService.getFileContent(infoResults[0].id);
          infoData = JSON.parse(infoContent);
        } catch (e) {
          logs.push(`  ⚠️ [${folderName}] info.json 읽기 실패: ${e.message}`);
        }
      }

      // 3. 소스 ID 자가 치유 (Self-Healing)
      let finalSourceId = folderSeriesId || (metaData ? metaData.sourceId : null);
      
      // 만약 소스 ID가 드라이브 폴더 ID이거나 비어있다면 info.json의 ID로 복원
      if (!finalSourceId || finalSourceId === folderId) {
        if (infoData && infoData.id) {
          finalSourceId = infoData.id;
          logs.push(`  ✅ [Self-Healing] 소스 ID 복구: ${folderId} ➔ ${finalSourceId}`);
        } else {
          finalSourceId = folderId; // 복구할 정보가 없다면 폴더 ID 유지
        }
      }

      // 4. 메타데이터 갱신 및 저장
      const updatedMeta = {
        ...(metaData || {}),
        id: folderId,
        sourceId: finalSourceId,
        vendorId: (infoData && infoData.id) ? infoData.id : finalSourceId,
        name: seriesTitle,
        originalSeriesTitle: (infoData && infoData.title) ? infoData.title : (metaData && metaData.originalSeriesTitle ? metaData.originalSeriesTitle : seriesTitle),
        folderName: folderName,
        category: catFolder.name,
        vendor: (infoData && infoData.vendor) ? infoData.vendor : (metaData && metaData.vendor ? metaData.vendor : ""),
        status: normalizeStatus((infoData && infoData.status) ? infoData.status : (metaData && metaData.status ? metaData.status : "연재중")),
        summary: (infoData && infoData.summary) ? infoData.summary : (metaData && metaData.summary ? metaData.summary : ""),
        kavitaMigrated: true, // 마이그레이션 완료 플래그 기록
        lastUpdated: new Date().toISOString()
      };

      try {
        const metaString = JSON.stringify(updatedMeta);
        if (metaFileId) {
          DriveAccessService.updateFileContent(metaFileId, metaString);
        } else {
          DriveAccessService.createFile(folderId, metaName, metaString, "application/json");
        }
        logs.push(`  💾 [Metadata] _toki_meta.json 자가 치유 및 갱신 완료`);
      } catch (metaErr) {
        logs.push(`  ❌ [Metadata] 메타데이터 저장 실패: ${metaErr.message}`);
      }

      // 5. 파일명 일괄 변경 (Kavita 규격)
      if (executeRename) {
        const files = DriveAccessService.list(folderId, {
            query: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
            fields: "files(id, name)"
        });

        let fileRenameCount = 0;
        for (const file of files) {
          const name = file.name;
          // 시스템 파일 제외
          if (name === "info.json" || name === "_toki_meta.json" || name === "_toki_cache.json") continue;

          // 이미 규격에 맞는 파일명인지 체크 (예: "Title - c001" 등 포함 여부)
          if (name.includes(seriesTitle) && name.match(/[-_ ]c(?:h)?\d+/i)) {
            continue;
          }

          // 에피소드 번호 파싱
          let number = null;
          const kavitaMatch = name.match(/[-_ ]c(?:h)?(\d+)/i);
          if (kavitaMatch) {
            number = parseInt(kavitaMatch[1]);
          } else {
            const hwaMatch = name.match(/(\d+)화/);
            if (hwaMatch) {
              number = parseInt(hwaMatch[1]);
            } else {
              const startNumMatch = name.match(/^(\d+)/);
              if (startNumMatch) {
                number = parseInt(startNumMatch[1]);
              }
            }
          }

          if (number !== null) {
            const padNum = String(number).padStart(3, '0');
            const ext = name.split('.').pop();
            
            // 기존 파일명에서 부제목 파싱 시도
            const cleanName = name.replace(/\.[^/.]+$/, "");
            const parts = cleanName.split(" - ");
            let epTitle = "";
            if (parts.length >= 3) {
              epTitle = parts.slice(2).join(" - ").trim();
            } else if (parts.length >= 2) {
              epTitle = parts[1].trim();
            } else {
              epTitle = cleanName;
            }

            // 파일명에 'c001' 혹은 '1화' 가 없을 경우 부제목에 추가 보장
            if (!epTitle.includes(`${number}화`) && !epTitle.includes(`c${padNum}`)) {
              epTitle = `${number}화 ${epTitle}`.trim();
            }

            // 새 파일명 조합: "시리즈명 - c001 - 부제목.확장자"
            const newName = `${seriesTitle} - c${padNum} - ${epTitle}.${ext}`;

            try {
              DriveAccessService.patch(file.id, { name: newName });
              fileRenameCount++;
            } catch (renameErr) {
              logs.push(`  ❌ [Rename] 파일명 변경 실패: ${name} ➔ ${renameErr.message}`);
            }
          }
        }
        if (fileRenameCount > 0) {
          logs.push(`  📂 [Rename] ${fileRenameCount}개 파일명 변경 완료 (Kavita 규격)`);
        }
      }

      processedCount++;
    }
  }

  logs.push(`[Done] 마이그레이션 실행 완료. (신규 처리: ${processedCount}개, 스킵: ${skippedCount}개)`);
  return logs;
}
