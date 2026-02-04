// ==UserScript==
// @name         TokiSync (Link to Drive)
// @namespace    http://tampermonkey.net/
// @version      1.2.2
// @description  Toki series sites -> Google Drive syncing tool (Bundled)
// @author       pray4skylark
// @updateURL    https://raw.githubusercontent.com/pray4skylark/tokiSync/main/docs/tokiSync.user.js
// @downloadURL  https://raw.githubusercontent.com/pray4skylark/tokiSync/main/docs/tokiSync.user.js
// @match        https://*.com/webtoon/*
// @match        https://*.com/novel/*
// @match        https://*.net/comic/*
// @match        https://script.google.com/*
// @match        https://*.github.io/tokiSync/*
// @match        https://pray4skylark.github.io/tokiSync/*
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @icon         https://github.com/user-attachments/assets/99f5bb36-4ef8-40cc-8ae5-e3bf1c7952ad
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      pray4skylark.github.io
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.1.0/jszip-utils.js
// @run-at       document-end
// @license      MIT
// ==/UserScript==

/******/ (() => { // webpackBootstrap
/******/ 	"use strict";

;// ./src/core/config.js
const CFG_URL_KEY = "TOKI_GAS_URL";
const CFG_FOLDER_ID = "TOKI_FOLDER_ID";
const CFG_POLICY_KEY = "TOKI_DOWNLOAD_POLICY";
const CFG_API_KEY = "TOKI_API_KEY";

/**
 * Get current configuration
 * @returns {{gasUrl: string, folderId: string, policy: string}}
 */
function getConfig() {
    return {
        gasUrl: GM_getValue(CFG_URL_KEY, ""),
        folderId: GM_getValue(CFG_FOLDER_ID, ""),
        policy: GM_getValue(CFG_POLICY_KEY, "folderInCbz"),
        apiKey: GM_getValue(CFG_API_KEY, "")
    };
}

/**
 * Set configuration value
 * @param {string} key 
 * @param {string} value 
 */
function setConfig(key, value) {
    GM_setValue(key, value);
}

/**
 * Show Configuration Modal
 */
function showConfigModal() {
    // Remove existing modal if any
    const existing = document.getElementById('toki-config-modal');
    if (existing) existing.remove();

    const config = getConfig();

    // -- Styles --
    const styleId = 'toki-config-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .toki-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(5px);
                z-index: 10000;
                display: flex; justify-content: center; align-items: center;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            .toki-modal-container {
                background: rgba(30, 32, 35, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                border-radius: 16px;
                padding: 24px;
                width: 400px;
                color: #fff;
            }
            .toki-modal-header {
                font-size: 20px; font-weight: 600; margin-bottom: 20px;
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
            }
            .toki-input-group { margin-bottom: 16px; }
            .toki-label { display: block; font-size: 12px; color: #aaa; margin-bottom: 6px; }
            .toki-input, .toki-select {
                width: 100%; padding: 10px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: #fff; font-size: 14px;
                box-sizing: border-box;
            }
            .toki-input:focus, .toki-select:focus {
                outline: none; border-color: #6a5acd;
                box-shadow: 0 0 0 2px rgba(106, 90, 205, 0.3);
            }
            .toki-modal-footer {
                display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;
            }
            .toki-btn {
                padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;
                font-size: 14px; font-weight: 500; transition: all 0.2s;
            }
            .toki-btn-cancel { background: transparent; color: #aaa; border: 1px solid rgba(255,255,255,0.1); }
            .toki-btn-cancel:hover { background: rgba(255,255,255,0.05); color: #fff; }
            .toki-btn-save {
                background: linear-gradient(135deg, #6a5acd, #483d8b);
                color: #fff;
                box-shadow: 0 4px 15px rgba(106, 90, 205, 0.4);
            }
            .toki-btn-save:hover { filter: brightness(1.1); transform: translateY(-1px); }
        `;
        document.head.appendChild(style);
    }

    // -- HTML Structure --
    const overlay = document.createElement('div');
    overlay.id = 'toki-config-modal';
    overlay.className = 'toki-modal-overlay';
    
    overlay.innerHTML = `
        <div class="toki-modal-container">
            <div class="toki-modal-header">TokiSync 설정</div>
            
            <div class="toki-input-group">
                <label class="toki-label">Google Apps Script URL</label>
                <input type="text" id="toki-cfg-gas" class="toki-input" placeholder="https://script.google.com/..." value="${config.gasUrl}">
            </div>

            <div class="toki-input-group">
                <label class="toki-label">Google Drive Folder ID</label>
                <input type="text" id="toki-cfg-folder" class="toki-input" placeholder="Folder ID" value="${config.folderId}">
            </div>

            <div class="toki-input-group">
                <label class="toki-label">API Key (보안)</label>
                <input type="password" id="toki-cfg-apikey" class="toki-input" placeholder="API Key" value="${config.apiKey}">
            </div>

            <div class="toki-input-group">
                <label class="toki-label">다운로드 정책</label>
                <select id="toki-cfg-policy" class="toki-select">
                    <option value="folderInCbz">통합 파일 (Folder in CBZ/EPUB)</option>
                    <option value="zipOfCbzs">압축 파일 모음 (ZIP of CBZs)</option>
                    <option value="individual">개별 파일 (Individual Files)</option>
                    <option value="gasUpload">Google Drive 업로드 (개별 파일)</option>
                </select>
            </div>

            <div class="toki-modal-footer">
                <button id="toki-btn-cancel" class="toki-btn toki-btn-cancel">취소</button>
                <button id="toki-btn-save" class="toki-btn toki-btn-save">저장</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // -- Logic --
    const policySelect = document.getElementById('toki-cfg-policy');
    if(policySelect) policySelect.value = config.policy;

    document.getElementById('toki-btn-cancel').onclick = () => overlay.remove();
    
    document.getElementById('toki-btn-save').onclick = () => {
        const newGas = document.getElementById('toki-cfg-gas').value.trim();
        const newFolder = document.getElementById('toki-cfg-folder').value.trim();
        const newApiKey = document.getElementById('toki-cfg-apikey').value.trim();
        const newPolicy = document.getElementById('toki-cfg-policy').value;

        setConfig(CFG_URL_KEY, newGas);
        setConfig(CFG_FOLDER_ID, newFolder);
        setConfig(CFG_API_KEY, newApiKey);
        setConfig(CFG_POLICY_KEY, newPolicy);

        alert('설정이 저장되었습니다.');
        overlay.remove();
    };

    // Close on background click
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
}

/**
 * Check if configuration is valid
 * @returns {boolean}
 */
function isConfigValid() {
    const config = getConfig();
    return config.gasUrl && config.folderId;
}
;// ./src/core/gas.js


function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
}

/**
 * Uploads a Blob to Google Drive via GAS
 * @param {Blob} blob File content
 * @param {string} folderName Target folder name (e.g. "[123] Title")
 * @param {string} fileName Target file name (e.g. "[123] Title.zip")
 */
async function uploadToGAS(blob, folderName, fileName, options = {}) {
    const config = getConfig();
    if (!isConfigValid()) throw new Error("GAS 설정이 누락되었습니다. 메뉴에서 설정을 완료해주세요.");
    
    // Constants
    const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB
    const CLIENT_VERSION = "1.2.2";
    const totalSize = blob.size;
    let uploadUrl = "";

    console.log(`[GAS] 업로드 초기화 중... (${fileName})`);
    
    // Determine Category
    // Default to Webtoon if not provided
    const category = options.category || (fileName.endsWith('.epub') ? 'Novel' : 'Webtoon');

    // 1. Init Session
    await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "POST", 
            url: config.gasUrl,
            data: JSON.stringify({ 
                folderId: config.folderId, 
                type: "init", 
                protocolVersion: 3, 
                clientVersion: CLIENT_VERSION, 
                folderName: folderName, 
                fileName: fileName,
                category: category,
                apiKey: config.apiKey
            }),
            headers: { "Content-Type": "text/plain" },
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') { 
                        // uploadUrl can be string or object depending on server version, handling both
                        uploadUrl = (typeof json.body === 'object') ? json.body.uploadUrl : json.body;
                        resolve(); 
                    } else {
                        reject(new Error(json.body || "Init failed"));
                    }
                } catch (e) { reject(new Error("GAS 응답 오류(Init): " + res.responseText)); }
            },
            onerror: (e) => reject(new Error("네트워크 오류(Init)"))
        });
    });

    console.log(`[GAS] 세션 생성 완료. 업로드 시작...`);

    // 2. Chunk Upload Loop
    let start = 0;
    const buffer = await blob.arrayBuffer();
    
    while (start < totalSize) {
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunkBuffer = buffer.slice(start, end);
        const chunkBase64 = arrayBufferToBase64(chunkBuffer);
        const percentage = Math.floor((end / totalSize) * 100);
        
        console.log(`[GAS] 전송 중... ${percentage}% (${start} ~ ${end} / ${totalSize})`);

        await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST", 
                url: config.gasUrl,
                data: JSON.stringify({ 
                    folderId: config.folderId, 
                    type: "upload", 
                    clientVersion: CLIENT_VERSION, 
                    uploadUrl: uploadUrl, 
                    chunkData: chunkBase64, 
                    start: start, end: end, total: totalSize,
                    apiKey: config.apiKey
                }),
                headers: { "Content-Type": "text/plain" },
                onload: (res) => {
                    try { 
                        const json = JSON.parse(res.responseText); 
                        if (json.status === 'success') resolve(); 
                        else reject(new Error(json.body || "Upload failed")); 
                    } catch (e) { reject(new Error("GAS 응답 오류(Upload): " + res.responseText)); }
                },
                onerror: (e) => reject(new Error("네트워크 오류(Upload)"))
            });
        });
        
        start = end;
    }

    console.log(`[GAS] 업로드 완료!`);
}

/**
 * Fetch download history from GAS
 * @param {string} seriesTitle
 * @param {string} category 
 * @returns {Promise<string[]>} List of completed episode IDs
 */
async function fetchHistory(seriesTitle, category = 'Webtoon') {
    const config = getConfig();
    if (!config.gasUrl) return [];

    console.log(`[GAS] 다운로드 기록 조회 중... (${seriesTitle})`);

    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: "POST",
            url: config.gasUrl,
            data: JSON.stringify({
                type: "check_history",
                folderId: config.folderId,
                folderName: seriesTitle, // Using seriesTitle as folderName for check
                category: category,
                apiKey: config.apiKey
            }),
            headers: { "Content-Type": "text/plain" },
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.status === 'success') {
                        // json.body should be an array of episode IDs (e.g. ["0001", "0002"])
                        resolve(Array.isArray(json.body) ? json.body : []);
                    } else {
                        console.warn("[GAS] 기록 조회 실패:", json.body);
                        resolve([]);
                    }
                } catch (e) {
                    console.error("[GAS] 응답 파싱 실패:", e);
                    resolve([]);
                }
            },
            onerror: () => {
                console.error("[GAS] 기록 조회 네트워크 오류");
                resolve([]);
            }
        });
    });
}

;// ./src/core/ui.js
/**
 * UI Module for TokiSync
 * Handles Logging Overlay and OS Notifications
 */

class LogBox {
    static instance = null;

    constructor() {
        if (LogBox.instance) return LogBox.instance;
        this.init();
        LogBox.instance = this;
    }

    init() {
        if (document.getElementById('toki-logbox')) return;

        // -- Styles --
        const styleId = 'toki-logbox-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                #toki-logbox {
                    position: fixed; bottom: 20px; right: 20px;
                    width: 320px; height: 200px;
                    background: rgba(0, 0, 0, 0.85);
                    color: #0f0; font-family: monospace; font-size: 11px;
                    border: 1px solid #333; border-radius: 8px;
                    padding: 0; z-index: 9999;
                    display: none; flex-direction: column;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    backdrop-filter: blur(2px);
                }
                #toki-logbox-header {
                    padding: 5px 10px; background: rgba(255,255,255,0.1);
                    border-bottom: 1px solid #333;
                    display: flex; justify-content: space-between; align-items: center;
                    cursor: move; /* Dragging not implemented yet but visual cue */
                }
                #toki-logbox-title { font-weight: bold; color: #fff; }
                #toki-logbox-controls span { cursor: pointer; margin-left: 8px; color: #aaa; }
                #toki-logbox-controls span:hover { color: #fff; }
                #toki-logbox-content {
                    flex: 1; overflow-y: auto; padding: 10px; margin: 0;
                    list-style: none;
                }
                #toki-logbox-content li { margin-bottom: 2px; word-break: break-all; }
                #toki-logbox-content li.error { color: #ff5555; }
                #toki-logbox-content li.success { color: #55ff55; }
                
                /* Scrollbar */
                #toki-logbox-content::-webkit-scrollbar { width: 6px; }
                #toki-logbox-content::-webkit-scrollbar-track { background: transparent; }
                #toki-logbox-content::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
            `;
            document.head.appendChild(style);
        }

        // -- HTML --
        this.container = document.createElement('div');
        this.container.id = 'toki-logbox';
        this.container.innerHTML = `
            <div id="toki-logbox-header">
                <span id="toki-logbox-title">TokiSync Log</span>
                <div id="toki-logbox-controls">
                    <span id="toki-btn-clear" title="Clear">🚫</span>
                    <span id="toki-btn-close" title="Hide">❌</span>
                </div>
            </div>
            <ul id="toki-logbox-content"></ul>
        `;
        document.body.appendChild(this.container);

        // -- Events --
        this.list = this.container.querySelector('#toki-logbox-content');
        
        document.getElementById('toki-btn-clear').onclick = () => this.clear();
        document.getElementById('toki-btn-close').onclick = () => this.hide();
    }

    static getInstance() {
        if (!LogBox.instance) {
            new LogBox();
        }
        return LogBox.instance;
    }

    log(msg, type = 'normal') {
        if (!this.list) return;

        const li = document.createElement('li');
        const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        li.textContent = `[${time}] ${msg}`;
        
        if (type === 'error') li.classList.add('error');
        if (type === 'success') li.classList.add('success');

        this.list.appendChild(li);
        this.list.scrollTop = this.list.scrollHeight;
    }

    error(msg) {
        this.show(); // Auto-show on error
        this.log(msg, 'error');
    }

    success(msg) {
        this.log(msg, 'success');
    }

    clear() {
        if (this.list) this.list.innerHTML = '';
    }

    show() {
        if (this.container) this.container.style.display = 'flex';
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
    }

    toggle() {
        if (!this.container) return;
        if (this.container.style.display === 'none' || this.container.style.display === '') {
            this.show();
        } else {
            this.hide();
        }
    }
}

class Notifier {
    /**
     * Send OS Notification
     * @param {string} title 
     * @param {string} text 
     * @param {Function} onclick 
     */
    static notify(title, text, onclick = null) {
        if (typeof GM_notification === 'function') {
            GM_notification({
                title: title,
                text: text,
                timeout: 5000,
                onclick: onclick
            });
        } else {
            // Fallback
            console.log(`[Notification] ${title}: ${text}`);
            // Do not use alert() as it blocks execution
        }
    }
}

/**
 * Mark downloaded items in the list (UI Sync)
 * @param {string[]} historyList Array of episode IDs (e.g. ["0001", "0002"])
 */
function markDownloadedItems(historyList) {
    if (!historyList || historyList.length === 0) return;

    // Use Set for fast lookup
    const historySet = new Set(historyList.map(id => id.toString())); // Ensure string comparison

    // Target elements: This depends on the specific site structure
    // Common pattern: li.list-item, .list-body > li
    // We reuse logic similar to `getListItems` or target generic list structures found on these sites.
    
    // Attempt 1: NewToki / ManaToki style (.list-item)
    // Attempt 2: BookToki (table rows or similar)
    // We iterate generic selectors commonly used.
    
    const items = document.querySelectorAll('.list-item, .list-row, .post-item, .wr-list li');
    
    let markedCount = 0;

    items.forEach(item => {
        // Find the number logic consistent with downloader.js
        const numElement = item.querySelector('.wr-num, .num');
        if (numElement) {
            // Need to map "Number" to "ID" or verify what ID means.
            // Wait, fetchHistory returns "Episode IDs" which usually correspond to something unique?
            // Actually, in previous steps we used "rootFolder" name for check (series title).
            // SyncService.gs likely returns list of FILENAMES or Folder names if checking inside series folder.
            // If the GAS script returns list of '0001', '0002' (chapter numbers), we match that.
            
            // Assuming historyList contains Chapter Numbers (e.g. "1", "2", "0050")
            const numText = numElement.innerText.trim();
            
            // Normalize: '001' -> '1', '1' -> '1' for comparison
            const normalizedNum = parseInt(numText).toString();
            
            // Check if ANY items in history set matches this number
            // (Assuming historySet has normalized strings like "1", "50")
            // Or if historySet has padded "0001".
            
            // Let's try flexible matching
            let isDownloaded = historySet.has(numText) || historySet.has(normalizedNum);
             
            // Try left-pad match (toki usually uses 4 digit padding in filenames potentially?)
            if(!isDownloaded && normalizedNum.length < 4) {
                 const padded = normalizedNum.padStart(4, '0');
                 isDownloaded = historySet.has(padded);
            }

            if (isDownloaded) {
                // Visual Indicator
                item.style.opacity = '0.6';
                item.style.backgroundColor = 'rgba(0, 255, 0, 0.05)';
                
                // Add Badge if not exists
                if (!item.querySelector('.toki-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'toki-badge';
                    badge.innerText = '✅';
                    badge.style.marginLeft = '5px';
                    badge.style.fontSize = '12px';
                    
                    // Priority: .item-subject > .wr-subject > .title
                    const itemSubject = item.querySelector('.item-subject');
                    const titleEl = item.querySelector('.wr-subject, .title');
                    
                    if (itemSubject) {
                        // Insert at the beginning of .item-subject
                        itemSubject.prepend(badge);
                    } else if (titleEl) {
                        titleEl.prepend(badge);
                    } else {
                        item.appendChild(badge);
                    }
                }
                markedCount++;
            }
        }
    });
    
    console.log(`[UI] ${markedCount}개 항목에 다운로드 완료 표시 적용.`);
}

;// ./src/core/utils.js



function sleep(ms, randomRange) {
    if (randomRange) {
        ms = Math.floor(Math.random() * randomRange) + ms;
    }
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms);
    });
}

function getCommonPrefix(str1, str2) {
    if (!str1 || !str2) return '';
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
        i++;
    }
    return str1.substring(0, i).trim();
}

function waitIframeLoad(iframe, url) {
    return new Promise((resolve) => {
        const handler = () => {
            iframe.removeEventListener('load', handler);
            resolve();
        };
        iframe.addEventListener('load', handler);
        iframe.src = url;
    });
}

// data: JSZip object OR Blob OR Promise<Blob>
async function saveFile(data, filename, type = 'local', extension = 'zip', metadata = {}) {
    const fullFileName = `${filename}.${extension}`;
    
    let content;
    if (data.generateAsync) {
        content = await data.generateAsync({ type: "blob" });
    } else {
        content = await data; // Unbox promise or use blob directly
    }

    if (type === 'local') {
        console.log(`[Local] 다운로드 중... (${fullFileName})`);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = fullFileName;
        link.click();
        URL.revokeObjectURL(link.href);
        link.remove();
        console.log(`[Local] 완료`);
    } else if (type === 'drive') {
        const logger = LogBox.getInstance();
        logger.log(`[Drive] 구글 드라이브 업로드 준비 중... (${fullFileName})`);
        
        try {
            // Call separate GAS module
            // metadata.folderName: Series Title (if provided), otherwise fallback to filename
            const targetFolder = metadata.folderName || filename;
            await uploadToGAS(content, targetFolder, fullFileName, metadata);
            
            logger.success(`[Drive] 업로드 완료: ${fullFileName}`);
            // alert(`구글 드라이브 업로드 완료!\n${fullFileName}`); // Removed to prevent spam
        } catch (e) {
            console.error(e);
            logger.error(`[Drive] 업로드 실패: ${e.message}`);
            // Optional: Notify on error only if it's critical, but for individual files, log is better.
        }
    }
}

;// ./src/core/parser.js
function getListItems() {
    return Array.from(document.querySelector('.list-body').querySelectorAll('li')).reverse();
}

function parseListItem(li) {
    // Extract Number
    const numEl = li.querySelector('.wr-num');
    const num = numEl ? numEl.innerText.trim().padStart(4, '0') : "0000";

    // Extract Title & Link
    const linkEl = li.querySelector('a');
    let title = "Unknown";
    let src = "";
    
    if (linkEl) {
        // Clean title: Remove spans and fix redundant patterns
        title = linkEl.innerHTML.replace(/<span[\s\S]*?\/span>/g, '')
            .replace(/\s+/g, ' ')               // Remove extra spaces
            .replace(/(\d+)\s*-\s*(\1)/, '$1')  // Fix "255 - 255" -> "255"
            .trim();
        src = linkEl.href;
    }

    return { num, title, src, element: li };
}

function getNovelContent(iframeDocument) {
    const contentEl = iframeDocument.querySelector('#novel_content');
    return contentEl ? contentEl.innerText : "";
}

function getImageList(iframeDocument, protocolDomain) {
    // Select images in viewer
    let imgLists = Array.from(iframeDocument.querySelectorAll('.view-padding div img'));

    // Filter visible images
    imgLists = imgLists.filter(img => img.checkVisibility());

    // Extract valid Sources
    // data-l44925d0f9f="src" style lazy loading
    // Regex fallback to find data-path
    
    return imgLists.map(img => {
        let src = img.outerHTML; // Fallback strategy from original code
        try {
            // Find data attribute containing path
            const match = src.match(/\/data[^"]+/);
            if (match) {
                // Prepend domain for CORS / absolute path
                return `${protocolDomain}${match[0]}`;
            }
        } catch (e) {
            console.warn("Image src parse failed:", e);
        }
        return null;
    }).filter(src => src !== null); // Remove nulls
}

;// ./src/core/detector.js
function detectSite() {
    const currentURL = document.URL;
    let site = '뉴토끼'; // Default
    let protocolDomain = 'https://newtoki350.com'; // Default fallback

    if (currentURL.match(/^https:\/\/booktoki[0-9]+.com\/novel\/[0-9]+/)) {
        site = "북토끼"; 
        protocolDomain = currentURL.match(/^https:\/\/booktoki[0-9]+.com/)[0];
    }
    else if (currentURL.match(/^https:\/\/newtoki[0-9]+.com\/webtoon\/[0-9]+/)) {
        site = "뉴토끼"; 
        protocolDomain = currentURL.match(/^https:\/\/newtoki[0-9]+.com/)[0];
    }
    else if (currentURL.match(/^https:\/\/manatoki[0-9]+.net\/comic\/[0-9]+/)) {
        site = "마나토끼"; 
        protocolDomain = currentURL.match(/^https:\/\/manatoki[0-9]+.net/)[0];
    }
    else {
        return null; // Not a valid target page
    }

    return { site, protocolDomain };
}

;// ./src/core/epub.js
class EpubBuilder {
    constructor() {
        this.chapters = [];
    }

    addChapter(title, textContent) {
        // Simple text to HTML conversion
        // Splits by newlines and wraps in <p>
        const htmlContent = textContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => `<p>${line}</p>`)
            .join('\n');
            
        this.chapters.push({ title, content: htmlContent });
    }

    async build(metadata = {}) {
        const zip = new JSZip();
        const title = metadata.title || "Unknown Title";
        const author = metadata.author || "Unknown Author";
        const uid = "urn:uuid:" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());

        // 1. mimetype (must be first, uncompressed)
        zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

        // 2. container.xml
        zip.folder("META-INF").file("container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`);

        // 3. OEBPS Folder
        const oebps = zip.folder("OEBPS");

        // styles.css
        oebps.file("styles.css", `body { font-family: sans-serif; } p { text-indent: 1em; margin-bottom: 0.5em; }`);

        // Chapters
        this.chapters.forEach((chapter, index) => {
            const filename = `chapter_${index + 1}.xhtml`;
            const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>${chapter.title}</title>
<link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
<h2>${chapter.title}</h2>
${chapter.content}
</body>
</html>`;
            oebps.file(filename, xhtml);
        });

        // content.opf
        let manifest = `<item id="style" href="styles.css" media-type="text/css"/>\n`;
        let spine = ``;
        let tocNav = `<navMap>\n`;

        this.chapters.forEach((c, i) => {
            const id = `chap${i + 1}`;
            const href = `chapter_${i + 1}.xhtml`;
            manifest += `<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>\n`;
            spine += `<itemref idref="${id}"/>\n`;
            tocNav += `<navPoint id="${id}" playOrder="${i+1}"><navLabel><text>${c.title}</text></navLabel><content src="${href}"/></navPoint>\n`;
        });
        // Add NCX to manifest
        manifest += `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`;

        const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:title>${title}</dc:title>
        <dc:creator opf:role="aut">${author}</dc:creator>
        <dc:language>ko</dc:language>
        <dc:identifier id="BookId">${uid}</dc:identifier>
    </metadata>
    <manifest>
        ${manifest}
    </manifest>
    <spine toc="ncx">
        ${spine}
    </spine>
</package>`;

        oebps.file("content.opf", opf);

        // toc.ncx
        const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
    <meta name="dtb:uid" content="${uid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${title}</text></docTitle>
${tocNav}
</navMap>
</ncx>`;

        oebps.file("toc.ncx", ncx);

        // Return the ZIP object (which IS the EPUB)
        return zip; 
    }
}

;// ./src/core/cbz.js

class CbzBuilder {
    constructor() {
        this.chapters = [];
    }

    addChapter(title, images) {
        // images: array of { blob, ext }
        this.chapters.push({ title, images });
    }

    async build(metadata = {}) {
        const zip = new JSZip();
        
        this.chapters.forEach((chapter) => {
            // Folder name: "{ChapterTitle}" (Cleaned Title)
            const folderName = chapter.title; 

            chapter.images.forEach((img, idx) => {
                if (img && img.blob) {
                    // File name: "image{0000}{ext}" (No redundant title)
                    const filename = `image${String(idx).padStart(4, '0')}${img.ext}`;
                    zip.folder(folderName).file(filename, img.blob);
                }
            });
        });

        return zip;
    }
}

;// ./src/core/downloader.js







// Processing Loop에 해당되는 로직을 분리 한다.
async function processItem(item, builder, siteInfo, iframe, seriesTitle = "") {
    const { site, protocolDomain } = siteInfo;
    const isNovel = (site === "북토끼");

    await waitIframeLoad(iframe, item.src);
    
    // Apply Random Sleep: 1000ms + (0~3000ms random)
    await sleep(1000, 3000);
    
    const iframeDoc = iframe.contentWindow.document;

    if (isNovel) {
        const text = getNovelContent(iframeDoc);
        // Add chapter to existing builder instance
        builder.addChapter(item.title, text);
    } 
    else {
        // Webtoon / Manga
        const imageUrls = getImageList(iframeDoc, protocolDomain);
        console.log(`이미지 ${imageUrls.length}개 감지`);

        // Fetch Images Parallel
        const images = await fetchImages(imageUrls);
        
        // Add chapter to builder
        // Clean the title if seriesTitle exists
        let chapterTitleOnly = item.title;
        if (seriesTitle && chapterTitleOnly.startsWith(seriesTitle)) {
            chapterTitleOnly = chapterTitleOnly.replace(seriesTitle, '').trim();
        }

        // Construct clean folder name: "0001 1화"
        const cleanChapterTitle = `${item.num} ${chapterTitleOnly}`;
        builder.addChapter(cleanChapterTitle, images);
    }
}


async function tokiDownload(startIndex, lastIndex, policy = 'folderInCbz') {
    const logger = LogBox.getInstance();
    logger.init();
    logger.show();
    logger.log(`다운로드 시작 (정책: ${policy})...`);

    const siteInfo = detectSite();
    if (!siteInfo) {
        alert("지원하지 않는 사이트이거나 다운로드 페이지가 아닙니다.");
        return;
    }
    const { site, protocolDomain } = siteInfo;
    const isNovel = (site === "북토끼");

    try {
        // Prepare Strategy Variables
        let mainBuilder = null;
        let masterZip = null;
        let extension = 'zip';
        let destination = 'local';
        
        let buildingPolicy = policy; 
        if (policy === 'gasUpload') {
            buildingPolicy = 'individual';
            destination = 'drive';
        }
        
        // Determine Category for GAS
        let category = 'Webtoon';
        if (site === '북토끼') category = 'Novel';
        else if (site === '마나토끼') category = 'Manga';

        if (buildingPolicy === 'folderInCbz') {
            if (isNovel) {
                mainBuilder = new EpubBuilder();
                extension = 'epub';
            } else {
                mainBuilder = new CbzBuilder();
                extension = 'cbz';
            }
        } else if (buildingPolicy === 'zipOfCbzs') {
            masterZip = new JSZip(); // Master Container
            extension = isNovel ? 'epub' : 'cbz';
        } else {
            // Individual (or gasUpload): No shared builder or master zip needed initially
            extension = isNovel ? 'epub' : 'cbz';
        }

        // Get List
        let list = getListItems();

        // Filter Logic
        if (startIndex) {
            list = list.filter(li => {
                const num = parseInt(li.querySelector('.wr-num').innerText);
                return num >= startIndex;
            });
        }
        if (lastIndex) {
            list = list.filter(li => {
                const num = parseInt(li.querySelector('.wr-num').innerText);
                return num <= lastIndex;
            });
        }
        
        logger.log(`총 ${list.length}개 항목 처리 예정.`);

        if (list.length === 0) {
            alert("다운로드할 항목이 없습니다.");
            return;
        }

        // Folder Name (Title) & Common Title Extraction
        const first = parseListItem(list[0]);
        const last = parseListItem(list[list.length - 1]);
        
        // Extract Series ID from URL
        // https://.../webtoon/123456?page=...
        // Pattern: /novel/(\d+) or /webtoon/(\d+) or /comic/(\d+)
        const idMatch = document.URL.match(/\/(novel|webtoon|comic)\/([0-9]+)/);
        const seriesId = idMatch ? idMatch[2] : "0000";

        let seriesTitle = "";
        let rootFolder = "";

        if (list.length > 1) {
            seriesTitle = getCommonPrefix(first.title, last.title);
            if (seriesTitle.length > 2) {
                // If common prefix exists, use it as series title
                 rootFolder = `[${seriesId}] ${seriesTitle}`;
            } else {
                 // Fallback format if no clear prefix found (rare)
                 rootFolder = `[${seriesId}] ${first.title} ~ ${last.title}`;
            }
        } else {
             rootFolder = `[${seriesId}] ${first.title}`;
        }

        // [Fix] Append Range [Start-End] for Local Merged Files (folderInCbz / zipOfCbzs)
        // GAS Upload uses individual files so no range needed in folder name
        if (buildingPolicy === 'folderInCbz' || buildingPolicy === 'zipOfCbzs') {
            const startNum = parseInt(first.num);
            const endNum = parseInt(last.num);
            const rangeStr = (list.length > 1) ? ` [${startNum}-${endNum}]` : ` [${startNum}]`;
            rootFolder += rangeStr;
        }

        // Create IFrame
        const iframe = document.createElement('iframe');
        iframe.width = 600; iframe.height = 600;
        iframe.style.position = 'fixed'; iframe.style.top = '-9999px'; // Hide it
        document.body.appendChild(iframe);

        // --- Processing Loop ---
        for (let i = 0; i < list.length; i++) {
            const item = parseListItem(list[i].element || list[i]); 
            console.clear();
            logger.log(`[${i + 1}/${list.length}] 처리 중: ${item.title}`);

            // Decision based on Policy
            let currentBuilder = null;

            if (buildingPolicy === 'folderInCbz') {
                currentBuilder = mainBuilder;
            } else {
                // For 'zipOfCbzs' and 'individual', we need a FRESH builder per item
                if (isNovel) currentBuilder = new EpubBuilder();
                else currentBuilder = new CbzBuilder();
            }

            // Process Item
            try {
                await processItem(item, currentBuilder, siteInfo, iframe, seriesTitle);
            } catch (err) {
                console.error(err);
                logger.error(`항목 실패 (${item.title}): ${err.message}`);
                continue; // Skip faulty item but continue loop
            }

            // Post-Process for Non-Default Policies
            if (buildingPolicy !== 'folderInCbz') {
                // Build the individual chapter file
             
                // Clean Filename Logic
                // 1. GAS Upload (Drive): Format "0001 - 1화" (Remove Series Title)
                // 2. Local Individual: Format "0001 - SeriesTitle 1화" (Keep Full Title)
                
                let chapterTitle = item.title;
                
                // Only clean (remove series title) if uploading to Drive
                if (destination === 'drive' && seriesTitle && chapterTitle.startsWith(seriesTitle)) {
                    chapterTitle = chapterTitle.replace(seriesTitle, '').trim();
                }

                // Final Filename: "0001 - Title"
                const fullFilename = `${item.num} - ${chapterTitle}`;

                const innerZip = await currentBuilder.build({ title: fullFilename, author: site });
                const blob = await innerZip.generateAsync({ type: "blob" });

                if (buildingPolicy === 'zipOfCbzs') {
                    console.log(`[MasterZip] 추가 중: ${fullFilename}.${extension}`);
                    masterZip.file(`${fullFilename}.${extension}`, blob);
                } else if (buildingPolicy === 'individual') {
                    // Immediate Save (Local or Drive based on destination)
                    await saveFile(blob, fullFilename, destination, extension, {
                        folderName: rootFolder, // [ID] Series Title
                        category: category
                    }); 
                }
            }
        }

        // Cleanup
        iframe.remove();

        // Finalize Build
        // Finalize Build
        if (buildingPolicy === 'folderInCbz' && mainBuilder) {
            logger.log("통합 파일 생성 및 저장 중...");
            const zip = await mainBuilder.build({ title: rootFolder, author: site });
            await saveFile(zip, rootFolder, destination, extension, { category });
        } else if (buildingPolicy === 'zipOfCbzs' && masterZip) {
            logger.log("Master ZIP 파일 생성 및 저장 중...");
            await saveFile(masterZip, rootFolder, 'local', 'zip', { category }); 
        }

        logger.success("모든 작업 완료!");
        Notifier.notify("다운로드 완료", `${rootFolder} (${list.length} 항목)`);

    } catch (error) {
        console.error(error);
        alert(`오류 발생: ${error.message}`);
        LogBox.getInstance().error(error.message);
    }
}

async function fetchImages(imageUrls) {
    const promises = imageUrls.map(async (src) => {
        try {
            const response = await fetch(src);
            const blob = await response.blob();
            
            // Metadata Extraction
            let ext = '.jpg';
            const extMatch = src.match(/\.[a-zA-Z]+$/);
            
            if (extMatch) {
                ext = extMatch[0];
            } else {
                // Fallback: Infer from Content-Type
                const type = response.headers.get('content-type');
                if (type) {
                    if (type.includes('png')) ext = '.png';
                    else if (type.includes('gif')) ext = '.gif';
                    else if (type.includes('webp')) ext = '.webp';
                    else if (type.includes('jpeg') || type.includes('jpg')) ext = '.jpg';
                }
            }

            return { src, blob, ext };
        } catch (e) {
            console.error(`이미지 다운로드 실패: ${src}`, e);
            return null;
        }
    });

    return await Promise.all(promises);
}

;// ./src/core/main.js








function main() {
    console.log("🚀 TokiDownloader Loaded (New Core)");
    
    // 1. Global Settings (Always available)
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('설정', () => showConfigModal());
        GM_registerMenuCommand('로그창 토글', () => LogBox.getInstance().toggle());
        GM_registerMenuCommand('설정 확인', () => {
            const config = getConfig();
            alert(`GAS URL: ${config.gasUrl}\nGoogle Drive 폴더 ID: ${config.folderId}\n다운로드 정책: ${config.policy}`);
        });

        GM_registerMenuCommand('Viewer 열기 (설정 전송)', () => {
             const config = getConfig();
             const viewerUrl = "https://pray4skylark.github.io/tokiSync/";
             const win = window.open(viewerUrl, "_blank");
             
             if(win) {
                 // Try to send config periodically until success or timeout
                 let attempts = 0;
                 const interval = setInterval(() => {
                     attempts++;
                     win.postMessage({ type: 'TOKI_CONFIG', config: config }, '*');
                     if(attempts > 10) clearInterval(interval);
                 }, 500);
             } else {
                 alert("팝업 차단을 해제해주세요.");
             }
        });
    }

    const siteInfo = detectSite();
    if(!siteInfo) return; // Not a target page

    // 2. Site Specific Commands
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('전체 다운로드', () => {
            const config = getConfig();
            tokiDownload(undefined, undefined, config.policy);
        });
        
        GM_registerMenuCommand('N번째 회차부터', () => {
             const start = prompt('몇번째 회차부터 저장할까요?', 1);
             if(start) {
                 const config = getConfig();
                 tokiDownload(parseInt(start), undefined, config.policy);
             }
        });

        GM_registerMenuCommand('N번째 회차부터 N번째 까지', () => {
             const start = prompt('몇번째 회차부터 저장할까요?', 1);
             const end = prompt('몇번째 회차까지 저장할까요?', 2);
             if(start && end) {
                 const config = getConfig();
                 tokiDownload(parseInt(start), parseInt(end), config.policy);
             }
        });
    }

    // 3. History Sync (Async)
    console.log('[TokiSync] Starting history sync...');
    (async () => {
        try {
            const list = getListItems();
            console.log(`[TokiSync] Found ${list.length} list items`);
            if (list.length === 0) {
                console.warn('[TokiSync] No list items found, skipping history sync');
                return;
            }

            // Replicate RootFolder Logic (Series Title Resolution)
            const first = parseListItem(list[0]);
            const last = parseListItem(list[list.length - 1]);

            // Extract Series ID from URL
            const idMatch = document.URL.match(/\/(novel|webtoon|comic)\/([0-9]+)/);
            const seriesId = idMatch ? idMatch[2] : "0000";

            let seriesTitle = "";
            let rootFolder = "";

            if (list.length > 1) {
                seriesTitle = getCommonPrefix(first.title, last.title);
                if (seriesTitle.length > 2) {
                    rootFolder = `[${seriesId}] ${seriesTitle}`;
                } else {
                    rootFolder = `[${seriesId}] ${first.title} ~ ${last.title}`;
                }
            } else {
                rootFolder = `[${seriesId}] ${first.title}`;
            }

            // Determine Category
            let category = 'Webtoon';
            if (siteInfo.site === '북토끼') category = 'Novel';
            else if (siteInfo.site === '마나토끼') category = 'Manga';

            // Fetch & Mark
            console.log(`[TokiSync] Fetching history for: ${rootFolder} (${category})`);
            const history = await fetchHistory(rootFolder, category);
            console.log(`[TokiSync] Received ${history.length} history items:`, history);
            if (history.length > 0) {
                markDownloadedItems(history);
            } else {
                console.log('[TokiSync] No history items to mark');
            }
        } catch (e) {
            console.warn('[TokiSync] History check failed:', e);
        }
    })();
}

// Auto-run main if imported? Or let index.js call it.
// Since we are refactoring, likely index.js will just import and call main().

;// ./src/core/index.js




(function () {
    'use strict';
    
    // Viewer Config Injection (Zero-Config)
    if (location.hostname.includes('github.io') || location.hostname.includes('localhost') || location.hostname.includes('127.0.0.1')) {
        console.log("📂 TokiView (Frontend) detected. Injecting Config...");
        
        const config = getConfig();
        
        if (config.gasUrl && config.folderId) {
            // [Fix] Retry injection to handle timing issues (Viewer might not be ready)
            let retryCount = 0;
            const maxRetries = 5;
            let injectionConfirmed = false;
            let retryTimer = null;
            let pollTimer = null;
            
            // Check localStorage to verify injection success
            const checkInjection = () => {
                const storedUrl = localStorage.getItem('TOKI_API_URL');
                const storedId = localStorage.getItem('TOKI_ROOT_ID');
                const storedKey = localStorage.getItem('TOKI_API_KEY');
                
                // All three values must match
                if (storedUrl === config.gasUrl && 
                    storedId === config.folderId && 
                    storedKey === (config.apiKey || '')) {
                    
                    injectionConfirmed = true;
                    if (retryTimer) clearTimeout(retryTimer);
                    if (pollTimer) clearInterval(pollTimer);
                    console.log("✅ Config injection confirmed (localStorage verified)");
                    return true;
                }
                return false;
            };
            
            const injectConfig = () => {
                if (injectionConfirmed) return; // Stop if already confirmed
                
                window.postMessage({ 
                    type: 'TOKI_CONFIG', 
                    url: config.gasUrl,
                    folderId: config.folderId,
                    apiKey: config.apiKey
                }, '*');
                
                console.log(`🚀 Config Injection Attempt ${retryCount + 1}/${maxRetries}:`, { 
                    gasUrl: config.gasUrl, 
                    apiKey: config.apiKey ? '***' : '(empty)'
                });

                retryCount++;
                if (retryCount < maxRetries && !injectionConfirmed) {
                    retryTimer = setTimeout(injectConfig, 1000);
                }
            };

            // Start polling localStorage (check every 200ms)
            pollTimer = setInterval(checkInjection, 200);
            
            // Timeout after 5 seconds
            setTimeout(() => {
                if (pollTimer) clearInterval(pollTimer);
                if (!injectionConfirmed) {
                    console.warn("⚠️ Config injection timeout (5s)");
                }
            }, 5000);

            // Start injection loop
            setTimeout(injectConfig, 500);

        } else {
            console.warn("⚠️ GAS URL or Folder ID missing. Please configure via menu.");
        }
        
        // API Proxy (CORS Bypass using GM_xmlhttpRequest)
        window.addEventListener('message', (event) => {
            // Security: Only accept from same origin
            if (event.source !== window) return;
            
            const msg = event.data;
            if (msg.type === 'TOKI_API_REQUEST') {
                console.log('[Proxy] Received API request:', msg.payload);
                
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: config.gasUrl,
                    data: JSON.stringify(msg.payload),
                    headers: { 'Content-Type': 'text/plain' },
                    onload: (response) => {
                        try {
                            const result = JSON.parse(response.responseText);
                            window.postMessage({
                                type: 'TOKI_API_RESPONSE',
                                requestId: msg.requestId,
                                result: result
                            }, '*');
                        } catch (e) {
                            window.postMessage({
                                type: 'TOKI_API_RESPONSE',
                                requestId: msg.requestId,
                                error: 'Parse error: ' + e.message
                            }, '*');
                        }
                    },
                    onerror: () => {
                        window.postMessage({
                            type: 'TOKI_API_RESPONSE',
                            requestId: msg.requestId,
                            error: 'Network error'
                        }, '*');
                    }
                });
            }
        });
        
        console.log("✅ API Proxy initialized (CORS bypass)");
    }
    
    main();
})();
/******/ })()
;