// =====================================================
// ⚙️ TokiSync API Server v3.0.0-BETA7 (Stateless)
// -----------------------------------------------------
// 🤝 Compatibility:
//    - Client v3.0.0-BETA7+ (User Execution Mode)
// -----------------------------------------------------

// [GET] 서버 상태 확인용
function doGet(e) {
  return ContentService.createTextOutput(
    "✅ TokiSync API Server v3.0.0-BETA7 (Stateless) is Running..."
  );
}

// [POST] Tampermonkey 요청 처리 (핵심 로직)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // 1. 필수 파라미터 검증 (folderId)
    // Stateless 방식이므로 클라이언트가 반드시 folderId를 보내야 함
    if (!data.folderId) {
      return createRes("error", "Missing folderId in request payload");
    }

    const rootFolderId = data.folderId;

    // 2. 요청 타입 분기
    if (data.type === "init") return initResumableUpload(data, rootFolderId);
    if (data.type === "upload") return uploadChunk(data);
    if (data.type === "check_history")
      return checkDownloadHistory(data, rootFolderId);
    if (data.type === "save_info") return saveSeriesInfo(data, rootFolderId);
    if (data.type === "get_library") return getLibraryIndex(rootFolderId);
    if (data.type === "update_library_status")
      return updateLibraryStatus(data, rootFolderId);

    // 구버전 호환
    if (data.type === "history_get")
      return checkDownloadHistory(data, rootFolderId);

    return createRes("error", "Unknown type");
  } catch (error) {
    return createRes("error", error.toString());
  }
}
