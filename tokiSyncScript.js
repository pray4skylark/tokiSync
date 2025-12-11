// ==UserScript==
// @name         TokiSync (Loader)
// @namespace    https://github.com/pray4skylark/tokiSync
// @version      3.0.0-beta.251212.0003
// @description  TokiSync Core Script Loader (GitHub CDN)
// @author       pray4skylark
// @updateURL    https://github.com/pray4skylark/tokiSync/raw/main/tokiSyncScript.js
// @downloadURL  https://github.com/pray4skylark/tokiSync/raw/main/tokiSyncScript.js
// @supportURL   https://github.com/pray4skylark/tokiSync/issues
// @match        https://*.com/webtoon/*
// @match        https://*.com/novel/*
// @match        https://*.net/comic/*
// @match        https://script.google.com/*
// @match        https://*.googleusercontent.com/*
// @icon         https://github.com/user-attachments/assets/99f5bb36-4ef8-40cc-8ae5-e3bf1c7952ad
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
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
                        // Ping 수신 시 Init으로 응답
                        // console.log("📡 Received Ping -> Sending Init");
                        window.postMessage({ type: 'TOKI_INIT', folderId: folderId }, '*');
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


    // #region 2. Core Script Loading (Content Caching) ==========================
    // 강제 업데이트 메뉴
    GM_registerMenuCommand('⚡️ 강제 업데이트 확인', () => {
        GM_setValue(CACHE_KEY_TIME, 0);
        GM_setValue(PINNED_VER_KEY, "");
        GM_deleteValue(STORED_CORE_KEY);
        alert("캐시를 초기화했습니다. 최신 버전을 확인합니다.");
        location.reload();
    });

    async function checkAndLoadCore() {
        const pinnedVer = GM_getValue(PINNED_VER_KEY);
        const latestVer = await fetchLatestVersion();

        // 1. 저장된 스크립트 확인 (속도 최적화)
        const storedScript = GM_getValue(STORED_CORE_KEY, "");
        if (pinnedVer && pinnedVer === latestVer && storedScript) {
            // 버전 변경 없음 & 스크립트 보유 -> 즉시 실행
            console.log(`⚡️ Loading stored Core (${pinnedVer}) - No Network`);
            executeScript(storedScript);
            return;
        }

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
                            } else resolve(cachedVer || "v3.0.0-beta.251211");
                        } catch (e) { resolve(cachedVer || "v3.0.0-beta.251211"); }
                    } else resolve(cachedVer || "v3.0.0-beta.251211");
                },
                onerror: () => resolve(cachedVer || "v3.0.0-beta.251211")
            });
        });
    }

    function fetchAndStoreScript(version, reloadAfter = false) {
        // [Optimization] Remove timestamp to use CDN cache effectively
        // const cdnUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${version}/${CORE_FILENAME}?t=${Date.now()}`;
        const cdnUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${version}/${CORE_FILENAME}`;

        console.log(`☁️ Fetching Core Script from: ${cdnUrl}`);

        GM_xmlhttpRequest({
            method: "GET",
            url: cdnUrl,
            onload: function (response) {
                if (response.status === 200) {
                    const scriptContent = response.responseText;
                    
                    // 무결성 최소 검즈
                    if (!scriptContent.includes("window.TokiSyncCore")) {
                        console.error("❌ Invalid Script Content");
                        return;
                    }

                    // [핵심] 스크립트 저장
                    GM_setValue(STORED_CORE_KEY, scriptContent);
                    console.log("💾 Core Script Stored to Storage");

                    if(reloadAfter) {
                        location.reload();
                    } else {
                        executeScript(scriptContent);
                    }
                } else {
                    console.error("❌ Fetch Failed:", response.status);
                    alert("스크립트 다운로드 실패");
                }
            },
            onerror: () => alert("네트워크 오류")
        });
    }

    function executeScript(scriptContent) {
        try {
            const runScript = new Function("window", scriptContent);
            runScript(window);

                if (typeof window.TokiSyncCore === 'function') {
                    window.TokiSyncCore({
                        loaderVersion: "3.0.0-beta.251212.0003", // 현재 로더 버전 전달
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