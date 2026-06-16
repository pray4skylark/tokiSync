import { main } from './main.js';
import { initWorkerExtractor } from './worker-extractor.js';

(async function () {
    'use strict';

    // 🛡️ Iframe 내부 실행 방지 가드 (중복 실행 및 중복 로그 출력 차단)
    if (window.self !== window.top) {
        return;
    }

    // ── 🔒 [초고도 스텔스 섀도 DOM 개방 및 클로킹 엔진] ────────────────
    try {
        const originalAttachShadow = Element.prototype.attachShadow;
        const originalToString = Function.prototype.toString;
        const originalCreateElement = Document.prototype.createElement;

        if (originalAttachShadow) {
            // A. 초스텔스 개방 가로채기 함수 정의
            const customAttachShadow = function attachShadow(init) {
                if (init && init.mode === 'closed') {
                    init.mode = 'open';
                    console.log('[TokiSync] 🔒 닫힌 Shadow DOM -> Open 모드로 은밀 개방 완료');
                }
                return originalAttachShadow.apply(this, arguments);
            };

            // B. 네이티브 프로토타입 체인 완벽 일치 (hasOwnProperty('toString') 방어)
            Object.setPrototypeOf(customAttachShadow, Function.prototype);
            
            // C. 글로벌 toString() 킹핀 클로킹 (자기 자신 및 가로채기 함수 위장)
            const patchedToString = function toString() {
                if (this === customAttachShadow) {
                    return 'function attachShadow() { [native code] }';
                }
                if (this === patchedToString) {
                    return 'function toString() { [native code] }';
                }
                return originalToString.apply(this, arguments);
            };
            
            Object.setPrototypeOf(patchedToString, Function.prototype);
            Function.prototype.toString = patchedToString;

            // D. 네이티브 디스크립터 완벽 동기화
            Object.defineProperty(Element.prototype, 'attachShadow', {
                value: customAttachShadow,
                writable: true,
                enumerable: true,
                configurable: true
            });

            // E. Iframe 우회 차단 감지 격파 (동적 생성 iframe 프로토타입 오염)
            Document.prototype.createElement = function (tagName) {
                const element = originalCreateElement.apply(this, arguments);
                if (tagName && tagName.toLowerCase() === 'iframe') {
                    // iframe이 생성되어 DOM에 부착되는 시점을 추적하여 동기화 주입
                    const observer = new MutationObserver(() => {
                        try {
                            if (element.contentWindow && element.contentWindow.Element) {
                                const iframeAttach = element.contentWindow.Element.prototype.attachShadow;
                                if (iframeAttach && iframeAttach !== customAttachShadow) {
                                    Object.defineProperty(element.contentWindow.Element.prototype, 'attachShadow', {
                                        value: customAttachShadow,
                                        writable: true,
                                        enumerable: true,
                                        configurable: true
                                    });
                                }
                            }
                        } catch (err) {}
                        observer.disconnect();
                    });
                    observer.observe(document.documentElement, { childList: true, subtree: true });
                }
                return element;
            };
            
            Object.setPrototypeOf(Document.prototype.createElement, Function.prototype);
        }
    } catch (e) {
        console.warn('[TokiSync] 초스텔스 섀도 DOM 엔진 로드 실패:', e.message);
    }
    // ───────────────────────────────────────────────────────────────

    // 1. 모든 console.log 덮어쓰기 제거
    // 2. window.tokiQueue, downloadTokiLogs 등 모든 전역 노출 차단
    // 3. window.fetch, sendBeacon, XHR Proxy 가로채기 전면 비활성화 (스텔스 유지)
    // 4. window.name 및 sessionStorage 워커 각인 흔적 배제

    // window.opener가 존재할 경우 워커로 판별하여 Extractor 기동 (스텔스 모드)
    if (window.opener) {
        const startWorker = () => {
            try {
                initWorkerExtractor();
            } catch (e) {
                console.error('[TokiSync:Worker] Worker 초기화 실패:', e);
            }
        };
        if (document.readyState === 'complete') {
            startWorker();
        } else {
            window.addEventListener('load', startWorker);
        }
        return; // 부모 창의 메인 수집 로직 실행 차단 (Early Exit)
    }

    console.log('[TokiSync] 🛡️ 스텔스(Stealth) 순수 무취 실행 모드가 활성화되었습니다.');

    const startMain = async () => {
        setTimeout(async () => {
            try {
                // 핵심 수집 기능만 순수하게 기동
                await main();
            } catch (e) {
                console.error('[TokiSync] Main execution error:', e);
            }
        }, 500); // SPA 사이트 Hydration 대비 버퍼 500ms
    };

    if (document.readyState === 'complete') {
        startMain();
    } else {
        window.addEventListener('load', startMain);
    }
})();