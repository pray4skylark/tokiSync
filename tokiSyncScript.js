// ==UserScript==
// @name         TokiSync (Loader)
// @namespace    https://github.com/pray4skylark/tokiSync
// @version      3.0.0-BETA3
// @description  TokiSync Core Script Loader (GitHub CDN)
// @author       pray4skylark
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

    // [TokiView Integration]
    // 구글 스크립트 페이지(TokiView)인 경우 설정을 주입하고 종료합니다.
    if (location.hostname.includes('google.com') || location.hostname.includes('googleusercontent.com')) {
        // 타이틀 등으로 TokiView인지 확인 (필요 시 더 정교하게 수정)
        if (document.title.includes('TokiView') || document.title.includes('TokiLibrary')) {
            console.log("📂 TokiView detected. Preparing to inject config...");

            // Core와 동일한 키 사용 (TOKI_FOLDER_ID)
            const folderId = GM_getValue('TOKI_FOLDER_ID');
            if (folderId) {
                // 페이지 로딩 대기 후 주입
                setTimeout(() => {
                    window.postMessage({ type: 'SET_CONFIG', folderId: folderId }, '*');
                    console.log("✅ Config injected to TokiView:", folderId);
                }, 500);

                // 혹시 iframe 내부라면 부모에게도 전송 (상호 보완)
                if (window.top !== window.self) {
                    window.top.postMessage({ type: 'SET_CONFIG', folderId: folderId }, '*');
                }
            } else {
                console.log("⚠️ No Folder ID found in script storage (TOKI_FOLDER_ID).");
            }
            return; // Core 스크립트 로드 중단
        }
    }

    const CFG_URL_KEY = "TOKI_GAS_URL";
    // const CFG_SECRET_KEY = "TOKI_SECRET_KEY"; // Removed

    // ⭐️ 핵심: GitHub 사용자명, 레포지토리명, 버전 설정
    const GITHUB_USER = "pray4skylark";
    const GITHUB_REPO = "tokiSync";
    const CORE_FILENAME = "tokiSyncCore.js";

    // 캐시 및 버전 설정
    const CACHE_DURATION = 60 * 60 * 1000;
    const CACHE_VER_KEY = "TOKI_CACHE_VERSION";
    const CACHE_TIME_KEY = "TOKI_CACHE_TIME";
    const PINNED_VER_KEY = "TOKI_PINNED_VERSION";
    const CFG_DEBUG_KEY = "TOKI_DEBUG_MODE"; // Core와 공유하는 디버그 설정

    // 1. 설정 검사 제거 (v3.0.0부터 Core에서 자동 설정 수행)
    // if (!apiUrl || !secretKey) { ... }

    // [Debug] 강제 업데이트 확인 메뉴 등록
    GM_registerMenuCommand('⚡️ 강제 업데이트 확인', () => {
        GM_setValue(CACHE_TIME_KEY, 0); // 캐시 만료 처리
        GM_setValue(PINNED_VER_KEY, ""); // 핀된 버전 해제 (선택 사항)
        alert("캐시를 초기화했습니다. 최신 버전을 확인합니다.");
        location.reload();
    });

    // 2. 최신 버전 확인 및 Core 로드 (수동 업데이트 로직)
    checkAndLoadCore();

    // -----------------------------------------------------------

    // -----------------------------------------------------------

    async function checkAndLoadCore() {
        const pinnedVer = GM_getValue(PINNED_VER_KEY);
        const latestVer = await fetchLatestVersion();

        // 1. 최초 실행이거나 핀된 버전이 없으면 최신 버전으로 고정
        if (!pinnedVer) {
            console.log(`📌 First run: Pinning to ${latestVer}`);
            GM_setValue(PINNED_VER_KEY, latestVer);
            loadCoreScript(latestVer);
            return;
        }

        // 2. 업데이트 감지 (핀된 버전과 최신 버전이 다르면)
        if (pinnedVer !== latestVer) {
            console.log(`✨ Update Available: ${pinnedVer} -> ${latestVer}`);
            GM_registerMenuCommand(`✨ 업데이트 가능 (${latestVer})`, () => {
                if (confirm(`새 버전(${latestVer})으로 업데이트하시겠습니까?`)) {
                    GM_setValue(PINNED_VER_KEY, latestVer);
                    alert("업데이트가 적용되었습니다. 페이지를 새로고침합니다.");
                    location.reload();
                }
            });
        } else {
            console.log("✅ You are using the latest version.");
        }

        // 3. 항상 핀된(고정된) 버전 로드
        loadCoreScript(pinnedVer);
    }

    function fetchLatestVersion() {
        return new Promise((resolve) => {
            const cachedVer = GM_getValue(CACHE_VER_KEY);
            const cachedTime = GM_getValue(CACHE_TIME_KEY, 0);
            const isDebug = GM_getValue(CFG_DEBUG_KEY, false);
            const now = Date.now();

            // 디버그 모드면 캐시 무시
            if (isDebug) {
                console.log("🐛 Debug Mode: Skipping Update Cache");
            } else if (cachedVer && (now - cachedTime < CACHE_DURATION)) {
                // 캐시 유효하면 바로 반환
                resolve(cachedVer);
                return;
            }

            // GitHub API로 최신 태그 조회
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/tags`,
                onload: (res) => {
                    if (res.status === 200) {
                        try {
                            const tags = JSON.parse(res.responseText);
                            if (tags.length > 0) {
                                const latestVer = tags[0].name;
                                GM_setValue(CACHE_VER_KEY, latestVer);
                                GM_setValue(CACHE_TIME_KEY, now);
                                resolve(latestVer);
                            } else {
                                resolve(cachedVer || "v3.0.0-BETA3"); // Fallback
                            }
                        } catch (e) {
                            console.error("❌ Failed to parse tags:", e);
                            resolve(cachedVer || "v3.0.0-BETA3");
                        }
                    } else {
                        console.error("❌ GitHub API Error:", res.status);
                        resolve(cachedVer || "v3.0.0-BETA3");
                    }
                },
                onerror: () => {
                    resolve(cachedVer || "v3.0.0-BETA3");
                }
            });
        });
    }

    function loadCoreScript(version) {
        // jsDelivr URL 생성 (캐시 방지 파라미터 추가)
        const cdnUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${version}/${CORE_FILENAME}?t=${Date.now()}`;

        console.log(`☁️ Fetching Core Script from: ${cdnUrl}`);

        GM_xmlhttpRequest({
            method: "GET",
            url: cdnUrl,
            onload: function (response) {
                if (response.status === 200) {
                    try {
                        const scriptContent = response.responseText;

                        // 3. Core 스크립트 실행 (GM 컨텍스트 전달)
                        // 3. Core 스크립트 실행 (GM 컨텍스트 전달)
                        // Core 스크립트는 window.TokiSyncCore = function(...) {...} 형태여야 합니다.

                        // 내용 검증
                        if (!scriptContent.includes("window.TokiSyncCore")) {
                            console.error("❌ Invalid Script Content:", scriptContent.substring(0, 100));
                            throw new Error("불러온 스크립트가 구버전(v2.0.0)으로 보입니다. 캐시 문제일 수 있습니다.");
                        }

                        // new Function으로 스크립트를 실행하여 전역 변수에 함수를 등록합니다.
                        // window 객체를 명시적으로 전달하여 스코프 문제를 방지합니다.
                        const runScript = new Function("window", scriptContent);
                        runScript(window);

                        if (typeof window.TokiSyncCore === 'function') {
                            window.TokiSyncCore({
                                GM_registerMenuCommand: GM_registerMenuCommand,
                                GM_xmlhttpRequest: GM_xmlhttpRequest,
                                GM_setValue: GM_setValue,
                                GM_xmlhttpRequest: GM_xmlhttpRequest,
                                GM_setValue: GM_setValue,
                                GM_getValue: GM_getValue,
                                GM_deleteValue: GM_deleteValue,
                                JSZip: JSZip // JSZip 객체 전달
                            });
                        } else {
                            throw new Error("window.TokiSyncCore is not defined. Core script might be outdated.");
                        }

                    } catch (e) {
                        console.error("❌ Core Script Execution Failed:", e);
                        alert("스크립트 실행 중 오류가 발생했습니다.\n" + e.message);
                    }
                } else {
                    console.error("❌ Failed to fetch script. Status:", response.status);
                    alert(`스크립트 로드 실패 (${response.status})\nGitHub에 파일이 있는지 확인해주세요.`);
                }
            },
            onerror: function (e) {
                console.error("❌ Network Error:", e);
                alert("네트워크 오류가 발생했습니다.");
            }
        });
    }

    // Legacy openSettings removed. Core handles settings now.

})();