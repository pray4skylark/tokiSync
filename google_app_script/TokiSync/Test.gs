function VERIFY_SCAN_LOGIC() {
  Debug.start();
  console.log("🧪 Starting Verification Test...");

  // 1. Check Advanced Drive Service
  try {
    const testList = Drive.Files.list({ pageSize: 1, fields: "files(id)" });
    console.log("✅ Advanced Drive Service (v3) is ACTIVE.");
  } catch (e) {
    console.error("❌ Advanced Drive Service is NOT working: " + e.message);
    console.log(
      "👉 appsscript.json 설정과 GAS 편집기 > 서비스 탭을 확인하세요."
    );
    return;
  }

  // 2. Discover Real Folders (to prove permissions)
  const rootId = DriveApp.getRootFolder().getId();
  console.log(`📂 Root Folder ID: ${rootId}`);

  let targetFolderName = "Non_Existent_Folder_For_Test"; // 기본값 (실패 테스트용)

  try {
    console.log("👀 Listing first 5 folders in Root to verify permissions...");
    const children = Drive.Files.list({
      q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      pageSize: 5,
      fields: "files(id, name)",
    });

    if (children.files && children.files.length > 0) {
      console.log(`✅ Found ${children.files.length} folders in Root:`);
      children.files.forEach((f) =>
        console.log(`   - Found: [${f.name}] (${f.id})`)
      );

      // 사용자 편의: 실제 존재하는 폴더 하나를 테스트 대상으로 자동 선택
      targetFolderName = children.files[0].name;
      console.log(`🎯 Auto-selected target for test: "${targetFolderName}"`);
    } else {
      console.warn("⚠️ No folders found in Root. Using dummy name.");
    }
  } catch (e) {
    console.error("❌ Failed to list root children: " + e.message);
  }

  // 3. Run checkDownloadHistory
  const mockData = {
    folderName: targetFolderName,
    id: "00000",
  };

  console.log(`🔎 Running checkDownloadHistory for "${targetFolderName}"...`);
  try {
    // 실제 함수 호출
    const result = checkDownloadHistory(mockData, rootId);
    const json = JSON.parse(result.getContent());

    console.log("✅ Result Status: " + json.status);
    console.log("📝 Body (Found Items): " + JSON.stringify(json.body));

    console.log("📜 [Server Debug Logs] --------------------");
    if (json.debugLogs) {
      json.debugLogs.forEach((l) => console.log(l));
    } else {
      console.warn("⚠️ No debug logs returned.");
    }
    console.log("------------------------------------------");

    if (json.status === "success") {
      console.log("🎉 Test Passed: Logic executed successfully.");
      if (Array.isArray(json.body)) {
        console.log(`📚 Found ${json.body.length} episodes in folder.`);
      }
    } else {
      console.error("⚠️ Test Finished with Error Response.");
    }
  } catch (e) {
    console.error("❌ Verification Failed (Crash): " + e.message);
    console.error(e.stack);
  }
}
