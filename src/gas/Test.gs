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

  // 2. Mock Data for checkDownloadHistory
  // DriveAccessService를 사용하도록 변경
  const rootId = DriveAccessService.getRootId();
  console.log(`📂 Root Folder ID: ${rootId}`);

  // 사용자 제공 폴더명으로 테스트
  const targetFolderName = "[16330182] 추방당한 전생 중기";

  // 3. Run checkDownloadHistory
  const mockData = {
    folderName: targetFolderName,
    id: "16330182",
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

    if (json.status === "success" && (!json.body || json.body.length === 0)) {
      console.warn("⚠️ Folder not found or empty via standard logic.");
      console.log("🕵️‍♂️ Starting GLOBAL SEARCH Diagnosis (ignoring parent)...");

      // Global Search
      const globalName = targetFolderName;
      const globalQ = `name = '${globalName.replace(
        /'/g,
        "\\'"
      )}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const globalRes = Drive.Files.list({
        q: globalQ,
        fields: "files(id, name, parents)",
      });

      if (globalRes.files && globalRes.files.length > 0) {
        console.log(`✅ FOUND GLOBAL MATCH! The folder exists somewhere.`);
        globalRes.files.forEach((f) => {
          console.log(`   - Name: ${f.name}`);
          console.log(`   - ID: ${f.id}`);
          console.log(`   - Parent IDs: ${JSON.stringify(f.parents)}`);
          if (f.parents && f.parents.includes(rootId)) {
            console.log(
              "   👉 STRANGE: Parent matches Root ID. Why did search fail?"
            );
          } else {
            console.log(
              `   ❌ Parent MISMATCH. Configured Root: ${rootId}, Actual Parent: ${
                f.parents ? f.parents[0] : "None"
              }`
            );
            console.log(
              "   👉 Solution: You might be looking in the wrong Root Folder."
            );
          }
        });
      } else {
        console.error(
          "❌ GLOBAL SEARCH FAILED. This folder does not exist anywhere with this exact name."
        );
      }
    }

    if (json.status === "success") {
      console.log("🎉 Test Passed: Logic executed successfully.");
    } else {
      console.error("⚠️ Test Finished with Error Response.");
    }
  } catch (e) {
    console.error("❌ Verification Failed (Crash): " + e.message);
    console.error(e.stack);
  }
}

/**
 * DriveAccessService 통합 테스트
 */
function TEST_DRIVE_ACCESS_SERVICE() {
  Debug.start();
  const rootId = DriveAccessService.getRootId();
  console.log(`Testing with rootId: ${rootId}`);

  const TEST_FOLDER_NAME = "_TokiSync_Test_Folder";
  const TEST_FILE_NAME = "test_blob.json";

  try {
    // 1. 폴더 생성 및 보장 테스트
    console.log("1. Testing ensureFolder...");
    const folderId = DriveAccessService.ensureFolder(rootId, TEST_FOLDER_NAME);
    const meta = DriveAccessService.getMetadata(folderId);
    console.log(`   - Created Folder: ${meta.name} (${folderId})`);

    // 2. 파일 생성 테스트
    console.log("2. Testing createFile...");
    const content = JSON.stringify({ test: "ok", time: new Date().toISOString() });
    const fileId = DriveAccessService.createFile(folderId, TEST_FILE_NAME, content, "application/json");
    console.log(`   - Created File ID: ${fileId}`);

    // 3. Testing getFileContent & getFileBytes
    console.log("3. Testing getFileContent & getFileBytes...");
    const readContent = DriveAccessService.getFileContent(fileId);
    const bytes = DriveAccessService.getFileBytes(fileId);
    console.log(`   - Content: ${readContent}`);
    console.log(`   - Bytes Length: ${bytes.length}`);

    // 4. move Test
    console.log("4. Testing move...");
    const subFolderId = DriveAccessService.ensureFolder(folderId, "SubFolder");
    DriveAccessService.move(fileId, folderId, subFolderId);
    const movedFiles = DriveAccessService.list(subFolderId);
    if (movedFiles.length === 0) throw new Error("Move failed");
    console.log("   ✅ Move successful");

    // 5. Cleanup (Trash)
    console.log("5. Cleanup (Trash)...");
    DriveAccessService.trash(fileId);
    DriveAccessService.trash(subFolderId);
    DriveAccessService.trash(folderId);
    console.log("   - Trash completed.");

    console.log("✅ ALL CORE DRIVE ACCESS TESTS PASSED.");
  } catch (e) {
    console.error("❌ Test Failed: " + e.toString());
  }
}
