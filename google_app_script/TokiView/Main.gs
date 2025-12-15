// =====================================================
// 📊 TokiView Dashboard v1.0.0
// =====================================================

// [설정 및 상수]
// 배포 방식 변경(Execute as User)에 따라 ROOT_FOLDER_ID는 이제 사용자별로 설정됩니다.
const INDEX_FILE_NAME = "library_index.json";

// =====================================================
// 🖥️ [GET] 대시보드 페이지 로드 (CSR 방식)
// =====================================================
function doGet(e) {
  // 서버에서는 더 이상 데이터를 미리 로드하지 않음 (Stateless)
  // 클라이언트가 localStorage 또는 스크립트 주입을 통해 ID를 확보하고 요청해야 함
  // [New] 서버 정보 자가 진단 (TokiView)
  if (e.parameter && e.parameter.type === "get_server_info") {
    const info = {
      name: "TokiView Dashboard",
      version: "v3.0.0-beta.251211",
      url: ScriptApp.getService().getUrl(),
      user: Session.getActiveUser().getEmail(),
    };
    return ContentService.createTextOutput(JSON.stringify(info)).setMimeType(
      ContentService.MimeType.JSON
    );
  }

  const template = HtmlService.createTemplateFromFile("Index");
  return template
    .evaluate()
    .setTitle("TokiView v3.0.0-beta.251215.0003")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =====================================================
// 🧩 파일 포함 헬퍼 (HTML 모듈화)
// =====================================================
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
