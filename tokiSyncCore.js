// 🚀 TokiSync Core Logic v3.1.0-beta.251218.0004
// This script is loaded dynamically by the Loader.

window.TokiSyncCore = function (GM_context) {
    'use strict';

    // #region [0. 초기화 및 권한 확보]
    // Loader에서 전달받은 GM 함수들을 Core 스코프로 가져옵니다.
    const GM_registerMenuCommand = GM_context.GM_registerMenuCommand;
    const GM_xmlhttpRequest = GM_context.GM_xmlhttpRequest;
    const GM_setValue = GM_context.GM_setValue;
    const GM_getValue = GM_context.GM_getValue;
    const GM_deleteValue = GM_context.GM_deleteValue;
    const GM_addValueChangeListener = GM_context.GM_addValueChangeListener;
    const JSZip = GM_context.JSZip;
    const PROTOCOL_VERSION = 3; // Major Version (Server Compatibility)
    const SCRIPT_NAME = "TokiSync Core";
    const CLIENT_VERSION = "v1.1.2"; // Fix: Loop robustness
    const LOG_PREFIX = `[${SCRIPT_NAME}]`;

    // [New] 호환성 체크: Core가 요구하는 최소 로더 버전 확인
    const MIN_LOADER_VERSION = "v1.1.2";
    const currentLoaderVer = GM_context.loaderVersion || "1.0.0"; // 없을 경우 구버전 간주

    if (currentLoaderVer < MIN_LOADER_VERSION) {
        console.error(`❌ Loader is outdated! (Current: ${currentLoaderVer}, Required: ${MIN_LOADER_VERSION})`);
        alert(`[TokiSync] 로더 업데이트가 필요합니다!\n\n현재 로더 버전이 낮아 새로운 기능을 실행할 수 없습니다.\nTampermonkey에서 스크립트 업데이트를 진행해주세요.\n(현재: ${currentLoaderVer} / 필요: ${MIN_LOADER_VERSION})`);
        return; // Core 실행 중단
    }

    console.log(`🚀 TokiSync ${CLIENT_VERSION} Loaded (Remote)`);

    // #region [1. 설정 및 상수] ====================================================
    const CFG_URL_KEY = "TOKI_GAS_URL";
    const CFG_DASH_KEY = "TOKI_DASH_URL";
    const CFG_FOLDER_ID = "TOKI_FOLDER_ID";
    const CFG_DEBUG_KEY = "TOKI_DEBUG_MODE";
    const CFG_AUTO_SYNC_KEY = "TOKI_AUTO_SYNC";
    const CFG_CONFIG_VER = "TOKI_CONFIG_VER"; // [NEW] 설정 버전 관리
    const CURRENT_CONFIG_VER = 1; // v3.0.0 초기 버전

    // 🚀 v3.0.0-beta.251211 New Deployment URLs (Fixed ID Strategy)
    const DEFAULT_API_URL = ""; // 설정값에서 로드됨
    const DEFAULT_DASH_URL = "https://pray4skylark.github.io/tokiSync/"; // @25

    function getConfig() {
        return {
            url: GM_getValue(CFG_URL_KEY, DEFAULT_API_URL),
            dashUrl: GM_getValue(CFG_DASH_KEY, DEFAULT_DASH_URL),
            // key: GM_getValue(CFG_SECRET_KEY, ""), // Removed
            folderId: GM_getValue(CFG_FOLDER_ID, ""),
            debug: GM_getValue(CFG_DEBUG_KEY, false)
        };
    }

    function migrateConfig() {
        const savedVer = GM_getValue(CFG_CONFIG_VER, 0);
        if (savedVer < CURRENT_CONFIG_VER) {
            console.log(`♻️ Migrating config from v${savedVer} to v${CURRENT_CONFIG_VER}`);

            // v3.0.0 Migration: Clear old API URL & Key to force new defaults
            GM_deleteValue(CFG_URL_KEY);
            // GM_deleteValue(CFG_SECRET_KEY); // Removed
            GM_deleteValue(CFG_FOLDER_ID);

            GM_setValue(CFG_CONFIG_VER, CURRENT_CONFIG_VER);

            alert("TokiSync v3.0 업데이트: 설정을 초기화했습니다.\n새로운 서버 연결을 위해 설정을 다시 진행해주세요.");
            location.reload();
        }
    }
    migrateConfig();

    const MAX_UPLOAD_CONCURRENCY = 2;
    const MAX_IMG_CONCURRENCY = 5;
    // [Updated] Category-specific intervals
    const WAIT_WEBTOON_MS = 3000; // Image content (naturally slow due to img processing)
    const WAIT_NOVEL_MS = 8000;   // Text content (too fast, needs longer delay)
    // const WAIT_PER_EPISODE_MS = 3000; // Deprecated
    const WAIT_PER_BATCH_MS = 500;
    const CHUNK_SIZE = 20 * 1024 * 1024;

    let site = '뉴토끼';
    let protocolDomain = 'https://newtoki469.com';
    let workId = '00000';

    const currentURL = document.URL;
    const bookMatch = currentURL.match(/^https:\/\/booktoki[0-9]+\.com\/novel\/([0-9]+)/);
    const newMatch = currentURL.match(/^https:\/\/newtoki[0-9]+\.com\/webtoon\/([0-9]+)/);
    const manaMatch = currentURL.match(/^https:\/\/manatoki[0-9]+\.net\/comic\/([0-9]+)/);

    let detectedCategory = "Webtoon"; // Default
    if (bookMatch) { site = "북토끼"; protocolDomain = currentURL.match(/^https:\/\/booktoki[0-9]+\.com/)[0]; workId = bookMatch[1]; detectedCategory = "Novel"; }
    else if (newMatch) { site = "뉴토끼"; protocolDomain = currentURL.match(/^https:\/\/newtoki[0-9]+\.com/)[0]; workId = newMatch[1]; detectedCategory = "Webtoon"; }
    else if (manaMatch) { site = "마나토끼"; protocolDomain = currentURL.match(/^https:\/\/manatoki[0-9]+\.net/)[0]; workId = manaMatch[1]; detectedCategory = "Manga"; }
    else { return; }
    // #endregion


    // #region [2. 유틸리티 함수] ====================================================
    function log(msg, type = 'info') {
        const config = getConfig();
        if (config.debug || type === 'error') {
            console.log(`[TokiSync][${type.toUpperCase()}] ${msg}`);
        }
    }

    function getDetailInfo() {
        let author = "", category = "", status = "", thumbnail = "";
        try {
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) thumbnail = ogImage.content;

            const textNodes = document.body.innerText.split('\n');
            textNodes.forEach(line => {
                if (line.includes("작가 :")) author = line.replace("작가 :", "").trim();
                if (line.includes("분류 :")) category = line.replace("분류 :", "").trim();
                if (line.includes("발행구분 :")) status = line.replace("발행구분 :", "").trim();
            });
        } catch (e) { }
        return { author, category, status, thumbnail };
    }

    function getSeriesInfo() {
        const metaSubject = document.querySelector('meta[name="subject"]');
        const pageDesc = document.querySelector('.page-desc');
        const metaTitle = document.querySelector('meta[property="og:title"]');

        let fullTitle = "Unknown";
        if (metaSubject) fullTitle = metaSubject.content.trim();
        else if (pageDesc) fullTitle = pageDesc.innerText.trim();
        else if (metaTitle) fullTitle = metaTitle.content.split('>')[0].split('|')[0].trim();

        let cleanTitle = fullTitle.replace(/[\\/:*?"<>|]/g, "");
        if (cleanTitle.length > 15) cleanTitle = cleanTitle.substring(0, 15).trim();

        const details = getDetailInfo();
        // Override category with strictly detected one
        return { fullTitle, cleanTitle, id: workId, ...details, category: detectedCategory };
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
        return window.btoa(binary);
    }

    function urlToBase64(url) {
        return new Promise((resolve, reject) => {
            if (!url) return resolve("");
            if (url.startsWith("//")) url = "https:" + url;

            log(`🖼️ 썸네일 다운로드 시도: ${url}`);

            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                responseType: "blob",
                headers: { "Referer": document.URL, "Origin": window.location.origin },
                timeout: 10000,
                onload: (res) => {
                    if (res.status === 200) {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = () => resolve("");
                        reader.readAsDataURL(res.response);
                    } else resolve("");
                },
                onerror: () => resolve(""),
                ontimeout: () => resolve("")
            });
        });
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function getDynamicWait(base) { return Math.floor(Math.random() * (base * 0.2 + 1)) + base; }

    async function createEpub(zip, title, author, textContent) {
        // 1. Mimetype (Must be first, uncompressed)
        zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

        // 2. Container
        zip.file("META-INF/container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

        // 3. Content (XHTML)
        const escapedText = textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const htmlBody = escapedText.split('\n').map(line => `<p>${line}</p>`).join('');
        const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title></head>
<body>
<h1>${title}</h1>
${htmlBody}
</body></html>`;
        zip.file("OEBPS/Text/chapter.xhtml", xhtml);

        // 4. OPF
        const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${title}</dc:title>
    <dc:creator opf:role="aut">${author}</dc:creator>
    <dc:language>ko</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="chapter" href="Text/chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter"/>
  </spine>
</package>`;
        zip.file("OEBPS/content.opf", opf);

        // 5. NCX (Minimal)
        const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:12345"/></head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
    <navPoint id="navPoint-1" playOrder="1">
      <navLabel><text>${title}</text></navLabel>
      <content src="Text/chapter.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;
        zip.file("OEBPS/toc.ncx", ncx);
    }

    function checkAuthRequired(responseText) {
        if (responseText && responseText.trim().startsWith("<") && (responseText.includes("google.com") || responseText.includes("Google Accounts"))) {
            alert("⚠️ 구글 권한 승인이 필요합니다.\n확인을 누르면 새 창이 열립니다.\n권한을 승인(로그인 -> 허용)한 뒤, 다시 시도해주세요.");
            window.open(getConfig().url, '_blank');
            return true;
        }
        return false;
    }
    // #endregion


    // #region [3. UI 및 상태 관리] ==================================================
    // function fetchSecretKey(folderId) { ... } // Removed

    async function openSettings() {
        const currentConfig = getConfig();

        // 1. 폴더 ID 입력 (가장 중요)
        const folderIdInput = prompt("1. 구글 드라이브 폴더 ID 입력 (필수):", currentConfig.folderId);
        if (folderIdInput === null) return;
        const folderId = folderIdInput.trim();

        if (!folderId) {
            alert("폴더 ID는 필수입니다.");
            return;
        }

        GM_setValue(CFG_FOLDER_ID, folderId);
        alert(`✅ 설정 완료!\nFolder ID: ${folderId}`);

        // 2. 고급 설정 (URL 변경 - 선택 사항 -> 필수 사항)
        if (confirm("API 서버 URL 설정을 진행하시겠습니까?\n(뷰어 자동 연결을 위해선 필수입니다)")) {
            const apiUrlInput = prompt("API 서버 URL:", currentConfig.url);
            if (apiUrlInput) GM_setValue(CFG_URL_KEY, apiUrlInput.trim());

            const dashUrlInput = prompt("대시보드 URL:", currentConfig.dashUrl);
            if (dashUrlInput) GM_setValue(CFG_DASH_KEY, dashUrlInput.trim());
        }
    }

    function toggleDebugMode() {
        const current = GM_getValue(CFG_DEBUG_KEY, false);
        const next = !current;
        GM_setValue(CFG_DEBUG_KEY, next);
        if (confirm(`🐞 디버그 모드: ${next ? "ON" : "OFF"}\n메뉴 갱신을 위해 새로고침 하시겠습니까?`)) {
            location.reload();
        }
    }

    async function checkConfig() {
        const config = getConfig();

        // 키가 없으면 설정 유도 -> 폴더 ID가 없으면 설정 유도
        if (!config.folderId) {
            if (confirm("⚠️ 초기 설정이 필요합니다.\n구글 드라이브 폴더 ID를 입력하시겠습니까?")) {
                await openSettings();
                return !!getConfig().folderId; // 설정 후 다시 확인
            }
            return false;
        }
        return true;
    }

    async function openDashboard() {
        let config = getConfig();
        
        if (!config.dashUrl) {
            alert("⚠️ 대시보드 URL이 설정되지 않았습니다.");
            return;
        }

        // [Safety Check] Ensure API URL exists for injection
        if (!config.url) {
            if(confirm("⚠️ API URL이 설정되지 않았습니다.\n뷰어 자동 연결 기능이 작동하지 않습니다.\n지금 설정하시겠습니까?")) {
                await openSettings();
                config = getConfig(); // Reload
                if(!config.url) {
                     if(!confirm("여전히 API URL이 없습니다. 그래도 여시겠습니까?")) return;
                }
            }
        }
        
        // Open Viewer
        const newWindow = window.open(config.dashUrl, '_blank');
        
        // Zero-Config Injection
        if (newWindow && config.url && config.folderId) {
            // Extract DeployID from URL
            let deployId = "";
            const match = config.url.match(/\/s\/([^\/]+)\/exec/);
            if (match) deployId = match[1];

            // Send Config message repeatedly (just in case it loads slowly)
            let tries = 0;
            const timer = setInterval(() => {
                newWindow.postMessage({
                    type: 'TOKI_CONFIG',
                    url: config.url,
                    folderId: config.folderId,
                    deployId: deployId
                }, "*"); // Target Origin: Allow all (Viewer is usually Github Pages)
                
                tries++;
                if(tries > 5) clearInterval(timer);
                console.log(`📡 Config Injection Sent (${tries}/5)`);
            }, 1000);
        }
    }

    function initStatusUI() {
        const oldUI = document.getElementById('tokiStatusDisplay');
        if (oldUI) oldUI.remove();
        const statusUI = document.createElement('div');
        statusUI.id = 'tokiStatusDisplay';
        statusUI.style.cssText = "position:fixed; bottom:20px; right:20px; background:rgba(0,0,0,0.8); color:white; padding:15px; border-radius:10px; z-index:99999; font-family:sans-serif; font-size:14px; max-width:300px;";
        const config = getConfig();
        const debugBadge = config.debug ? '<span style="color:yellow; font-weight:bold;">[DEBUG]</span> ' : '';
        statusUI.innerHTML = `
            <button id="tokiCloseBtn" style="position:absolute; top:5px; right:5px; background:none; border:none; color:white; font-weight:bold; cursor:pointer;">X</button>
            <p id="tokiStatusText" style="margin:0 0 10px 0;">${debugBadge}준비 중...</p>
            <button id="tokiAudioBtn" style="display:none; width:100%; margin-bottom:5px; padding:8px; background:#ff5252; color:white; border:none; border-radius:5px; cursor:pointer;">🔊 백그라운드 켜기 (필수)</button>
            <button id="tokiResumeButton" style="display:none; width:100%; padding:8px; background:#4CAF50; color:white; border:none; border-radius:5px; cursor:pointer;">캡차 해결 완료</button>
        `;
        document.body.appendChild(statusUI);
        document.getElementById('tokiCloseBtn').onclick = () => statusUI.remove();
    }

    function updateStatus(msg) {
        const el = document.getElementById('tokiStatusText');
        if (el) {
            const config = getConfig();
            const debugBadge = config.debug ? '<span style="color:yellow; font-weight:bold;">[DEBUG]</span> ' : '';
            el.innerHTML = debugBadge + msg;
        }
        log(msg.replace(/<[^>]*>/g, ''));
    }

    function setListItemStatus(li, message, bgColor = '#fff9c4', textColor = '#d32f2f') {
        if (!li) return;
        if (!li.classList.contains('toki-downloaded')) li.style.backgroundColor = bgColor;
        const link = li.querySelector('a');
        if (!link) return;
        let s = link.querySelector('.toki-status-msg');
        if (!s) {
            s = document.createElement('span');
            s.className = 'toki-status-msg';
            s.style.fontSize = '12px'; s.style.fontWeight = 'bold'; s.style.marginLeft = '10px';
            link.appendChild(s);
        }
        s.innerText = message; s.style.color = textColor;
    }

    function markDownloadedItems() {
        const info = getSeriesInfo();
        const historyKey = `history_${info.id}`;
        const history = GM_getValue(historyKey, []);
        const listItems = document.querySelectorAll('.list-body .list-item');
        listItems.forEach(li => {
            const numElement = li.querySelector('.wr-num');
            if (!numElement) return;
            const num = parseInt(numElement.innerText.trim());
            if (history.includes(num)) {
                if (!li.classList.contains('toki-downloaded')) {
                    li.classList.add('toki-downloaded');
                    li.style.backgroundColor = '#e0e0e0'; li.style.opacity = '0.6';
                    const link = li.querySelector('a');
                    if (link && !link.querySelector('.toki-mark')) {
                        const checkMark = document.createElement('span');
                        checkMark.innerText = " ✅ 다운완료";
                        checkMark.className = 'toki-mark'; checkMark.style.color = "green"; checkMark.style.fontWeight = "bold"; checkMark.style.marginLeft = "5px";
                        link.appendChild(checkMark);
                    }
                }
            }
        });
    }
    // #endregion


    // #region [4. 오디오 엔진] ======================================================
    let audioContext = null;
    let audioEl = null;

    function startSilentAudio() {
        if (audioContext && audioContext.state === 'running') return;
        try {
            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') audioContext.resume();

            const oscillator = audioContext.createOscillator();
            const dest = audioContext.createMediaStreamDestination();
            const gain = audioContext.createGain();
            oscillator.frequency.value = 1; oscillator.type = 'sine'; gain.gain.value = 0.001;
            oscillator.connect(gain); gain.connect(dest); oscillator.start();

            if (!audioEl) {
                audioEl = document.createElement('audio');
                audioEl.style.display = "none";
                document.body.appendChild(audioEl);
            }
            audioEl.srcObject = dest.stream;
            const playPromise = audioEl.play();
            if (playPromise) {
                playPromise.then(() => { log("🔊 Audio Started"); updateAudioUI(true); })
                    .catch(e => { console.warn("🚫 Autoplay Blocked:", e); updateAudioUI(false); });
            }
        } catch (e) { console.error(e); }
    }

    function stopSilentAudio() {
        try {
            if (audioEl) { audioEl.pause(); audioEl.srcObject = null; }
            if (audioContext) { audioContext.close().then(() => audioContext = null); console.log("🔇 Audio Stopped"); }
        } catch (e) { }
    }

    function updateAudioUI(isPlaying) {
        const btn = document.getElementById('tokiAudioBtn');
        if (!btn) return;
        if (isPlaying) { btn.style.display = 'none'; }
        else { btn.style.display = 'block'; btn.onclick = () => startSilentAudio(); }
    }
    // #endregion


    // #region [5. 네트워크 & 업로드 모듈] ===========================================
    function fetchHistoryFromCloud() {
        return new Promise((resolve, reject) => {
            const config = getConfig();
            if (!config.url) { markDownloadedItems(); resolve([]); return; }
            const info = getSeriesInfo();
            const payload = { 
            folderId: config.folderId, 
            type: 'check_history', 
            protocolVersion: 3, 
            clientVersion: CLIENT_VERSION, 
            category: info.category, // [New]
            folderName: `[${info.id}] ${info.cleanTitle}` 
        };
            updateStatus("☁️ 드라이브 파일 스캔 중...");
            GM_xmlhttpRequest({
                method: "POST", url: config.url, data: JSON.stringify(payload), headers: { "Content-Type": "text/plain" },
                onload: (res) => {
                    if (res.status === 200) {
                        if (checkAuthRequired(res.responseText)) { resolve([]); return; }
                        try {
                            const json = JSON.parse(res.responseText);
                            
                            // [New] 서버 디버그 로그 출력
                            if (json.debugLogs && Array.isArray(json.debugLogs)) {
                                console.groupCollapsed("🔍 [Server Debug Log] Drive Scan Trace");
                                json.debugLogs.forEach(l => console.log(l));
                                console.groupEnd();
                            }

                            const cloudHistory = Array.isArray(json.body) ? json.body : [];
                            
                            // [VERIFICATION DEBUG]
                            console.log(`🔍 [VERIFY] Full Server Response:`, json);
                            if (json.debugLogs) {
                                console.group("Start Server Side Logs");
                                json.debugLogs.forEach(log => console.log(`[SERVER] ${log}`));
                                console.groupEnd();
                            }

                            if (cloudHistory.length === 0) {
                                console.warn("⚠️ Received EMPTY history. Folder may not be found or empty.");
                                // alert(`[TokiSync 검증] 서버 응답이 비어있습니다!\n폴더를 찾지 못했거나, 파일이 하나도 없습니다.\n(ID: ${info.id})`);
                            } else {
                                console.log(`✅ Received ${cloudHistory.length} items from server.`);
                                // alert(`[TokiSync 검증] 성공!\n서버에서 ${cloudHistory.length}개의 파일을 확인했습니다.`);
                            }

                            const historyKey = `history_${info.id}`;
                            GM_setValue(historyKey, cloudHistory);
                            markDownloadedItems();
                            resolve(cloudHistory);
                        } catch (e) { resolve([]); }
                    } else resolve([]);
                },
                onerror: () => resolve([])
            });
        });
    }

    async function saveInfoJson(forceThumbnailUpdate = false) {
        return new Promise(async (resolve) => {
            const config = getConfig();
            if (!config.url) { resolve(); return; }
            const info = getSeriesInfo();

            const historyKey = `history_${info.id}`;
            const history = GM_getValue(historyKey, []);
            const lastEpisode = history.length > 0 ? Math.max(...history) : 0;
            const fileCount = history.length;

            // [Opt] Do NOT send Base64 Thumbnail in JSON
            // Instead, we will upload it as 'cover.jpg' via separate logic if needed
            
            const payload = {
                folderId: config.folderId, 
                type: 'save_info', 
                protocolVersion: 3,
                clientVersion: CLIENT_VERSION, 
                folderName: `[${info.id}] ${info.cleanTitle}`,
                id: info.id, title: info.fullTitle, url: document.URL, site: site,
                author: info.author, category: info.category, status: info.status, 
                thumbnail: info.thumbnail, // Just URL
                thumbnail_file: true, // Signal to server that we use cover.jpg
                last_episode: lastEpisode,
                file_count: fileCount
            };
            
            GM_xmlhttpRequest({
                method: "POST", url: config.url, data: JSON.stringify(payload), headers: { "Content-Type": "text/plain" },
                onload: async (res) => {
                    if (!checkAuthRequired(res.responseText)) {
                        // Trigger Cover Upload if needed
                        if (forceThumbnailUpdate && info.thumbnail) {
                            await ensureCoverUpload(info.thumbnail, `[${info.id}] ${info.cleanTitle}`, info.category);
                        }
                        resolve();
                    }
                    else resolve(); 
                },
                onerror: () => resolve()
            });
        });
    }

    async function ensureCoverUpload(thumbnailUrl, folderName, category) {
        if (!thumbnailUrl.startsWith('http')) return;
        try {
            updateStatus("🖼️ 표지(cover.jpg) 업로드 중...");
            // URL -> Blob
            const blob = await new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: "GET", url: thumbnailUrl, responseType: "blob", headers: { "Referer": document.URL },
                    onload: (res) => resolve(res.status === 200 ? res.response : null),
                    onerror: () => resolve(null)
                });
            });
            
            if (blob) {
                // Re-use uploadResumable but with category info
                // We need to pass category to uploadResumable somehow, or update it
                // Actually uploadResumable accepts (blob, folderName, fileName, category) <- We need to update signature
                await uploadResumable(blob, folderName, "cover.jpg", category); 
            }
        } catch(e) {
            console.warn("Cover Upload Failed", e);
        }
    }

    function updateLocalHistory(episodeNum) {
        const info = getSeriesInfo();
        const historyKey = `history_${info.id}`;
        let history = GM_getValue(historyKey, []);
        if (!history.includes(episodeNum)) {
            history.push(episodeNum);
            history.sort((a, b) => a - b);
            GM_setValue(historyKey, history);
        }
        markDownloadedItems();
    }

    async function uploadResumable(blob, folderName, fileName) {
        const config = getConfig();
        if (!config.url) throw new Error("URL 미설정");
        const totalSize = blob.size;
        let uploadUrl = "";
        let seriesFolderId = ""; // [New] Captured from Init Response
        await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST", url: config.url,
                data: JSON.stringify({ 
                    folderId: config.folderId, 
                    type: "init", 
                    protocolVersion: 3, // [New] Major Protocol Version
                    clientVersion: CLIENT_VERSION, 
                    folderName: folderName, 
                    fileName: fileName,
                    category: arguments[3] // Pass Category from 4th arg
                }),
                headers: { "Content-Type": "text/plain" },
                onload: (res) => {
                    if (checkAuthRequired(res.responseText)) {
                        reject(new Error("권한 승인 필요"));
                        return;
                    }
                    try {
                        const json = JSON.parse(res.responseText);
                        if (json.status === 'success') { 
                            // [Updated] Handle Object Response (Url + FolderId)
                            if (typeof json.body === 'object') {
                                uploadUrl = json.body.uploadUrl;
                                seriesFolderId = json.body.folderId;
                            } else {
                                uploadUrl = json.body; // Backward compatibility
                            }
                            resolve(); 
                        }
                        else reject(new Error(json.body));
                    } catch (e) { reject(new Error("GAS 응답 오류")); }
                },
                onerror: (e) => reject(e)
            });
        });

        let start = 0;
        const buffer = await blob.arrayBuffer();
        while (start < totalSize) {
            const end = Math.min(start + CHUNK_SIZE, totalSize);
            const chunkBuffer = buffer.slice(start, end);
            const chunkBase64 = arrayBufferToBase64(chunkBuffer);
            const percentage = Math.floor((end / totalSize) * 100);
            const el = document.getElementById('tokiStatusText');
            if (el) el.innerHTML = `<strong>[${fileName}]</strong><br>업로드 중... ${percentage}%`;

            await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST", url: config.url,
                    data: JSON.stringify({ 
                        folderId: config.folderId, 
                        type: "upload", 
                        clientVersion: CLIENT_VERSION, // [New] API Version Check (Chunk는 생략 가능하지만 안전하게 추가)
                        uploadUrl: uploadUrl, 
                        chunkData: chunkBase64, 
                        start: start, end: end, total: totalSize 
                    }),
                    headers: { "Content-Type": "text/plain" },
                    onload: (res) => {
                        if (checkAuthRequired(res.responseText)) {
                            reject(new Error("권한 승인 필요"));
                            return;
                        }
                        try { const json = JSON.parse(res.responseText); if (json.status === 'success') resolve(); else reject(new Error(json.body)); } catch (e) { reject(e); }
                    },
                    onerror: (e) => reject(e)
                });
            });
            start = end;
        }
        updateStatus(`<strong>✅ 완료: ${fileName}</strong>`);
        return seriesFolderId; // [Fix] Return captured ID to caller
    }
    // #endregion


    // #region [6. 메인 로직 (tokiDownload)] =========================================
    async function tokiDownload(startIndex, lastIndex, targetNumbers = null) {
        const config = getConfig();
        const pauseForCaptcha = (iframe) => {
            return new Promise(resolve => {
                updateStatus("<strong>🤖 캡차/차단 감지!</strong><br>해결 후 버튼 클릭");
                iframe.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:80vw; height:80vh; background:white; z-index:99998;";
                const btn = document.getElementById('tokiResumeButton');
                btn.style.display = 'block';
                btn.onclick = () => {
                    iframe.style.cssText = "position:absolute; top:-9999px; left:-9999px; width:600px; height:600px;";
                    btn.style.display = 'none';
                    resolve();
                };
            });
        };

        try {
            let list = Array.from(document.querySelector('.list-body').querySelectorAll('li')).reverse();
            if (targetNumbers) list = list.filter(li => targetNumbers.includes(parseInt(li.querySelector('.wr-num').innerText)));
            else {
                if (startIndex) { while (list.length > 0 && parseInt(list[0].querySelector('.wr-num').innerText) < startIndex) list.shift(); }
                if (lastIndex) { while (list.length > 0 && parseInt(list.at(-1).querySelector('.wr-num').innerText) > lastIndex) list.pop(); }
            }
            if (list.length === 0) return;

            const info = getSeriesInfo();
            const targetFolderName = `[${info.id}] ${info.cleanTitle}`;

            await saveInfoJson(true); // Force cover update on start

            const iframe = document.createElement('iframe');
            iframe.id = 'tokiDownloaderIframe';
            iframe.style.cssText = "position:absolute; top:-9999px; left:-9999px; width:600px; height:600px;";
            document.querySelector('.content').prepend(iframe);
            const waitIframeLoad = (u) => new Promise(r => { iframe.src = u; iframe.onload = () => r(); });

            const activeUploads = new Set();

            for (let i = 0; i < list.length; i++) {
                const currentLi = list[i];
                // [Robustness] Wrap individual episode in try-catch
                try {
                const zip = new JSZip();
                const src = currentLi.querySelector('a').href;
                const numText = currentLi.querySelector('.wr-num').innerText.trim();
                const num = parseInt(numText);

                const epFullTitle = currentLi.querySelector('a').innerHTML.replace(/<span[\s\S]*?\/span>/g, '').trim();
                let epCleanTitle = epFullTitle.replace(info.fullTitle, '').trim();
                epCleanTitle = epCleanTitle.replace(/[\\/:*?"<>|]/g, '');
                let zipFileName = `${numText.padStart(4, '0')} - ${epCleanTitle}.cbz`;

                // ⭐️ 에러 발생 시 파일에 기록할 로그 배열
                let failedLog = [];

                setListItemStatus(currentLi, "⏳ 로딩 중...", "#fff9c4", "#d32f2f");
                updateStatus(`[${targetFolderName}]<br><strong>${epCleanTitle}</strong> (${i + 1}/${list.length}) 로딩...<br>현재 업로드 중: ${activeUploads.size}개`);

                await waitIframeLoad(src);
                
                // [Updated] Use Category-specific delay
                const delayBase = (site == "북토끼" || info.category === "Novel") ? WAIT_NOVEL_MS : WAIT_WEBTOON_MS;
                await sleep(getDynamicWait(delayBase));

                let iframeDocument = iframe.contentWindow.document;
                // ... 캡차 체크 로직 (생략) ...
                const isCaptcha = iframeDocument.querySelector('iframe[src*="hcaptcha"]') || iframeDocument.querySelector('.g-recaptcha') || iframeDocument.querySelector('#kcaptcha_image');
                const isCloudflare = iframeDocument.title.includes('Just a moment') || iframeDocument.getElementById('cf-challenge-running');
                const noContent = (site == "북토끼") ? !iframeDocument.querySelector('#novel_content') : false;
                const pageTitle = iframeDocument.title.toLowerCase();
                const bodyText = iframeDocument.body ? iframeDocument.body.innerText.toLowerCase() : "";
                const isError = pageTitle.includes("403") || pageTitle.includes("forbidden") || bodyText.includes("access denied");

                if (isCaptcha || isCloudflare || noContent || isError) {
                    await pauseForCaptcha(iframe);
                    await sleep(3000);
                    iframeDocument = iframe.contentWindow.document;
                }
                
                // [Robustness] Prevent script crash on single failure
                // try { <--- Removed broken try
                    if (site == "북토끼" || info.category === "Novel") {
                        const fileContent = iframeDocument.querySelector('#novel_content')?.innerText;
                         if (!fileContent) {
                             failedLog.push("Critial: Novel Content Not Found");
                             throw new Error("Novel Content Not Found");
                         }
                        // zip.file(`${num} ${epCleanTitle}.txt`, fileContent); // Legacy
                        await createEpub(zip, epCleanTitle, info.author || "Unknown", fileContent);
                        zipFileName = `${numText.padStart(4, '0')} - ${epCleanTitle}.epub`; // Change extension
                    } else {
                        let imgLists = Array.from(iframeDocument.querySelectorAll('.view-padding div img'));
                        for (let j = 0; j < imgLists.length;) { if (imgLists[j].checkVisibility() === false) imgLists.splice(j, 1); else j++; }
                        
                        if (imgLists.length === 0) {
                            // Retry once more after delay
                            await sleep(2000);
                            imgLists = Array.from(iframeDocument.querySelectorAll('.view-padding div img'));
                             if (imgLists.length === 0) {
                                 // Instead of crashing, upload checking log
                                 failedLog.push("CRITICAL: 0 Images Found (Captcha or Layout Change?)");
                                 throw new Error("이미지 0개 발견 (Skip)");
                             }
                        }

                        setListItemStatus(currentLi, `🖼️ 이미지 0/${imgLists.length}`, "#fff9c4", "#d32f2f");
                        updateStatus(`[${targetFolderName}]<br><strong>${epCleanTitle}</strong><br>이미지 ${imgLists.length}장 수집 중...`);
                        // ... Rest of image processing


                    const fetchAndAddToZip = (imgSrc, j, ext, retryCount = 3) => new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: "GET", url: imgSrc, responseType: "blob", timeout: 30000,
                            onload: (res) => {
                                if (res.status === 200) { zip.file(`image_${j.toString().padStart(4, '0')}${ext}`, res.response); resolve(); }
                                else {
                                    if (res.status === 404) {
                                        console.warn(`⚠️ 이미지 404 Skip: ${imgSrc}`);
                                        // ⭐️ 에러 로그에 추가
                                        failedLog.push(`[Image ${j + 1}] 404 Not Found: ${imgSrc}`);
                                        resolve();
                                    }
                                    else if (retryCount > 0) {
                                        setTimeout(() => fetchAndAddToZip(imgSrc, j, ext, retryCount - 1).then(resolve).catch(reject), 2000);
                                    } else reject(new Error(`HTTP ${res.status}`));
                                }
                            },
                            onerror: (e) => { if (retryCount > 0) setTimeout(() => fetchAndAddToZip(imgSrc, j, ext, retryCount - 1).then(resolve).catch(reject), 2000); else reject(new Error("Network Error")); },
                            ontimeout: () => { if (retryCount > 0) setTimeout(() => fetchAndAddToZip(imgSrc, j, ext, retryCount - 1).then(resolve).catch(reject), 2000); else reject(new Error("Timeout")); }
                        });
                    });

                    const BATCH_SIZE = MAX_IMG_CONCURRENCY;
                    for (let k = 0; k < imgLists.length; k += BATCH_SIZE) {
                        const batch = imgLists.slice(k, k + BATCH_SIZE);
                        const promises = batch.map((img, idx) => {
                            const globalIdx = k + idx;
                            let imgStart = img.outerHTML;
                            try {
                                let imgSrc = `${protocolDomain}${imgStart.match(/\/data[^"]+/)[0]}`;
                                let ext = imgSrc.match(/\.[a-zA-Z]+$/)[0];

                                // ⭐️ 에러 캐치 및 로그 저장
                                return fetchAndAddToZip(imgSrc, globalIdx, ext).catch(err => {
                                    if (config.debug) {
                                        throw err;
                                    } else {
                                        const errMsg = `[Image ${globalIdx + 1}] Error: ${err.message} (${imgSrc})`;
                                        console.error(errMsg);
                                        failedLog.push(errMsg); // 로그 추가
                                        return Promise.resolve();
                                    }
                                });
                            } catch (e) { return Promise.resolve(); }
                        });
                        await Promise.all(promises);
                        setListItemStatus(currentLi, `🖼️ 이미지 ${Math.min(k + BATCH_SIZE, imgLists.length)}/${imgLists.length}`, "#fff9c4", "#d32f2f");
                        await sleep(getDynamicWait(WAIT_PER_BATCH_MS));
                    }
                }

                // ⭐️ 누락 파일 로그가 있으면 텍스트 파일로 추가
                if (failedLog.length > 0) {
                    const logContent = `[TokiSync Error Log]\n\n${failedLog.join('\n')}`;
                    zip.file("!MISSING_FILES_LOG.txt", logContent);
                }

                setListItemStatus(currentLi, "📦 압축 중...", "#ffe0b2", "#e65100");
                const content = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 5 } });

                if (activeUploads.size >= MAX_UPLOAD_CONCURRENCY) {
                    updateStatus(`<strong>업로드 대기 중...</strong>`);
                    await Promise.race(activeUploads);
                }

                setListItemStatus(currentLi, "☁️ 업로드 중...", "#bbdefb", "#0d47a1");

                const uploadTask = uploadResumable(content, targetFolderName, zipFileName, info.category)
                    .then((seriesFolderId) => {
                        setListItemStatus(currentLi, "✅ 완료", "#e0e0e0", "green");
                        updateLocalHistory(parseInt(num));
                        
                        // [New] Cache Invalidation Trigger using captured seriesFolderId
                        if (seriesFolderId) {
                            const config = getConfig();
                            try {
                                GM_xmlhttpRequest({
                                    method: "POST", url: config.url,
                                    data: JSON.stringify({ 
                                        type: "view_refresh_cache", 
                                        folderId: config.folderId, // Root ID (Auth/Config)
                                        seriesId: seriesFolderId // Target Series ID
                                    }),
                                    headers: { "Content-Type": "text/plain" }
                                });
                                console.log(`🔄 Cache Refresh Triggered for: ${seriesFolderId}`);
                            } catch(e) {}
                        }
                    })
                    .catch(err => {
                        setListItemStatus(currentLi, "❌ 실패", "#ffcdd2", "#b71c1c");
                        alert(`업로드 실패: ${err.message}`);
                        throw err;
                    });

                const trackedTask = uploadTask.then(() => activeUploads.delete(trackedTask)).catch(() => activeUploads.delete(trackedTask));
                activeUploads.add(trackedTask);
                
                } catch (epError) {
                    console.error(`[Episode Error] ${epError.message}`);
                    setListItemStatus(currentLi, "❌ 실패 (Skip)", "#ffcdd2", "#b71c1c");
                    updateStatus(`⚠️ <strong>개별 항목 오류</strong>: ${epError.message}`);
                    // Continue to next episode
                }
            }

            if (activeUploads.size > 0) {
                updateStatus(`<strong>마무리 중... (${activeUploads.size}개)</strong>`);
                await Promise.all(activeUploads);
            }
            iframe.remove();
        } catch (error) {
            let errorMsg = error.message || error.toString();
            if (errorMsg === "[object Object]") try { errorMsg = JSON.stringify(error); } catch (e) { }

            if (getConfig().debug) {
                alert("🛑 [DEBUG] 오류 발생: " + errorMsg);
            }

            updateStatus("❌ 오류: " + errorMsg);
            document.getElementById('tokiDownloaderIframe')?.remove();
        }
    }

    // ... (메뉴 및 자동실행 코드) ...
    // #region [6. Queue System & Worker] ===========================================
    const QUEUE_KEY = "TOKI_QUEUE";
    const LOCK_KEY = "TOKI_WORKER_LOCK"; // { tabId, timestamp }
    const HEARTBEAT_KEY = "TOKI_WORKER_HEARTBEAT";
    const MY_TAB_ID = Date.now() + Math.random().toString().slice(2, 5);
    const LOCK_TIMEOUT = 10000; // 10초간 하트비트 없으면 락 해제

    // [New] 탭 닫힘 방지
    window.addEventListener('beforeunload', (e) => {
        const lock = GM_getValue(LOCK_KEY, null);
        if (lock && lock.tabId === MY_TAB_ID) {
            e.preventDefault();
            e.returnValue = '다운로드 중입니다! 창을 닫으면 작업이 중단됩니다.';
        }
    });

    const QueueManager = {
        getQueue: () => GM_getValue(QUEUE_KEY, []),
        setQueue: (q) => GM_setValue(QUEUE_KEY, q),
        enqueue: (task) => { // task: { id, title, url, episodes: [] }
            const q = QueueManager.getQueue();
            // 중복 체크 (같은 작품은 에피소드 병합하거나 무시)
            const existing = q.find(t => t.id === task.id);
            if (existing) {
                alert("이미 대기열에 있는 작품입니다.");
                return;
            }
            q.push(task);
            QueueManager.setQueue(q);
            updateStatus(`📝 대기열 등록 완료 (총 ${q.length}건)`);
        },
        peek: () => {
            const q = QueueManager.getQueue();
            return q.length > 0 ? q[0] : null;
        },
        dequeue: () => {
             const q = QueueManager.getQueue();
             const item = q.shift();
             QueueManager.setQueue(q);
             return item;
        }
    };

    const WorkerLock = {
        acquire: () => {
            const now = Date.now();
            const lock = GM_getValue(LOCK_KEY, null);
            
            // 락이 없거나, 타임아웃(좀비 프로세스)된 경우 획득
            if (!lock || (now - lock.timestamp > LOCK_TIMEOUT)) {
                GM_setValue(LOCK_KEY, { tabId: MY_TAB_ID, timestamp: now });
                return true;
            }
            // 내가 이미 락을 가지고 있는 경우 (갱신)
            if (lock.tabId === MY_TAB_ID) {
                GM_setValue(LOCK_KEY, { tabId: MY_TAB_ID, timestamp: now });
                return true;
            }
            return false;
        },
        release: () => {
            const lock = GM_getValue(LOCK_KEY, null);
            if (lock && lock.tabId === MY_TAB_ID) {
                GM_deleteValue(LOCK_KEY);
            }
        },
        amIWorker: () => {
            const lock = GM_getValue(LOCK_KEY, null);
            return lock && lock.tabId === MY_TAB_ID;
        }
    };

    // 하트비트 루프 (내가 워커일 때만 실행)
    setInterval(() => {
        if (WorkerLock.amIWorker()) {
            GM_setValue(LOCK_KEY, { tabId: MY_TAB_ID, timestamp: Date.now() });
        }
    }, 2000);

    // 큐 감시 및 처리 루프 (메인 엔진)
    async function startQueueProcessor() {
        console.log(`🕵️ Queue Processor Started (Tab: ${MY_TAB_ID})`);
        
        setInterval(async () => {
            // 1. 큐 확인
            const task = QueueManager.peek();
            if (!task) return; // 할 일 없음

            // 2. 락 시도
            if (!WorkerLock.acquire()) {
                // 누군가 작업 중임. 나는 대기.
                const lock = GM_getValue(LOCK_KEY);
                // updateStatus(`⏳ 다른 탭에서 다운로드 중... (Tab: ${lock?.tabId?.slice(-4)})`); 
                return; 
            }

            // 3. 작업 수행 (내가 워커)
            if (document.getElementById('tokiDownloaderIframe')) return; // 이미 실행 중

            // 3-1. 작업 시작 (큐에서 제거)
            const currentTask = QueueManager.dequeue();
            if (!currentTask) { WorkerLock.release(); return; }

            try {
                updateStatus(`🚀 <strong>[${currentTask.title}]</strong> 다운로드 시작`);
                
                // 페이지 이동 없이, iframe만 생성해서 처리해야 함.
                // 하지만 tokiDownload 함수는 현재 페이지 돔을 긁으므로, 
                // 1) 현재 페이지가 타겟 작품이면 바로 실행
                // 2) 아니면, 해당 페이지로 이동(reload) 후 자동 실행? -> 이러면 탭이 새로고침되면서 로직 초기화됨.
                
                // [해결책] tokiDownload는 "현재 페이지의 리스트"를 긁습니다.
                // 따라서, 큐 방식에서는 "메인 탭"이 워커 역할을 하려면 
                // "타겟 URL을 Iframe으로 열어서 그 내부에서 리스트를 파싱" 하거나
                // "현재 탭을 해당 URL로 이동" 시켜야 합니다.
                
                // 사용자가 "현재 탭"을 뷰어 용도로 쓰고 있다면 이동하면 안됨.
                // 하지만 TokiSync는 보통 "만화 목록 페이지"에서 실행됨.
                // 큐 로직은 "이어받기" 개념이므로, 현재 탭을 이동시키는 것이 가장 확실함.
                
                if (window.location.href !== currentTask.url) {
                    updateStatus(`🔄 작업 처리를 위해 페이지 이동 중...`);
                    await sleep(1000);
                    // 락 유지한 채로 이동 -> 이동 후 로드되면 큐 확인해서 작업 재개
                    // 이동 시 락이 끊길 수 있으므로, sessionStorage 등에 "작업 중" 플래그 필요?
                    // -> 아니다, 락은 GM 저장소에 있고, 새 페이지 로드 시 락 타임아웃 전에 acquire하면 됨.
                    window.location.href = currentTask.url; 
                    return; 
                }

                // URL이 일치하면 다운로드 시작
                startSilentAudio();
                initStatusUI();
                await tokiDownload(null, null, currentTask.episodes.length > 0 ? currentTask.episodes : null);
                
                // 작업 완료 후 락 해제 -> 다음 턴에 다음 작업 가져옴
                alert(`[${currentTask.title}] 완료! 대기열을 확인합니다.`);
                WorkerLock.release(); 
                stopSilentAudio();


            } catch (e) {
                console.error(e);
                updateStatus(`❌ 오류 발생: ${e.message}`);
                WorkerLock.release(); // 에러 시 락 해제
                stopSilentAudio();
            }

        }, 5000); // 5초마다 체크
    }
    
    // 페이지 로드 시 자동 실행 (큐 확인)
    startQueueProcessor();

    // #endregion

    async function autoSyncDownloadManager() {
        if (!await checkConfig()) return;
        
        // [Refactor] 즉시 실행 대신 큐에 등록
        const info = getSeriesInfo();
        const history = await fetchHistoryFromCloud();
        
        const allListItems = Array.from(document.querySelector('.list-body').querySelectorAll('li')).reverse();
        const missingEpisodes = [];
        allListItems.forEach(li => {
            const num = parseInt(li.querySelector('.wr-num').innerText);
            if (!history.includes(num)) missingEpisodes.push(num);
        });

        if (missingEpisodes.length === 0) {
            alert("이미 최신 상태입니다.");
            return;
        }

        const task = {
            id: info.id,
            title: info.cleanTitle,
            url: window.location.href, // 중요: 재방문을 위해 URL 저장
            episodes: missingEpisodes,
            addedAt: Date.now()
        };

        QueueManager.enqueue(task);
        // 등록 후 프로세서는 startQueueProcessor()에 의해 돎
    }

    async function batchDownloadManager() {
        if (!await checkConfig()) return;
        startSilentAudio(); initStatusUI();
        await saveInfoJson();
        const s = prompt('시작?'); if (!s) return;
        const e = prompt('끝?'); if (!e) return;
        try { await tokiDownload(parseInt(s), parseInt(e)); updateStatus("작업 완료!"); alert("완료"); } catch (e) { console.error(e); }
        finally { stopSilentAudio(); setTimeout(() => document.getElementById('tokiStatusDisplay')?.remove(), 5000); }
    }

    // 초기화 함수
    function init() {
        markDownloadedItems();
        fetchHistoryFromCloud();

        // ⚡️ [Viewer Optimization] Inject Config to Viewer Storage directly
        // This solves the race condition where main.js runs before postMessage arrives.
        if (location.host.includes("github.io") && location.pathname.includes("tokiSync")) {
            const config = getConfig();
            if (config.url && config.folderId) {
                // Determine if it's safe to inject (Non-empty, non-default if default was bad)
                console.log("⚡️ [TokiSync Loader] Injecting Config into Viewer LocalStorage...");
                localStorage.setItem('TOKI_API_URL', config.url);
                localStorage.setItem('TOKI_ROOT_ID', config.folderId);
                
                // Optional: Trigger a reload if main.js already failed?
                // But better: main.js reads localStorage on load. 
                // Since this script runs at document-end, it might be slightly late if main.js is async.
                // But usually, main.js waits for DOMContentLoaded.
            }
        }

        // ⚡️ 원격 실행 감지 (TokiView -> Client)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('toki_action') === 'sync') {
            console.log("⚡️ Remote Action Detected: Auto Sync");
            // 페이지 로드 완료 후 실행 보장
            if (document.readyState === 'complete') {
                autoSyncDownloadManager();
            } else {
                window.addEventListener('load', () => autoSyncDownloadManager());
            }
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('load', init);
    }

    async function manualDownloadManager() {
        if (!await checkConfig()) return;
        startSilentAudio(); initStatusUI();
        saveInfoJson().then(() => {
            const s = prompt('시작?', 1); if (!s) return;
            const e = prompt('끝?', s); if (!e) return;
            tokiDownload(s, e).finally(() => { stopSilentAudio(); setTimeout(() => document.getElementById('tokiStatusDisplay')?.remove(), 5000); });
        });
    }

    // #endregion

    // [New] Core API Return
    return {
        autoSyncDownloadManager,
        batchDownloadManager,
        manualDownloadManager,
        openDashboard,
        openSettings,
        toggleDebugMode
    };
};
