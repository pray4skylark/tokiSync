// =======================================================
// 📡 Viewer Action Dispatcher (Controller)
// =======================================================

function View_Dispatcher(data) {
  try {
    const action = data.type; // Use 'type' to match TokiSync Main.gs convention
    const folderId = data.folderId;

    let resultBody = null;

    // Route Actions
    if (action === "view_get_library") {
      if (!data.folderId) throw new Error("folderId is required for library");
      resultBody = View_getSeriesList(data.folderId);
    } else if (action === "view_get_books") {
      if (!data.seriesId) throw new Error("seriesId is required for books");
      resultBody = View_getBooks(data.seriesId);
    } else if (action === "view_get_chunk") {
      if (!data.fileId) throw new Error("fileId is required");
      // Chunk logic
      const offset = data.offset || 0;
      const length = data.length || 10 * 1024 * 1024;
      resultBody = View_getFileChunk(data.fileId, offset, length);
    } else {
      throw new Error("Unknown Viewer Action: " + action);
    }

    return createRes("success", resultBody);
  } catch (e) {
    return createRes("error", e.toString());
  }
}
