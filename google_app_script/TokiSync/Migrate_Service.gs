/**
 * 🛠️ Migration Service
 * Handles one-time data migration tasks for system updates.
 */

// Centralized Thumbnail Folder Name provided by View_LibraryService.gs
// const THUMB_FOLDER_NAME = "_Thumbnails";

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
      query: "mimeType = 'application/vnd.google-apps.folder'",
      fields: "files(id, name)"
  });

  // Iterate Categories
  for (const catFolder of folders) {
    if (!CATS.includes(catFolder.name)) continue;

    logs.push(`[Scan] Category: ${catFolder.name}`);

    // Iterate Series
    const seriesFolders = DriveAccessService.list(catFolder.id, {
        query: "mimeType = 'application/vnd.google-apps.folder'",
        fields: "files(id, name)"
    });

    for (const sFolder of seriesFolders) {
      const sName = sFolder.name;

      // Extract Series ID: "[12345] Title" -> "12345"
      const match = sName.match(/^\[(\d+)\]/);
      if (!match) continue;

      const seriesId = match[1];

      // Check for 'cover.jpg'
      const covers = DriveAccessService.list(sFolder.id, {
          query: "name = 'cover.jpg'",
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
      query: "mimeType = 'application/vnd.google-apps.folder'",
      fields: "files(id, name)"
  });

  for (const catFolder of folders) {
    if (!CATS.includes(catFolder.name)) continue;

    const seriesFolders = DriveAccessService.list(catFolder.id, {
        query: "mimeType = 'application/vnd.google-apps.folder'",
        fields: "files(id, name)"
    });

    for (const sFolder of seriesFolders) {
      if (sFolder.name.includes(`[${seriesId}]`)) {
        targetSeriesFolderId = sFolder.id;
        targetSeriesFolderName = sFolder.name;
        seriesTitle = sFolder.name.replace(/^\[\d+\]\s*/, "").trim();
        break;
      }
    }
    if (targetSeriesFolderId) break;
  }

  if (!targetSeriesFolderId) return ["Error: Series Folder Not Found"];

  const logs = [];
  logs.push(`[Start] Renaming files in: ${targetSeriesFolderName} (Title: ${seriesTitle})`);

  const files = DriveAccessService.list(targetSeriesFolderId, {
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
