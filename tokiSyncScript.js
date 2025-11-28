// ==UserScript==
// @name         TokiSync
// @namespace    https://github.com/pray4skylark/tokiSync
// @version      1.2.1 (Audio Interface Fix)
// @description  북토끼, 뉴토끼, 마나토끼 구글 드라이브 자동 동기화 (오디오 인터페이스 복구)
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
 * [ TokiSync v1.2.1 ]
 * v1.2.0 구조 기반 + 오디오 인터페이스(스피커 아이콘) 문제 수정
 */

(function () {
    'use strict';

    // #region [1. 설정 및 상수] ====================================================
    const CFG_URL_KEY = "TOKI_GAS_URL";
    const CFG_SECRET_KEY = "TOKI_SECRET_KEY";

    function getConfig() {
        return {
            url: GM_getValue(CFG_URL_KEY, ""),
            key: GM_getValue(CFG_SECRET_KEY, "")
        };
    }

    // 성능/안전 튜닝
    const MAX_UPLOAD_CONCURRENCY = 2;  
    const WAIT_PER_EPISODE_MS = 3000;  
    const WAIT_PER_IMAGE_MS = 200;     
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
    function getDetailInfo() {
        let author="", category="", status="", thumbnail="";
        try {
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) thumbnail = ogImage.content;
            
            const textNodes = document.body.innerText.split('\n');
            textNodes.forEach(line => {
                if (line.includes("작가 :")) author = line.replace("작가 :", "").trim();
                if (line.includes("분류 :")) category = line.replace("분류 :", "").trim();
                if (line.includes("발행구분 :")) status = line.replace("발행구분 :", "").trim();
            });
        } catch(e) {}
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

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function getDynamicWait(base) { return Math.floor(Math.random() * (base * 0.2 + 1)) + base; }
    // #endregion


    // #region [3. UI 및 상태 관리] ==================================================
    function initStatusUI() {
        const oldUI = document.getElementById('tokiStatusDisplay');
        if (oldUI) oldUI.remove();
        
        const statusUI = document.createElement('div');
        statusUI.id = 'tokiStatusDisplay';
        statusUI.style.cssText = "position:fixed; bottom:20px; right:20px; background:rgba(0,0,0,0.8); color:white; padding:15px; border-radius:10px; z-index:99999; font-family:sans-serif; font-size:14px; max-width:300px;";
        statusUI.innerHTML = `
            <button id="tokiCloseBtn" style="position:absolute; top:5px; right:5px; background:none; border:none; color:white; font-weight:bold; cursor:pointer;">X</button>
            <p id="tokiStatusText" style="margin:0 0 10px 0;">준비 중...</p>
            <button id="tokiAudioBtn" style="display:none; width:100%; margin-bottom:5px; padding:8px; background:#ff5252; color:white; border:none; border-radius:5px; cursor:pointer;">🔊 백그라운드 켜기 (필수)</button>
            <button id="tokiResumeButton" style="display:none; width:100%; padding:8px; background:#4CAF50; color:white; border:none; border-radius:5px; cursor:pointer;">캡차 해결 완료</button>
        `;
        document.body.appendChild(statusUI);
        document.getElementById('tokiCloseBtn').onclick = () => statusUI.remove();
    }

    function updateStatus(msg) { 
        const el = document.getElementById('tokiStatusText'); 
        if (el) el.innerHTML = msg; 
    }

    function setListItemStatus(li, message, bgColor = '#fff9c4', textColor = '#d32f2f') {
        if(!li) return;
        if(!li.classList.contains('toki-downloaded')) li.style.backgroundColor = bgColor;
        
        const link = li.querySelector('a');
        if(!link) return;
        
        let s = link.querySelector('.toki-status-msg');
        if(!s) {
            s=document.createElement('span');
            s.className='toki-status-msg';
            s.style.fontSize='12px'; s.style.fontWeight='bold'; s.style.marginLeft='10px';
            link.appendChild(s);
        }
        s.innerText=message; s.style.color=textColor;
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


    // #region [4. ⭐️ 오디오 엔진 (MediaStream + Audio Tag)] ========================
    let audioContext = null;
    let audioEl = null;

    function startSilentAudio() {
        // 이미 실행 중이면 패스
        if (audioContext && audioContext.state === 'running') return;

        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }

            // 오실레이터 생성
            const oscillator = audioContext.createOscillator();
            const dest = audioContext.createMediaStreamDestination();
            const gain = audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.value = 1; // 1Hz (사람 귀에 안들림)
            gain.gain.value = 0.001; // 0이 아닌 미세한 볼륨

            // 연결: 오실레이터 -> 게인 -> 미디어스트림
            oscillator.connect(gain);
            gain.connect(dest);
            oscillator.start();

            // HTML Audio Element에 스트림 주입 (브라우저 속이기 핵심)
            if (!audioEl) {
                audioEl = document.createElement('audio');
                audioEl.style.display = "none";
                document.body.appendChild(audioEl);
            }
            
            audioEl.srcObject = dest.stream;
            const playPromise = audioEl.play();
            
            if (playPromise) {
                playPromise.then(() => {
                    console.log("🔊 Audio Stream Started (Secure)");
                    updateAudioUI(true);
                }).catch(e => {
                    console.warn("🚫 Autoplay Blocked:", e);
                    updateAudioUI(false); // 실패 시 빨간 버튼 표시
                });
            }

        } catch (e) {
            console.error("Audio Init Fail:", e);
        }
    }

    function stopSilentAudio() {
        try {
            if (audioEl) {
                audioEl.pause();
                audioEl.srcObject = null;
            }
            if (audioContext) {
                audioContext.close().then(() => audioContext = null);
                console.log("🔇 Audio Stopped");
            }
        } catch (e) {}
    }

    function updateAudioUI(isPlaying) {
        const btn = document.getElementById('tokiAudioBtn');
        if (!btn) return;
        
        if (isPlaying) {
            btn.style.display = 'none'; // 잘 되면 숨김
        } else {
            btn.style.display = 'block'; // 차단되면 보여줌 (클릭 유도)
            btn.onclick = () => {
                startSilentAudio();
            };
        }
    }
    // #endregion


    // #region [5. 네트워크 & 업로드 모듈] ===========================================
    function fetchHistoryFromCloud() {
        return new Promise((resolve, reject) => {
            const config = getConfig();
            if (!config.url) { markDownloadedItems(); resolve([]); return; }
            
            const info = getSeriesInfo();
            const payload = { key: config.key, type: 'check_history', folderName: `[${info.id}] ${info.cleanTitle}` };
            
            updateStatus("☁️ 드라이브 파일 스캔 중...");
            GM_xmlhttpRequest({
                method: "POST", url: config.url, data: JSON.stringify(payload), headers: { "Content-Type": "text/plain" },
                onload: (res) => {
                    if (res.status === 200) {
                        try {
                            const json = JSON.parse(res.responseText);
                            const cloudHistory = Array.isArray(json.body) ? json.body : [];
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

    function saveInfoJson() {
        const config = getConfig();
        if (!config.url) return;
        const info = getSeriesInfo();
        const payload = {
            key: config.key, type: 'save_info', folderName: `[${info.id}] ${info.cleanTitle}`,
            id: info.id, title: info.fullTitle, url: document.URL, site: site,
            author: info.author, category: info.category, status: info.status, thumbnail: info.thumbnail
        };
        GM_xmlhttpRequest({ method: "POST", url: config.url, data: JSON.stringify(payload), headers: { "Content-Type": "text/plain" } });
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
                data: JSON.stringify({ key: config.key, type: "init", folderName: folderName, fileName: fileName }),
                headers: { "Content-Type": "text/plain" },
                onload: (res) => {
                    try {
                        const json = JSON.parse(res.responseText);
                        if (json.status === 'success') { uploadUrl = json.body; resolve(); } 
                        else reject(new Error(json.body));
                    } catch(e) { 
                        console.error("GAS Error:", res.responseText);
                        reject(new Error("GAS 응답 오류")); 
                    }
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
                    data: JSON.stringify({ key: config.key, type: "upload", uploadUrl: uploadUrl, chunkData: chunkBase64, start: start, end: end, total: totalSize }),
                    headers: { "Content-Type": "text/plain" },
                    onload: (res) => {
                        try { const json = JSON.parse(res.responseText); if (json.status === 'success') resolve(); else reject(new Error(json.body)); } catch(e) { reject(e); }
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

            if (targetNumbers) {
                list = list.filter(li => targetNumbers.includes(parseInt(li.querySelector('.wr-num').innerText)));
            } else {
                if (startIndex) { while(list.length > 0 && parseInt(list[0].querySelector('.wr-num').innerText) < startIndex) list.shift(); }
                if (lastIndex) { while(list.length > 0 && parseInt(list.at(-1).querySelector('.wr-num').innerText) > lastIndex) list.pop(); }
            }
            if (list.length === 0) return;

            const info = getSeriesInfo();
            const targetFolderName = `[${info.id}] ${info.cleanTitle}`;
            saveInfoJson();

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
                const zipFileName = `${numText.padStart(4,'0')} - ${epCleanTitle}.cbz`;
                
                setListItemStatus(currentLi, "⏳ 로딩 중...", "#fff9c4", "#d32f2f");
                updateStatus(`[${targetFolderName}]<br><strong>${epCleanTitle}</strong> (${i+1}/${list.length}) 로딩...<br>현재 업로드 중: ${activeUploads.size}개`);
                
                await waitIframeLoad(src);
                await sleep(getDynamicWait(WAIT_PER_EPISODE_MS));

                let iframeDocument = iframe.contentWindow.document;
                const isCaptcha = iframeDocument.querySelector('iframe[src*="hcaptcha"]') || iframeDocument.querySelector('.g-recaptcha') || iframeDocument.querySelector('#kcaptcha_image');
                const isCloudflare = iframeDocument.title.includes('Just a moment') || iframeDocument.getElementById('cf-challenge-running');
                const noContent = (site == "북토끼") ? !iframeDocument.querySelector('#novel_content') : false;
                
                // 403 체크
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
                    .then(() => {
                        setListItemStatus(currentLi, "✅ 완료", "#e0e0e0", "green");
                        updateLocalHistory(parseInt(num));
                    })
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

    // #region [7. 메뉴 및 실행] =====================================================
    function openSettings() {
        const currentConfig = getConfig();
        const newUrl = prompt("Apps Script URL:", currentConfig.url);
        if (newUrl === null) return;
        const newKey = prompt("Secret Key:", currentConfig.key);
        if (newKey === null) return;
        GM_setValue(CFG_URL_KEY, newUrl.trim());
        GM_setValue(CFG_SECRET_KEY, newKey.trim());
        alert("설정 저장 완료");
    }

    function checkConfig() {
        const config = getConfig();
        if (!config.url || !config.key) { alert("설정 필요"); return false; }
        return true;
    }

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
        try { await tokiDownload(parseInt(s), parseInt(e)); updateStatus("작업 완료!"); alert("완료"); } catch (e) { console.error(e); } 
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
    // #endregion

})();
