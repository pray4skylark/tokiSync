// =======================================================
// ☁️ 업로드 서비스 (대용량 업로드)
// =======================================================

function initResumableUpload(data, rootFolderId) {
  // Use new helper with Category support
  const seriesFolder = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    true,
  );
  const folderId = seriesFolder.getId();

  // [Fix] Prevent Duplicate Files: Delete existing file with the same name before uploading a new one
  const existing = seriesFolder.getFilesByName(data.fileName);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }

  const url =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";

  const metadata = {
    name: data.fileName,
    parents: [folderId],
    mimeType:
      data.fileName.endsWith(".jpg") || data.fileName.endsWith(".jpeg")
        ? "image/jpeg"
        : data.fileName.endsWith(".epub")
          ? "application/epub+zip"
          : "application/zip",
  };

  const params = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(metadata),
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, params);

  if (response.getResponseCode() === 200) {
    return createRes("success", {
      uploadUrl: response.getHeaders()["Location"],
      folderId: folderId,
    });
  } else {
    return createRes("error", response.getContentText());
  }
}

function uploadChunk(data) {
  const uploadUrl = data.uploadUrl;
  const chunkData = Utilities.base64Decode(data.chunkData);
  const blob = Utilities.newBlob(chunkData);

  const start = data.start;
  const total = data.total;
  const size = blob.getBytes().length;
  const end = start + size - 1;

  const rangeHeader = `bytes ${start}-${end}/${total}`;

  const params = {
    method: "put",
    payload: blob,
    headers: { "Content-Range": rangeHeader },
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(uploadUrl, params);
  const code = response.getResponseCode();

  if (code === 308) {
    return createRes("success", "Chunk uploaded");
  } else if (code === 200 || code === 201) {
    // [v1.6.0] Task A-1: Return the new fileId upon completion
    let newFileId = null;
    try {
      const responseData = JSON.parse(response.getContentText());
      if (responseData && responseData.id) {
        newFileId = responseData.id;
      }
    } catch (e) {
      console.warn("Failed to parse upload completion response", e);
    }
    return createRes("success", { message: "Upload complete", fileId: newFileId });
  } else {
    return createRes("error", `Drive API Error: ${code}`);
  }
}

/**
 * [v1.6.0] Task A-3: initUpdateResumableUpload
 * 해당 파일 ID를 알고 있을 때 파일 이름 검색 없이 바로 덮어쓰기 세션을 엽니다.
 */
function initUpdateResumableUpload(data) {
  const { fileId, fileName } = data;
  
  if (!fileId) {
      return createRes("error", "Missing fileId for update operation");
  }

  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`;
  
  const params = {
    method: "patch", // Use PATCH to update existing file content
    contentType: "application/json",
    payload: JSON.stringify({ name: fileName }), // Ensure name stays correct
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, params);
  const code = response.getResponseCode();

  if (code === 200) {
    return createRes("success", { 
        uploadUrl: response.getHeaders()["Location"] 
    });
  } else {
    return createRes("error", `initUpdate failed: ${code} - ${response.getContentText()}`);
  }
}
