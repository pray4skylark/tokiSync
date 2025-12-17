// ==UserScript==
// @name         TokiSync (Loader)
// @namespace    https://github.com/pray4skylark/tokiSync
// @version      3.1.0-beta.251216.0002
// @description  TokiSync Core Script Loader (GitHub CDN)
// @author       pray4skylark
// @updateURL    https://github.com/pray4skylark/tokiSync/raw/main/tokiSyncScript.js
// @downloadURL  https://github.com/pray4skylark/tokiSync/raw/main/tokiSyncScript.js
// @supportURL   https://github.com/pray4skylark/tokiSync/issues
// @match        https://*.com/webtoon/*
// @match        https://*.com/novel/*
// @match        https://*.net/comic/*
// @match        https://script.google.com/*
// @match        https://*.github.io/tokiSync/*
// @match        https://pray4skylark.github.io/tokiSync/*
// @match        http://127.0.0.1:5500/*
// @match        http://localhost:*


// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.1.0/jszip-utils.js
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    console.log("🚀 TokiSync Loader Initialized (GitHub CDN)");

    const CFG_FOLDER_ID = 'TOKI_FOLDER_ID';


    // ⭐️ 핵심: GitHub 사용자명, 레포지토리명, 버전 설정
    const GITHUB_USER = "pray4skylark";
    const GITHUB_REPO = "tokiSync";
    const CORE_FILENAME = "tokiSyncCore.js";

    // 캐시 및 버전 설정
    const CACHE_KEY_VER = "TOKI_CACHE_VERSION";
    const CACHE_KEY_TIME = "TOKI_CACHE_TIME";
    const STORED_CORE_KEY = "TOKI_CORE_SCRIPT";
    const PINNED_VER_KEY = "TOKI_PINNED_VERSION";
    const CACHE_DURATION = 60 * 60 * 1000; // 1시간
    const CFG_DEBUG_KEY = "TOKI_DEBUG_MODE";

    // #region 1. TokiView Integration (Handshake) ==============================
    // 구글 스크립트 페이지(TokiView)인 경우
    if (location.hostname.includes('google.com') || location.hostname.includes('googleusercontent.com')) {
        if (document.title.includes('TokiView') || document.title.includes('TokiLibrary')) {
            console.log("📂 TokiView detected. Listening for Handshake...");

            // Handshake Listener
            window.addEventListener("message", (event) => {
                if (event.data.type === 'TOKI_PING') {
                    const folderId = GM_getValue(CFG_FOLDER_ID);
                    if (folderId) {
                        // Ping 수신 시 Init으로 응답 (event.source가 있으면 거기로, 없으면 window로)
                        // This fixes Parent -> Iframe communication
                        const target = event.source || window;
                        target.postMessage({ type: 'TOKI_INIT', folderId: folderId }, '*');
                    }
                }
            });

            // Legacy Fallback (500ms 후 1회 발송)
            setTimeout(() => {
                const folderId = GM_getValue(CFG_FOLDER_ID);
                if (folderId) {
                    window.postMessage({ type: 'TOKI_INIT', folderId: folderId }, '*');
                    console.log("✅ (Fallback) Config injected:", folderId);
                }
            }, 500);
            return; // Core 로드 중단
        }
    }
    // #endregion ================================================================

    // #region 1-B. GitHub Pages (New Frontend) Integration
    if (location.hostname.includes('github.io') || location.hostname.includes('localhost') || location.hostname.includes('127.0.0.1')) {
        console.log("📂 TokiView (GitHub Pages) detected. Injecting Config...");

        const folderId = GM_getValue(CFG_FOLDER_ID);
        // Custom Deploy ID (Personal)
        const customDeployId = GM_getValue("TOKI_DEPLOY_ID", ""); 
        // Default Deploy ID (Shared/Auto-Update) - v3.1.0-beta.251216
        const DEFAULT_ID = "AKfycbydljTPV1VvWTqRUBxegOSPPnirFQB7TN28A3C7ScZix7cErvvp2id3N20fIT3PTnfy"; 

        const targetId = customDeployId || DEFAULT_ID;
        const apiUrl = `https://script.google.com/macros/s/${targetId}/exec`;

        if (folderId) {
            // Wait slightly for page load
            setTimeout(() => {
                window.postMessage({ 
                    type: 'TOKI_CONFIG', 
                    url: apiUrl, 
                    folderId: folderId,
                    deployId: targetId
                }, '*');
                console.log("✅ Config Injected to Frontend:", targetId);
            }, 500);
        }
    }
    // #endregion ================================================================


    // #region 2. Core Script Loading (Content Caching) ==========================
    // 강제 업데이트 메뉴
    GM_registerMenuCommand('⚡️ 강제 업데이트 확인', () => {
        GM_setValue(CACHE_KEY_TIME, 0);
        GM_setValue(PINNED_VER_KEY, "");
        GM_deleteValue(STORED_CORE_KEY);
        alert("캐시를 초기화했습니다. 최신 버전을 확인합니다.");
        location.reload();
    });

    // [DEBUG] Core 직접 주입 메뉴
    GM_registerMenuCommand('🛠 [Debug] Core 직접 입력', () => {
        const oldUI = document.getElementById('tokiDebugInputUI');
        if (oldUI) oldUI.remove();

        const div = document.createElement('div');
        div.id = 'tokiDebugInputUI';
        div.style.cssText = "position:fixed; top:10%; left:10%; width:80%; height:80%; background:white; z-index:999999; border:2px solid red; padding:20px; box-shadow:0 0 20px rgba(0,0,0,0.5); display:flex; flex-direction:column;";
        
        div.innerHTML = `
            <h2 style="margin:0 0 10px 0; color:red;">🛠 Core Script Manual Injection</h2>
            <p style="font-size:12px; color:#666;">여기에 tokiSyncCore.js 전체 코드를 붙여넣으세요. (기존 캐시 덮어씀)</p>
            <textarea id="tokiDebugTextarea" style="flex:1; width:100%; margin-bottom:10px; font-family:monospace; font-size:11px;"></textarea>
            <div style="display:flex; gap:10px;">
                <button id="tokiDebugSaveBtn" style="flex:1; padding:10px; background:red; color:white; font-weight:bold; border:none; cursor:pointer;">💾 저장 및 실행</button>
                <button id="tokiDebugCloseBtn" style="flex:0 0 100px; padding:10px; background:#ccc; border:none; cursor:pointer;">닫기</button>
            </div>
        `;
        document.body.appendChild(div);

        document.getElementById('tokiDebugCloseBtn').onclick = () => div.remove();
        document.getElementById('tokiDebugSaveBtn').onclick = () => {
            const content = document.getElementById('tokiDebugTextarea').value;
            if (!content.trim()) { alert("내용이 비어있습니다."); return; }
            
            if (!content.includes("window.TokiSyncCore")) {
                if(!confirm("⚠️ Core 스크립트 형식이 아닌 것 같습니다 (window.TokiSyncCore 미포함).\n그래도 저장하시겠습니까?")) return;
            }

            GM_setValue(STORED_CORE_KEY, content);
            GM_setValue(PINNED_VER_KEY, "MANUAL_DEBUG"); // 버전 고정
            alert("💾 Core 스크립트가 저장되었습니다.\n페이지를 새로고침하여 적용합니다.");
            location.reload();
        };
    });

    /**
     * 1. 저장된 스크립트 버전과 GitHub 최신 버전을 비교합니다.
     * 2. 업데이트가 필요하면 사용자에게 알림을 표시합니다.
     * 3. 최신 스크립트 또는 캐시된 스크립트를 로드합니다.
     */
    async function checkAndLoadCore() {
        const pinnedVer = GM_getValue(PINNED_VER_KEY);
        const latestVer = await fetchLatestVersion();

        // 1. 저장된 스크립트 확인
        const storedScript = GM_getValue(STORED_CORE_KEY, "");
        
        // [Verified] Manual Injection Support
        if (pinnedVer === "MANUAL_DEBUG" && storedScript) {
             console.log("🛠 Loading Manually Injected Core Script");
             executeScript(storedScript);
             return;
        }

        /* [Disabled for Remote Verification]
        if (pinnedVer && pinnedVer === latestVer && storedScript) {
            // 버전 변경 없음 & 스크립트 보유 -> 즉시 실행
            console.log(`⚡️ Loading stored Core (${pinnedVer}) - No Network`);
            executeScript(storedScript);
            return;
        }
        */

        // 2. 최초 실행 또는 업데이트 필요
        if (!pinnedVer) {
            console.log(`📌 First run: Pinning to ${latestVer}`);
            GM_setValue(PINNED_VER_KEY, latestVer);
            fetchAndStoreScript(latestVer);
            return;
        }

        if (pinnedVer !== latestVer) {
            console.log(`✨ Update Available: ${pinnedVer} -> ${latestVer}`);
            GM_registerMenuCommand(`✨ 업데이트 가능 (${latestVer})`, () => {
                if (confirm(`새 버전(${latestVer})으로 업데이트하시겠습니까?`)) {
                    GM_setValue(PINNED_VER_KEY, latestVer);
                    GM_deleteValue(STORED_CORE_KEY); // 구버전 삭제
                    alert("업데이트를 진행합니다. 잠시 후 새로고침됩니다.");
                    fetchAndStoreScript(latestVer, true); // true = reload after
                }
            });
            // 업데이트 전까지는 구버전(pinnedVer) 로드
            if (storedScript) {
                executeScript(storedScript);
            } else {
                fetchAndStoreScript(pinnedVer); // 구버전이라도 받아옴
            }
        } else {
            // 버전은 같은데 script가 없음 (삭제됨? 오류?)
            fetchAndStoreScript(pinnedVer);
        }
    }

    /**
     * GitHub API를 통해 최신 릴리스 태그(버전)를 조회합니다.
     * API 호출 제한을 피하기 위해 캐시(1시간)를 사용합니다.
     * @returns {Promise<string>} 최신 버전 태그 (e.g. "v3.1.0")
     */
    function fetchLatestVersion() {
        return new Promise((resolve) => {
            const cachedVer = GM_getValue(CACHE_KEY_VER);
            const cachedTime = GM_getValue(CACHE_KEY_TIME, 0);
            const isDebug = GM_getValue(CFG_DEBUG_KEY, false);
            const now = Date.now();

            if (isDebug) console.log("🐛 Debug Mode: Cache Skipped");
            else if (cachedVer && (now - cachedTime < CACHE_DURATION)) {
                resolve(cachedVer);
                return;
            }

            GM_xmlhttpRequest({
                method: "GET",
                url: `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/tags`,
                onload: (res) => {
                    if (res.status === 200) {
                        try {
                            const tags = JSON.parse(res.responseText);
                            if (tags.length > 0) {
                                const latestVer = tags[0].name;
                                GM_setValue(CACHE_KEY_VER, latestVer);
                                GM_setValue(CACHE_KEY_TIME, now);
                                resolve(latestVer);
                            } else resolve(cachedVer || "v3.0.0-beta.251215.0002");
                        } catch (e) { resolve(cachedVer || "v3.0.0-beta.251215.0002"); }
                    } else resolve(cachedVer || "v3.0.0-beta.251215.0002");
                },
                onerror: () => resolve(cachedVer || "v3.0.0-beta.251215.0002")
            });
        });
    }

    /**
     * GitHub Raw 서버에서 실제 스크립트 파일을 다운로드하고 저장합니다.
     * @param {string} version - 다운로드할 버전
     * @param {boolean} [reloadAfter=false] - 다운로드 후 페이지 새로고침 여부
     */
    function fetchAndStoreScript(version, reloadAfter = false) {
        // [Changed] Use Raw GitHub for instant updates (Bypass CDN delay)
        const cdnUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${version}/${CORE_FILENAME}?t=${Date.now()}`;
        
        console.log(`☁️ Fetching Core Script from: ${cdnUrl}`);

        GM_xmlhttpRequest({
            method: "GET",
            url: cdnUrl,
            onload: function (response) {
                if (response.status === 200) {
                    const scriptContent = response.responseText;
                    
                    if (!scriptContent.includes("window.TokiSyncCore")) {
                        console.error("❌ Invalid Script Content");
                        alert("스크립트 내용이 올바르지 않습니다.");
                        return;
                    }

                    console.log(`✅ Core Updated to ${version}`);
                    GM_setValue(STORED_CORE_KEY, scriptContent);
                    
                    if(reloadAfter) {
                        alert(`[TokiSync] ${version} 업데이트 완료! 새로고침합니다.`);
                        location.reload();
                    } else {
                        executeScript(scriptContent);
                    }
                } else {
                    console.error("❌ Fetch Failed:", response.status);
                    alert(`스크립트 다운로드 실패: ${response.status}`);
                }
            },
            onerror: (e) => {
                console.error("❌ Network Error", e);
                alert("네트워크 오류 발생");
            }
        });
    }

    /**
     * 저장된 스크립트 문자열을 `new Function`으로 실행합니다.
     * GM_* 함수들을 Core 스크립트로 전달합니다 (Sandboxing 우회).
     * @param {string} scriptContent - 실행할 JS 코드 문자열
     */
    function executeScript(scriptContent) {
        try {
            const runScript = new Function("window", scriptContent);
            runScript(window);

                if (typeof window.TokiSyncCore === 'function') {
                    window.TokiSyncCore({
                        loaderVersion: "3.1.0-beta.251216.0002", // View Migration Update
                        GM_registerMenuCommand: GM_registerMenuCommand,
                        GM_xmlhttpRequest: GM_xmlhttpRequest,
                        GM_setValue: GM_setValue,
                        GM_getValue: GM_getValue,
                        GM_deleteValue: GM_deleteValue,
                        JSZip: JSZip
                    });
            } else {
                throw new Error("window.TokiSyncCore missing");
            }
        } catch (e) {
            console.error("❌ Execution Failed:", e);
            // 실행 실패 시 캐시 삭제 (손상 가능성)
            GM_deleteValue(STORED_CORE_KEY);
        }
    }

    checkAndLoadCore();
    // #endregion
})();