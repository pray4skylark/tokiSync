// ⚙️ TokiSync API Server v3.0.0-beta.251211 (Stateless)
// -----------------------------------------------------
// 🤝 Compatibility:
//    - Client v3.0.0-beta.251211+ (User Execution Mode)
// -----------------------------------------------------

// [GET] 서버 상태 확인용
function doGet(e) {
  return ContentService.createTextOutput(
    "✅ TokiSync API Server v3.0.0-beta.251211 (Stateless) is Running..."
  );
}

// [POST] Tampermonkey 요청 처리 (핵심 로직)
function doPost(e) {
  Debug.start(); // 🐞 디버그 시작
  try {
    const data = JSON.parse(e.postData.contents);

    // 1. 필수 파라미터 검증 (folderId)
    // Stateless 방식이므로 클라이언트가 반드시 folderId를 보내야 함
    if (!data.folderId) {
      return createRes("error", "Missing folderId in request payload");
    }

    // 🔒 [New] 클라이언트 버전 검증
    // Core에서 clientVersion 필드를 보내야 함
    const MIN_CLIENT_VERSION = "3.0.0-beta.251212.0003";
    const clientVer = data.clientVersion || "0.0.0"; // 없으면 구버전

    // 날짜 기반 버전 비교 (문자열 비교 가능: "3.0.0-beta.251212.0001" 형태)
    // 베타 버전 문자열 비교를 위해 간단한 로직 사용 ("" 제거 후 숫자 비교 권장하지만, CalVer 문자열 비교도 유효)
    if (clientVer < MIN_CLIENT_VERSION) {
      return createRes(
        "error",
        `Client Outdated. (Server requires ${MIN_CLIENT_VERSION}+)`
      );
    }

    const rootFolderId = data.folderId;

    // 2. 요청 타입 분기
    let result;
    try {
      if (data.type === "init")
        result = initResumableUpload(data, rootFolderId);
      else if (data.type === "upload") result = uploadChunk(data);
      else if (data.type === "check_history")
        result = checkDownloadHistory(data, rootFolderId);
      else if (data.type === "save_info")
        result = saveSeriesInfo(data, rootFolderId);
      else if (data.type === "get_library")
        result = getLibraryIndex(rootFolderId);
      else if (data.type === "update_library_status")
        result = updateLibraryStatus(data, rootFolderId);
      else if (data.type === "get_server_info") {
        result = createRes("success", {
          name: "TokiSync API",
          version: "v3.0.0-beta.251212.0003",
          url: ScriptApp.getService().getUrl(),
          user: Session.getActiveUser().getEmail(),
        });
      } else if (data.type === "history_get")
        result = checkDownloadHistory(data, rootFolderId);
      else result = createRes("error", "Unknown type");
    } catch (handlerError) {
      Debug.error("❌ Handler Error", handlerError);
      return createRes("error", handlerError.toString(), Debug.getLogs());
    }

    return result;
  } catch (error) {
    return createRes("error", error.toString());
  }
}
