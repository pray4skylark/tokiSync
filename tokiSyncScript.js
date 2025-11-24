// ==UserScript==
// @name         TokiSync
// @namespace    https://github.com/pray4skylark/tokiSync
// @version      1.0.0
// @description  북토끼, 뉴토끼, 마나토끼 구글 드라이브 자동 동기화 (Original script by hehaho)
// @author       pray4skylark
// @match        https://*.com/webtoon/*
// @match        https://*.com/novel/*
// @match        https://*.net/comic/*
// @icon         https://github.com/user-attachments/assets/99f5bb36-4ef8-40cc-8ae5-e3bf1c7952ad
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.1.0/jszip-utils.js
// @run-at       document-end
// @license      MIT
// ==/UserScript==

/*
 * ==============================================================================
 * [ Project TokiSync ]
 *
 * This script is a heavily rewritten version of 'tokiDownloader'.
 * It introduces Cloud Synchronization, Resumable Uploads, and Pipeline Optimization.
 *
 * ------------------------------------------------------------------------------
 * Original Project: tokiDownloader
 * Original Author: hehaho
 * Repository: https://github.com/crossSiteKikyo/tokiDownloader
 * ------------------------------------------------------------------------------
 *
 * Key Changes in TokiSync:
 * 1. Direct Google Drive Upload (Chunked/Resumable for large files)
 * 2. Auto-Sync History with Google Sheets
 * 3. Enhanced Anti-Throttling (Audio Oscillator Trick)
 * 4. Smart Pipeline & Retry Logic for stability
 * ==============================================================================
 */

(function () {
    'use strict';

    // ===================================================================
    // ⚙️ 시스템 상수 (수정 불필요)
    // ===================================================================
    const CFG_URL_KEY = "TOKI_GAS_URL";
    const CFG_SECRET_KEY = "TOKI_SECRET_KEY";

    function getConfig() {
        return {
            url: GM_getValue(CFG_URL_KEY, ""),
            key: GM_getValue(CFG_SECRET_KEY, "")
        };
    }

    // ⚡️ 성능 및 안전 설정
    const MAX_UPLOAD_CONCURRENCY = 2;     // 동시 업로드 개수 (메모리 보호)
    const CHUNK_SIZE = 20 * 1024 * 1024;  // 업로드 조각 크기 (20MB)
    const WAIT_PER_EPISODE_MS = 3000;     // 화별 대기
    const WAIT_PER_IMAGE_MS = 200;        // 이미지별 대기 (안전값)
    // ===================================================================

    let site = '뉴토끼';
    let protocolDomain = 'https://newtoki469.com';
    let workId = '00000'; 

    const currentURL = document.URL;
    const bookMatch = currentURL.match(/^https:\/\/booktoki[0-9]+\.com\/novel\/([0-9]+)/);
    const newMatch = currentURL.match(/^https:\/\/newtoki[0-9]+\.com\/webtoon\/([0-9]+)/);
    const manaMatch = currentURL.match(/^https:\/\/manatoki[0-9]+\.net\/comic\/([0-9]+)/);

    if (bookMatch) {
        site = "북토끼"; protocolDomain = currentURL.match(/^https:\/\/booktoki[0-9]+\.com/)[0];
        workId = bookMatch[1]; 
    }
    else if (newMatch) {
        site = "뉴토끼"; protocolDomain = currentURL.match(/^https:\/\/newtoki[0-9]+\.com/)[0];
        workId = newMatch[1];
    }
    else if (manaMatch) {
        site = "마나토끼"; protocolDomain = currentURL.match(/^https:\/\/manatoki[0-9]+\.net/)[0];
        workId = manaMatch[1];
    }
    else {
        return;
    }

    // --- [유틸리티] ---
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

        return { fullTitle, cleanTitle, id: workId };
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function getDynamicWait(base) { return Math.floor(Math.random() * (base * 0.2 + 1)) + base; }

    // --- [UI 관련] ---
    function setListItemStatus(li, message, bgColor = '#fff9c4', textColor = '#d32f2f') {
        if (!li) return;
        if (!li.classList.contains('toki-downloaded')) {
            li.style.backgroundColor = bgColor;
        }
        const link = li.querySelector('a');
        if (!link) return;
        let statusSpan = link.querySelector('.toki-status-msg');
        if (!statusSpan) {
            statusSpan = document.createElement('span');
            statusSpan.className = 'toki-status-msg';
            statusSpan.style.fontSize = '12px';
            statusSpan.style.fontWeight = 'bold';
            statusSpan.style.marginLeft = '10px';
            link.appendChild(statusSpan);
        }
        statusSpan.innerText = message;
        statusSpan.style.color = textColor;
    }

    function initStatusUI() {
        const oldUI = document.getElementById('tokiStatusDisplay');
        if (oldUI) oldUI.remove();
        const statusUI = document.createElement('div');
        statusUI.id = 'tokiStatusDisplay';
        statusUI.style.cssText = "position:fixed; bottom:20px; right:20px; background:rgba(0,0,0,0.8); color:white; padding:15px; border-radius:10px; z-index:99999; font-family:sans-serif; font-size:14px; max-width:300px;";
        statusUI.innerHTML = '<button id="tokiCloseBtn" style="position:absolute; top:5px; right:5px; background:none; border:none; color:white; font-weight:bold; cursor:pointer;">X</button><p id="tokiStatusText" style="margin:0 0 10px 0;">준비 중...</p><button id="tokiResumeButton" style="display:none; width:100%; padding:8px; background:#4CAF50; color:white; border:none; border-radius:5px; cursor:pointer;">캡차 해결 완료</button>';
        document.body.appendChild(statusUI);
        document.getElementById('tokiCloseBtn').onclick = () => statusUI.remove();
    }
    function updateStatus(msg) { 
        const el = document.getElementById('tokiStatusText'); 
        if (el) el.innerHTML = msg; 
    }

    // --- [통신 함수] ---
    function fetchHistoryFromCloud() {
        return new Promise((resolve, reject) => {
            const config = getConfig();
            if (!config.url) { markDownloadedItems(); resolve([]); return; }
            const info = getSeriesInfo();
            const payload = { key: config.key, type: 'history_get', id: info.id };
            
            updateStatus("☁️ 기록 조회 중...");
            GM_xmlhttpRequest({
                method: "POST", url: config.url, data: JSON.stringify(payload),
                headers: { "Content-Type": "text/plain" },
                onload: (res) => {
                    if (res.status === 200) {
                        try {
                            const json = JSON.parse(res.responseText);
                            const history = JSON.parse(json.body || "[]");
                            const historyKey = `history_${info.id}`;
                            const merged = Array.from(new Set([...GM_getValue(historyKey, []), ...history])).sort((a,b)=>a-b);
                            GM_setValue(historyKey, merged);
                            markDownloadedItems();
                            resolve(merged);
                        } catch (e) { resolve([]); }
                    } else resolve([]);
                },
                onerror: () => resolve([])
            });
        });
    }

    async function uploadResumable(blob, folderName, fileName) {
        const config = getConfig();
        if (!config.url) throw new Error("설정(URL)이 비어있습니다.");

        const totalSize = blob.size;
        
        // 1. 초기화
        let uploadUrl = "";
        await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST", url: config.url,
                data: JSON.stringify({ key: config.key, type: "init", folderName: folderName, fileName: fileName }),
                headers: { "Content-Type": "text/plain" },
                onload: (res) => {
                    try {
                        const json = JSON.parse(res.responseText);
                        if (json.status === 'success') { uploadUrl = json.body; resolve(); } 
                        else reject(new Error(json.body));
                    } catch(e) { reject(e); }
                },
                onerror: (e) => reject(e)
            });
        });

        // 2. 청크 전송
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
                        key: config.key, type: "upload", uploadUrl: uploadUrl,
                        chunkData: chunkBase64, start: start, end: end, total: totalSize
                    }),
                    headers: { "Content-Type": "text/plain" },
                    onload: (res) => {
                        try {
                            const json = JSON.parse(res.responseText);
                            if (json.status === 'success') resolve();
                            else reject(new Error(json.body));
                        } catch(e) { reject(e); }
                    },
                    onerror: (e) => reject(e)
                });
            });
            start = end;
        }
        updateStatus(`<strong>✅ 완료: ${fileName}</strong>`);
    }

    function saveHistoryToCloud(episodeNum) {
        const config = getConfig();
        const info = getSeriesInfo();
        const historyKey = `history_${info.id}`;
        
        let history = GM_getValue(historyKey, []);
        if (!history.includes(episodeNum)) {
            history.push(episodeNum);
            history.sort((a, b) => a - b);
            GM_setValue(historyKey, history);
        }
        markDownloadedItems(); 

        if (!config.url) return;
        const payload = { key: config.key, type: 'history_save', id: info.id, title: info.cleanTitle, episodes: [episodeNum] };
        GM_xmlhttpRequest({ method: "POST", url: config.url, data: JSON.stringify(payload), headers: { "Content-Type": "text/plain" } });
    }

    // --- [오디오 등 부가 기능] ---
    let audioContext, oscillator, gainNode;
    function startSilentAudio() { if (audioContext && audioContext.state === 'running') return; try { if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); if (!oscillator) { oscillator = audioContext.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(440, audioContext.currentTime); gainNode = audioContext.createGain(); gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime); oscillator.connect(gainNode); gainNode.connect(audioContext.destination); oscillator.start(); } if (audioContext.state === 'suspended') audioContext.resume(); } catch (e) {} }
    function stopSilentAudio() { try { if (oscillator) { oscillator.stop(); oscillator.disconnect(); oscillator = null; } if (gainNode) { gainNode.disconnect(); gainNode = null; } if (audioContext) { audioContext.close().then(() => audioContext = null); } } catch (e) {} }
    function markDownloadedItems() { const info = getSeriesInfo(); const historyKey = `history_${info.id}`; const history = GM_getValue(historyKey, []); const listItems = document.querySelectorAll('.list-body .list-item'); listItems.forEach(li => { const numElement = li.querySelector('.wr-num'); if (!numElement) return; const num = parseInt(numElement.innerText.trim()); if (history.includes(num)) { if (!li.classList.contains('toki-downloaded')) { li.classList.add('toki-downloaded'); li.style.backgroundColor = '#e0e0e0'; li.style.opacity = '0.6'; const statusSpan = li.querySelector('.toki-status-msg'); if (statusSpan) statusSpan.remove(); const link = li.querySelector('a'); if (link && !link.querySelector('.toki-mark')) { const checkMark = document.createElement('span'); checkMark.innerText = " ✅ 다운완료"; checkMark.className = 'toki-mark'; checkMark.style.color = "green"; checkMark.style.fontWeight = "bold"; checkMark.style.marginLeft = "10px"; checkMark.style.fontSize = "12px"; link.appendChild(checkMark); } } } }); }
    function openSettings() { const currentConfig = getConfig(); const newUrl = prompt("Apps Script URL:", currentConfig.url); if (newUrl === null) return; const newKey = prompt("Secret Key:", currentConfig.key); if (newKey === null) return; GM_setValue(CFG_URL_KEY, newUrl.trim()); GM_setValue(CFG_SECRET_KEY, newKey.trim()); alert("설정 저장 완료"); }
    function checkConfig() { const config = getConfig(); if (!config.url || !config.key) { alert("설정 필요"); return false; } return true; }

    // ===================================================================
    // ⭐️ tokiDownload (메인 엔진)
    // ===================================================================
    async function tokiDownload(startIndex, lastIndex, targetNumbers = null) {
        const pauseForCaptcha = (iframe) => {
             return new Promise(resolve => {
                updateStatus("<strong>🤖 캡차 발견!</strong> 해결 후 버튼 클릭");
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
                if (startIndex) { while(list.length > 0 && parseInt(list[0].querySelector('.wr-num').innerText) < startIndex) list.shift(); }
                if (lastIndex) { while(list.length > 0 && parseInt(list.at(-1).querySelector('.wr-num').innerText) > lastIndex) list.pop(); }
            }
            if (list.length === 0) return;

            const info = getSeriesInfo();
            const targetFolderName = `[${info.id}] ${info.cleanTitle}`;

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
                const epCleanTitle = epFullTitle.replace(info.fullTitle, '').trim().replace(/[:\?\/]/g, '');
                const paddedNum = numText.padStart(4, '0');
                const zipFileName = `${paddedNum} - ${epCleanTitle}.cbz`;
                
                setListItemStatus(currentLi, "⏳ 로딩 중...", "#fff9c4", "#d32f2f");
                updateStatus(`[${targetFolderName}]<br><strong>${epCleanTitle}</strong> (${i+1}/${list.length}) 로딩...<br>현재 업로드 중: ${activeUploads.size}개`);
                
                await waitIframeLoad(src);
                await sleep(getDynamicWait(WAIT_PER_EPISODE_MS));

                let iframeDocument = iframe.contentWindow.document;
                const isCaptcha = iframeDocument.querySelector('iframe[src*="hcaptcha"]') || iframeDocument.querySelector('.g-recaptcha') || iframeDocument.querySelector('#kcaptcha_image');
                const isCloudflare = iframeDocument.title.includes('Just a moment') || iframeDocument.getElementById('cf-challenge-running');
                const noContent = (site == "북토끼") ? !iframeDocument.querySelector('#novel_content') : false;
                if (isCaptcha || isCloudflare || noContent) { await pauseForCaptcha(iframe); await sleep(3000); iframeDocument = iframe.contentWindow.document; }
                
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
                                if (res.status === 200) { zip.file(`image_${j.toString().padStart(4,'0')}${ext}`, res.response); resolve(); }
                                else {
                                    if(retryCount > 0) setTimeout(() => fetchAndAddToZip(imgSrc, j, ext, retryCount - 1).then(resolve).catch(reject), 2000);
                                    else reject(new Error(`HTTP ${res.status}`));
                                }
                            },
                            onerror: (e) => { if(retryCount > 0) setTimeout(() => fetchAndAddToZip(imgSrc, j, ext, retryCount - 1).then(resolve).catch(reject), 2000); else reject(new Error("Network Error")); },
                            ontimeout: () => { if(retryCount > 0) setTimeout(() => fetchAndAddToZip(imgSrc, j, ext, retryCount - 1).then(resolve).catch(reject), 2000); else reject(new Error("Timeout")); }
                        });
                    });

                    for (let j = 0; j < imgLists.length; j++) {
                        let imgStart = imgLists[j].outerHTML;
                        try {
                            let imgSrc = `${protocolDomain}${imgStart.match(/\/data[^"]+/)[0]}`;
                            let ext = imgSrc.match(/\.[a-zA-Z]+$/)[0];
                            await fetchAndAddToZip(imgSrc, j, ext); 
                            
                            if (j % 10 === 0) setListItemStatus(currentLi, `🖼️ 이미지 ${j}/${imgLists.length}`, "#fff9c4", "#d32f2f");
                            await sleep(getDynamicWait(WAIT_PER_IMAGE_MS));
                        } catch(e) {}
                    }
                }
                
                setListItemStatus(currentLi, "📦 압축 중...", "#ffe0b2", "#e65100");
                const content = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 5 } });

                if (activeUploads.size >= MAX_UPLOAD_CONCURRENCY) {
                    updateStatus(`<strong>업로드 대기 중...</strong>`);
                    await Promise.race(activeUploads);
                }

                setListItemStatus(currentLi, "☁️ 업로드 중...", "#bbdefb", "#0d47a1");

                const uploadTask = uploadResumable(content, targetFolderName, zipFileName)
                    .then(() => { saveHistoryToCloud(parseInt(num)); })
                    .catch(err => {
                        setListItemStatus(currentLi, "❌ 실패", "#ffcdd2", "#b71c1c");
                        console.error(`업로드 실패 (${zipFileName}):`, err);
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
            if (errorMsg === "[object Object]") try { errorMsg = JSON.stringify(error); } catch(e) {}
            alert("오류 발생: " + errorMsg);
            updateStatus("❌ 오류: " + errorMsg);
            document.getElementById('tokiDownloaderIframe')?.remove();
        }
    }

    // ... (메뉴 및 실행 코드는 동일) ...
    async function autoSyncDownloadManager() {
        if (!checkConfig()) return;
        startSilentAudio(); initStatusUI();
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
        if (!checkConfig()) return;
        startSilentAudio(); initStatusUI();
        const s = prompt('시작?'); if(!s) return;
        const e = prompt('끝?'); if(!e) return;
        const start = parseInt(s); const end = parseInt(e);
        try { await tokiDownload(start, end); updateStatus("작업 완료!"); alert("완료"); } catch (e) { console.error(e); } 
        finally { stopSilentAudio(); setTimeout(() => document.getElementById('tokiStatusDisplay')?.remove(), 5000); }
    }

    window.addEventListener('load', () => { markDownloadedItems(); fetchHistoryFromCloud(); });
    GM_registerMenuCommand('⚙️ 설정', openSettings);
    GM_registerMenuCommand('☁️ 자동 동기화 (안 받은 것만)', autoSyncDownloadManager);
    GM_registerMenuCommand('🔢 범위 다운로드 (시작~끝)', batchDownloadManager);
    GM_registerMenuCommand('1회성 다운로드 (N~N)', () => {
        if (!checkConfig()) return;
        startSilentAudio(); initStatusUI();
        const s = prompt('시작?', 1); if(!s) return;
        const e = prompt('끝?', s); if(!e) return;
        tokiDownload(s, e).finally(() => { stopSilentAudio(); setTimeout(() => document.getElementById('tokiStatusDisplay')?.remove(), 5000); });
    });
})();
