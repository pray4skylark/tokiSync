// ==UserScript==
// @name         TokiSync (Loader)
// @namespace    https://github.com/pray4skylark/tokiSync
// @version      2.0.2 (Remote Loader Safe)
// @description  TokiSync Core Script Loader (GitHub CDN)
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

(function () {
    'use strict';

    console.log("🚀 TokiSync Loader Initialized (GitHub CDN)");

    const CFG_URL_KEY = "TOKI_GAS_URL";
    const CFG_SECRET_KEY = "TOKI_SECRET_KEY";

    // ⭐️ 핵심: GitHub 사용자명, 레포지토리명, 버전 설정
    const GITHUB_USER = "pray4skylark";
    const GITHUB_REPO = "tokiSync";
    const CORE_VERSION = "2.0.2"; // 로드할 코어 버전 (Tag)
    const CORE_FILENAME = "tokiSyncCore.js";

    const apiUrl = GM_getValue(CFG_URL_KEY, "");
    const secretKey = GM_getValue(CFG_SECRET_KEY, "");

    // 1. 설정이 없으면 설정 메뉴만 등록
    if (!apiUrl || !secretKey) {
        console.warn("⚠️ TokiSync 설정이 필요합니다.");
        GM_registerMenuCommand('⚙️ 설정 (URL/Key)', openSettings);
        alert("TokiSync 설정을 완료해주세요. (Tampermonkey 메뉴)");
        return;
    }

    // 2. GitHub CDN에서 Core 스크립트 로드
    loadCoreScript();

    // -----------------------------------------------------------

    function loadCoreScript() {
        // jsDelivr URL 생성
        const cdnUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${CORE_VERSION}/${CORE_FILENAME}`;

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
                        // new Function으로 스크립트를 실행하여 전역 변수에 함수를 등록합니다.
                        const runScript = new Function(scriptContent);
                        runScript();

                        if (typeof window.TokiSyncCore === 'function') {
                            window.TokiSyncCore({
                                GM_registerMenuCommand: GM_registerMenuCommand,
                                GM_xmlhttpRequest: GM_xmlhttpRequest,
                                GM_setValue: GM_setValue,
                                GM_getValue: GM_getValue
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

    function openSettings() {
        const currentUrl = GM_getValue(CFG_URL_KEY, "");
        const currentKey = GM_getValue(CFG_SECRET_KEY, "");

        const apiUrlInput = prompt("1. [API 서버] URL (TokiSync-Server):", currentUrl);
        if (apiUrlInput === null) return;
        let finalApiUrl = apiUrlInput.trim();
        if (!finalApiUrl.startsWith("http") && finalApiUrl.length > 10) finalApiUrl = `https://script.google.com/macros/s/${finalApiUrl}/exec`;

        const newKey = prompt("2. 보안 키 (Secret Key):", currentKey);
        if (newKey === null) return;

        GM_setValue(CFG_URL_KEY, finalApiUrl);
        GM_setValue(CFG_SECRET_KEY, newKey.trim());

        alert("✅ 설정 저장 완료! 새로고침 해주세요.");
        location.reload();
    }

})();