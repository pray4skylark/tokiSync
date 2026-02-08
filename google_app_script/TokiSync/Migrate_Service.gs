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
  const root = DriveApp.getFolderById(rootFolderId);
  let thumbFolder;

  // 1. Get or Create '_Thumbnails' folder
  const thumbFolders = root.getFoldersByName(THUMB_FOLDER_NAME);
  if (thumbFolders.hasNext()) {
    thumbFolder = thumbFolders.next();
  } else {
    thumbFolder = root.createFolder(THUMB_FOLDER_NAME);
  }

  const logs = [];
  logs.push(`[Start] Migration started... Target: ${thumbFolder.getName()}`);

  const CATS = ["Webtoon", "Manga", "Novel"];
  const folders = root.getFolders();

  // Iterate Categories
  while (folders.hasNext()) {
    const catFolder = folders.next();
    if (!CATS.includes(catFolder.getName())) continue;

    logs.push(`[Scan] Category: ${catFolder.getName()}`);

    // Iterate Series
    const seriesFolders = catFolder.getFolders();
    while (seriesFolders.hasNext()) {
      const sFolder = seriesFolders.next();
      const sName = sFolder.getName();

      // Extract Series ID: "[12345] Title" -> "12345"
      const match = sName.match(/^\[(\d+)\]/);
      if (!match) continue;

      const seriesId = match[1];

      // Check for 'cover.jpg'
      const covers = sFolder.getFilesByName("cover.jpg");
      if (covers.hasNext()) {
        const coverFile = covers.next();
        try {
          // Move & Rename
          // moveTo(destination) is File.moveTo(folder)
          coverFile.moveTo(thumbFolder);
          coverFile.setName(`${seriesId}.jpg`);
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
