
// =====================================================
// 🐞 디버깅용 함수 (GAS 에디터에서 직접 실행하여 테스트)
// =====================================================
function testSetup() {
  Logger.log("🔍 [1] 사용자 속성(UserProperties) 테스트 시작...");
  try {
    const userProps = PropertiesService.getUserProperties();
    const data = userProps.getProperties();
    Logger.log("✅ UserProperties 접근 성공. 현재 저장된 키: " + Object.keys(data).join(", "));
  } catch (e) {
    Logger.log("❌ UserProperties 접근 실패: " + e.toString());
  }

  Logger.log("🔍 [2] 드라이브 권한 및 폴더 접근 테스트...");
  const config = getUserConfig();
  if (!config.rootFolderId) {
    Logger.log("⚠️ ROOT_FOLDER_ID가 설정되지 않았습니다. 'save_config'를 먼저 실행해야 합니다.");
    return;
  }
  
  try {
    const root = DriveApp.getFolderById(config.rootFolderId);
    Logger.log("✅ 루트 폴더 접근 성공: " + root.getName());
    
    const files = root.getFilesByName("library_index.json");
    if (files.hasNext()) {
      Logger.log("✅ library_index.json 파일 발견됨.");
      const content = files.next().getBlob().getDataAsString();
      Logger.log("📄 파일 내용 미리보기: " + content.substring(0, 100) + "...");
      try {
        const json = JSON.parse(content);
        Logger.log("✅ JSON 파싱 성공. 항목 수: " + (Array.isArray(json) ? json.length : "배열 아님"));
      } catch (e) {
        Logger.log("❌ JSON 파싱 실패: " + e.toString());
      }
    } else {
      Logger.log("ℹ️ library_index.json 파일이 없습니다 (정상).");
    }
  } catch (e) {
    Logger.log("❌ 드라이브 접근 실패: " + e.toString());
    Logger.log("💡 팁: 폴더 ID가 올바른지, 해당 폴더에 대한 쓰기 권한이 있는지 확인하세요.");
  }
}
