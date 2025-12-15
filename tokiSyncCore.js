// 🚀 TokiSync Core Logic v3.0.0-beta.251215.0002
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
    const JSZip = GM_context.JSZip;
    const PROTOCOL_VERSION = 3; // Major Version (Server Compatibility)
    const CLIENT_VERSION = "3.0.0-beta.251215.0003"; // Build Version

    // [New] 호환성 체크: Core가 요구하는 최소 로더 버전 확인
    const MIN_LOADER_VERSION = "3.0.0-beta.251215.0002";
    const currentLoaderVer = GM_context.loaderVersion || "2.0.0"; // 없을 경우 구버전 간주

    if (currentLoaderVer < MIN_LOADER_VERSION) {
        console.error(`❌ Loader is outdated! (Current: ${currentLoaderVer}, Required: ${MIN_LOADER_VERSION})`);
        alert(`[TokiSync] 로더 업데이트가 필요합니다!\n\n현재 로더 버전이 낮아 새로운 기능을 실행할 수 없습니다.\nTampermonkey에서 스크립트 업데이트를 진행해주세요.\n(현재: ${currentLoaderVer} / 필요: ${MIN_LOADER_VERSION})`);
        return; // Core 실행 중단
    }

    console.log("🚀 TokiSync Core v3.0.0-beta.251215.0002 Loaded (Remote)");

    // #region [1. 설정 및 상수] ====================================================
    const CFG_URL_KEY = "TOKI_GAS_URL";
    const CFG_DASH_KEY = "TOKI_DASH_URL";
    const CFG_FOLDER_ID = "TOKI_FOLDER_ID";
    const CFG_DEBUG_KEY = "TOKI_DEBUG_MODE";
    const CFG_AUTO_SYNC_KEY = "TOKI_AUTO_SYNC";
    const CFG_CONFIG_VER = "TOKI_CONFIG_VER"; // [NEW] 설정 버전 관리
    const CURRENT_CONFIG_VER = 1; // v3.0.0 초기 버전

    // 🚀 v3.0.0-beta.251211 New Deployment URLs (Fixed ID Strategy)
    const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbwoalR1yG4NkKpC4zV8oxSsxMBZLP6MNYqoG0Fn1U-KHysIuJPaL5oaNd7bdGkZCGsv/exec"; // @29
    const DEFAULT_DASH_URL = "https://script.google.com/macros/s/AKfycbzfuNB8hlRTKFWPGPxh2nVVcODaVIhBYMVBxbsDiOKxc6H2GmaGZPyFbLyw_aI9TpEy/exec"; // @25

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

    const WAIT_PER_EPISODE_MS = 3000;
    const WAIT_PER_BATCH_MS = 500;
    const CHUNK_SIZE = 20 * 1024 * 1024;

    let site = '뉴토끼';
    let protocolDomain = 'https://newtoki469.com';
    let workId = '00000';

    const currentURL = document.URL;
    const bookMatch = currentURL.match(/^https:\/\/booktoki[0-9]+\.com\/novel\/([0-9]+)/);
    const newMatch = currentURL.match(/^https:\/\/newtoki[0-9]+\.com\/webtoon\/([0-9]+)/);
    const manaMatch = currentURL.match(/^https:\/\/manatoki[0-9]+\.net\/comic\/([0-9]+)/);

    if (bookMatch) { site = "북토끼"; protocolDomain = currentURL.match(/^https:\/\/booktoki[0-9]+\.com/)[0]; workId = bookMatch[1]; }
    else if (newMatch) { site = "뉴토끼"; protocolDomain = currentURL.match(/^https:\/\/newtoki[0-9]+\.com/)[0]; workId = newMatch[1]; }
    else if (manaMatch) { site = "마나토끼"; protocolDomain = currentURL.match(/^https:\/\/manatoki[0-9]+\.net/)[0]; workId = manaMatch[1]; }
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
        return { fullTitle, cleanTitle, id: workId, ...details };
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

        // 2. 고급 설정 (URL 변경 - 선택 사항)
        if (confirm("고급 설정(API URL 변경)을 하시겠습니까? (보통은 불필요)")) {
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
        alert(`🐞 디버그 모드: ${next ? "ON" : "OFF"}\n(ON일 경우 에러 발생 시 멈춥니다)`);
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

    function openDashboard() {
        const config = getConfig();
        if (!config.dashUrl) {
            alert("⚠️ 대시보드 URL이 설정되지 않았습니다.");
            return;
        }
        window.open(config.dashUrl, '_blank');
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
            protocolVersion: 3, // [New] Major Protocol Version
            clientVersion: "3.0.0-beta.251215.0002", 
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

    async function saveInfoJson() {
        return new Promise(async (resolve) => {
            const config = getConfig();
            if (!config.url) { resolve(); return; }
            const info = getSeriesInfo();

            // [NEW] 메타데이터 계산 (최종 회차, 파일 수)
            const historyKey = `history_${info.id}`;
            const history = GM_getValue(historyKey, []);
            const lastEpisode = history.length > 0 ? Math.max(...history) : 0;
            const fileCount = history.length;

            let thumbnailBase64 = "";
            if (info.thumbnail && info.thumbnail.startsWith("http")) {
                updateStatus("🖼️ 썸네일 처리 중...");
                thumbnailBase64 = await urlToBase64(info.thumbnail);
            }
            const payload = {
                folderId: config.folderId, 
                type: 'save_info', 
                protocolVersion: 3, // [New] Major Protocol Version
                clientVersion: "3.0.0-beta.251215.0002", 
                folderName: `[${info.id}] ${info.cleanTitle}`,
                id: info.id, title: info.fullTitle, url: document.URL, site: site,
                author: info.author, category: info.category, status: info.status, thumbnail: thumbnailBase64 || info.thumbnail,
                last_episode: lastEpisode,
                file_count: fileCount
            };
            GM_xmlhttpRequest({
                method: "POST", url: config.url, data: JSON.stringify(payload), headers: { "Content-Type": "text/plain" },
                onload: (res) => {
                    if (!checkAuthRequired(res.responseText)) resolve();
                    else resolve(); // Auth required but resolve to not block flow, user will retry
                },
                onerror: () => resolve()
            });
        });
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
        await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST", url: config.url,
                data: JSON.stringify({ 
                    folderId: config.folderId, 
                    type: "init", 
                    protocolVersion: 3, // [New] Major Protocol Version
                    clientVersion: "3.0.0-beta.251215.0002", 
                    folderName: folderName, 
                    fileName: fileName 
                }),
                headers: { "Content-Type": "text/plain" },
                onload: (res) => {
                    if (checkAuthRequired(res.responseText)) {
                        reject(new Error("권한 승인 필요"));
                        return;
                    }
                    try {
                        const json = JSON.parse(res.responseText);
                        if (json.status === 'success') { uploadUrl = json.body; resolve(); }
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
                        clientVersion: "3.0.0-beta.251215.0002", // [New] API Version Check (Chunk는 생략 가능하지만 안전하게 추가)
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

            await saveInfoJson();

            const iframe = document.createElement('iframe');
            iframe.id = 'tokiDownloaderIframe';
            iframe.style.cssText = "position:absolute; top:-9999px; left:-9999px; width:600px; height:600px;";
            document.querySelector('.content').prepend(iframe);
            const waitIframeLoad = (u) => new Promise(r => { iframe.src = u; iframe.onload = () => r(); });

            const activeUploads = new Set();

            for (let i = 0; i < list.length; i++) {
                const currentLi = list[i];
                const zip = new JSZip();
                const src = currentLi.querySelector('a').href;
                const numText = currentLi.querySelector('.wr-num').innerText.trim();
                const num = parseInt(numText);

                const epFullTitle = currentLi.querySelector('a').innerHTML.replace(/<span[\s\S]*?\/span>/g, '').trim();
                let epCleanTitle = epFullTitle.replace(info.fullTitle, '').trim();
                epCleanTitle = epCleanTitle.replace(/[\\/:*?"<>|]/g, '');
                const zipFileName = `${numText.padStart(4, '0')} - ${epCleanTitle}.cbz`;

                // ⭐️ 에러 발생 시 파일에 기록할 로그 배열
                let failedLog = [];

                setListItemStatus(currentLi, "⏳ 로딩 중...", "#fff9c4", "#d32f2f");
                updateStatus(`[${targetFolderName}]<br><strong>${epCleanTitle}</strong> (${i + 1}/${list.length}) 로딩...<br>현재 업로드 중: ${activeUploads.size}개`);

                await waitIframeLoad(src);
                await sleep(getDynamicWait(WAIT_PER_EPISODE_MS));

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

                if (site == "북토끼") {
                    const fileContent = iframeDocument.querySelector('#novel_content').innerText;
                    zip.file(`${num} ${epCleanTitle}.txt`, fileContent);
                } else {
                    let imgLists = Array.from(iframeDocument.querySelectorAll('.view-padding div img'));
                    for (let j = 0; j < imgLists.length;) { if (imgLists[j].checkVisibility() === false) imgLists.splice(j, 1); else j++; }
                    if (imgLists.length === 0) {
                        await pauseForCaptcha(iframe); await sleep(3000);
                        iframeDocument = iframe.contentWindow.document;
                        imgLists = Array.from(iframeDocument.querySelectorAll('.view-padding div img'));
                        for (let j = 0; j < imgLists.length;) { if (imgLists[j].checkVisibility() === false) imgLists.splice(j, 1); else j++; }
                        if (imgLists.length === 0) throw new Error("이미지 0개");
                    }

                    setListItemStatus(currentLi, `🖼️ 이미지 0/${imgLists.length}`, "#fff9c4", "#d32f2f");
                    updateStatus(`[${targetFolderName}]<br><strong>${epCleanTitle}</strong><br>이미지 ${imgLists.length}장 수집 중...`);

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

                const uploadTask = uploadResumable(content, targetFolderName, zipFileName)
                    .then(() => {
                        setListItemStatus(currentLi, "✅ 완료", "#e0e0e0", "green");
                        updateLocalHistory(parseInt(num));
                    })
                    .catch(err => {
                        setListItemStatus(currentLi, "❌ 실패", "#ffcdd2", "#b71c1c");
                        alert(`업로드 실패: ${err.message}`);
                        throw err;
                    });

                const trackedTask = uploadTask.then(() => activeUploads.delete(trackedTask)).catch(() => activeUploads.delete(trackedTask));
                activeUploads.add(trackedTask);
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
    async function autoSyncDownloadManager() {
        if (!await checkConfig()) return;
        startSilentAudio(); initStatusUI();

        await saveInfoJson();

        const history = await fetchHistoryFromCloud();
        const allListItems = Array.from(document.querySelector('.list-body').querySelectorAll('li')).reverse();
        const missingEpisodes = [];
        allListItems.forEach(li => {
            const num = parseInt(li.querySelector('.wr-num').innerText);
            if (!history.includes(num)) missingEpisodes.push(num);
        });
        if (missingEpisodes.length === 0) {
            updateStatus("<strong>🎉 동기화 완료!</strong>");
            alert("이미 완료됨");
            stopSilentAudio();
            return;
        }
        updateStatus(`<strong>☁️ 자동 동기화 시작</strong><br>총 ${missingEpisodes.length}개...`);
        try { await tokiDownload(null, null, missingEpisodes); updateStatus("<strong>🎉 작업 완료!</strong>"); alert("완료"); } catch (e) { console.error(e); }
        finally { stopSilentAudio(); setTimeout(() => document.getElementById('tokiStatusDisplay')?.remove(), 5000); }
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

    GM_registerMenuCommand('⚙️ 설정 (URL/Key)', openSettings);
    GM_registerMenuCommand('🐞 디버그 모드', toggleDebugMode);
    GM_registerMenuCommand('📊 서재 열기', openDashboard);
    GM_registerMenuCommand('☁️ 자동 동기화', autoSyncDownloadManager);
    GM_registerMenuCommand('🔢 범위 다운로드', batchDownloadManager);

    GM_registerMenuCommand('1회성 다운로드', async () => {
        if (!await checkConfig()) return;
        startSilentAudio(); initStatusUI();
        saveInfoJson().then(() => {
            const s = prompt('시작?', 1); if (!s) return;
            const e = prompt('끝?', s); if (!e) return;
            tokiDownload(s, e).finally(() => { stopSilentAudio(); setTimeout(() => document.getElementById('tokiStatusDisplay')?.remove(), 5000); });
        });
    });
    // #endregion
};
