// ⚙️ TokiSync API Server v1.0.0 (Stateless)
// -----------------------------------------------------
// 🤝 Compatibility:
//    - Client v1.0.0+ (User Execution Mode)
// -----------------------------------------------------

// [GET] 서버 상태 확인용
/**
 * [GET] 서버 상태 확인용 엔드포인트
 * 웹 앱 URL 접근 시 서버가 작동 중인지 확인하는 메시지를 반환합니다.
 *
 * @param {Object} e - 이벤트 객체
 * @returns {TextOutput} 서버 상태 메시지
 */
function doGet(e) {
  return ContentService.createTextOutput(
    "✅ TokiSync API Server v1.5.5 (Stateless) is Running...",
  );
}

// [POST] Tampermonkey 요청 처리 (핵심 로직)
/**
 * [POST] API 요청 처리 핸들러
 * 클라이언트(Tampermonkey, Web App)로부터의 JSON 요청을 처리합니다.
 *
 * [요청 흐름]
 * 1. Payload 파싱 및 `folderId` 검증
 * 2. `data.type`에 따라 적절한 서비스 함수로 분기
 * 3. `view_*` 요청은 `View_Dispatcher`로 위임
 * 4. 결과(JSON) 반환
 *
 * @param {Object} e - 이벤트 객체 (postData 포함)
 * @returns {TextOutput} JSON 응답
 */
// [CONSTANTS]
const SERVER_VERSION = "v1.5.6"; // API Key Enforcement for All Requests (including viewer)
// API Key stored in Script Properties (Project Settings > Script Properties)
// Set property: API_KEY = your_secret_key
const API_KEY = PropertiesService.getScriptProperties().getProperty("API_KEY");

function doPost(e) {
  Debug.start(); // 🐞 디버그 시작
  try {
    const data = JSON.parse(e.postData.contents);

    // 0. API Key Validation (Security) - All Requests Including Viewer
    if (!API_KEY) {
      return createRes(
        "error",
        "Server Configuration Error: API_KEY not set in Script Properties",
      );
    }
    if (!data.apiKey || data.apiKey !== API_KEY) {
      return createRes("error", "Unauthorized: Invalid API Key");
    }

    // 1. 필수 파라미터 검증 (folderId)
    // Stateless 방식이므로 클라이언트가 반드시 folderId를 보내야 함
    if (!data.folderId) {
      return createRes("error", "Missing folderId in request payload");
    }

    // 🔒 [New] 클라이언트 프로토콜 버전 검증 (Major Version 기준)
    // const MIN_PROTOCOL_VERSION = 3;
    // const MIN_CLIENT_VERSION = "3.0.0-beta.251215.0002";
    // const clientProtocol = data.protocolVersion || 0;

    // [Verified] Strict Check Disabled for Safety during Rollout
    /*
    if (clientProtocol < MIN_PROTOCOL_VERSION) {
        return createRes({
            status: 'error',
            error: `Client Incompatible (Requires Protocol v${MIN_PROTOCOL_VERSION}+)`,
            message: '클라이언트 업데이트가 필요합니다.'
        });
    }
    */
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
          status: "success",
          message: "TokiSync Server is Online",
          version: SERVER_VERSION,
          timestamp: new Date().toISOString(),
          url: ScriptApp.getService().getUrl(),
          user: Session.getActiveUser().getEmail(),
        });
      } else if (data.type === "history_get")
        result = checkDownloadHistory(data, rootFolderId);
      else if (data.type === "migrate")
        result = migrateLegacyStructure(rootFolderId);
      // [Viewer Migration] Isolated Routing
      else if (data.type && data.type.startsWith("view_")) {
        result = View_Dispatcher(data);
      } else result = createRes("error", "Unknown type");
    } catch (handlerError) {
      Debug.error("❌ Handler Error", handlerError);
      return createRes("error", handlerError.toString(), Debug.getLogs());
    }

    return result;
  } catch (error) {
    return createRes("error", error.toString());
  }
}
