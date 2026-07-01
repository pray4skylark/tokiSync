import { uploadToGAS } from './gas.js';
import { LogBox, Notifier } from './ui/index.js';

export function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk_size = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk_size) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size));
    }
    return window.btoa(binary);
}

export function extractEpisodeNum(filename) {
    if (!filename) return null;
    const kavitaMatch = filename.match(/[- ]c(h)?(\d+)/i);
    const legacyMatch = filename.match(/(\d+)화/);
    const startNumMatch = filename.match(/^(\d+)/);

    if (kavitaMatch) return kavitaMatch[2];
    if (legacyMatch) return legacyMatch[1];
    if (startNumMatch) return startNumMatch[1];
    return null;
}

export async function blobToArrayBuffer(blob) {
    if (blob.arrayBuffer) {
        return await blob.arrayBuffer();
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
}

export function sleep(ms, randomRange) {
    if (randomRange) {
        ms = Math.floor(Math.random() * randomRange) + ms;
    }
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms);
    });
}

export function getCommonPrefix(str1, str2) {
    if (!str1 || !str2) return '';
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
        i++;
    }
    let prefix = str1.substring(0, i);
    
    // Remove trailing numbers (which belong to the episode number sequence)
    // By doing this BEFORE trim(), we protect series titles that end in numbers
    // followed by a space (e.g. "Mob Psycho 100 1" -> prefix "Mob Psycho 100 1" -> "Mob Psycho 100 ")
    prefix = prefix.replace(/\d+$/, '');
    prefix = prefix.replace(/[\s\-_]+$/, '');
    
    return prefix.trim();
}

export async function waitIframeLoad(iframe, url, viewerCfg = {}) {
    return new Promise((resolve) => {
        const handler = async () => {
            iframe.removeEventListener('load', handler);
            
            // [Fix] 시나리오 1/4: 고정 sleep(500) 대신 실제 콘텐츠 DOM 폴링
            // load 이벤트 후에도 JS lazy-render 페이지는 DOM이 비어있을 수 있음
            // 이미지(.view-padding div img) 또는 소설 텍스트(#novel_content) 중 하나가
            // 나타날 때까지 최대 8초 폴링 (200ms 간격 × 40회)
            await waitForContent(iframe, 8000, viewerCfg);
            
            // Captcha Detection
            let isCaptcha = false;
            let isCloudflare = false;
            
            try {
                const iframeDoc = iframe.contentWindow.document;
                console.log('[Captcha Debug] iframe URL:', iframe.contentWindow.location.href);
                console.log('[Captcha Debug] iframe title:', iframeDoc.title);
                
                // Check for various captcha types
                const hcaptcha = iframeDoc.querySelector('iframe[src*="hcaptcha"]');
                const recaptcha = iframeDoc.querySelector('.g-recaptcha');
                
                // Gnuboard captcha (corrected selectors based on actual HTML)
                const kcaptchaFieldset = iframeDoc.querySelector('fieldset#captcha, fieldset.captcha');
                const kcaptchaImg = iframeDoc.querySelector('img.captcha_img, img[src*="kcaptcha_image.php"]');
                const kcaptchaForm = iframeDoc.querySelector('form[action*="captcha_check.php"]');
                const kcaptcha = kcaptchaFieldset || kcaptchaImg || kcaptchaForm;
                
                console.log('[Captcha Debug] hCaptcha:', !!hcaptcha);
                console.log('[Captcha Debug] reCaptcha:', !!recaptcha);
                console.log('[Captcha Debug] Gnuboard kCaptcha:', !!kcaptcha);
                if (kcaptcha) {
                    console.log('[Captcha Debug] - fieldset:', !!kcaptchaFieldset);
                    console.log('[Captcha Debug] - img:', !!kcaptchaImg);
                    console.log('[Captcha Debug] - form:', !!kcaptchaForm);
                }
                
                isCaptcha = !!(hcaptcha || recaptcha || kcaptcha);
                
                // Cloudflare detection
                const titleCheck = iframeDoc.title.includes('Just a moment');
                const cfElement = iframeDoc.getElementById('cf-challenge-running');
                const cfWrapper = iframeDoc.querySelector('.cf-browser-verification');
                
                console.log('[Captcha Debug] Cloudflare title check:', titleCheck);
                console.log('[Captcha Debug] cf-challenge-running:', !!cfElement);
                console.log('[Captcha Debug] cf-browser-verification:', !!cfWrapper);
                
                isCloudflare = titleCheck || !!cfElement || !!cfWrapper;
                
            } catch (e) {
                console.warn('[Captcha Debug] CORS Error or Access Denied:', e.message);
                // If CORS blocks us, check from outside
                try {
                    const iframeUrl = iframe.contentWindow.location.href;
                    if (iframeUrl.includes('challenge') || iframeUrl.includes('captcha')) {
                        console.warn('[Captcha Debug] URL contains captcha keyword!');
                        isCaptcha = true;
                    }
                } catch (corsError) {
                    console.warn('[Captcha Debug] Cannot access iframe URL due to CORS');
                }
            }
            
            if (isCaptcha || isCloudflare) {
                console.warn('[Captcha] 감지됨! 사용자 조치 필요');
                const logger = LogBox.getInstance();
                logger.error('[Captcha] 캡차가 감지되었습니다. 해결 후 "재개" 버튼을 눌러주세요.');
                await pauseForCaptcha(url);
                logger.log('[Captcha] 해결 확인됨! 원본 주소로 다운로드 프레임 재개 중...', 'System');
                
                // 기존 다운로드용 iframe은 그대로 두고, 
                // 원본 주소(url)를 다시 로드하여 처음부터 캡차 검사 단계를 정상적으로 통과하도록 재귀호출
                await waitIframeLoad(iframe, url, viewerCfg);
                resolve();
            } else {
                console.log('[Captcha Debug] No captcha detected');
                resolve();
            }
        };
        iframe.addEventListener('load', handler);
        iframe.src = url;
    });
}

/**
 * 창(Window) 내부에 실제 콘텐츠가 로드될 때까지 폴링 대기
 * 웹툰: .view-padding div img / 소설: #novel_content
 * @param {Window} targetWindow 대기할 대상 창 (현재 창 또는 iframe.contentWindow)
 * @param {number} maxWaitMs 최대 대기 시간 (ms), 기본 8000
 * @param {object} viewerCfg 동적 파서 뷰어 설정
 * @returns {Document|null} 성공 시 Document 객체 반환, 실패/시간초과 시 null
 */
export async function waitForContent(targetWindow, maxWaitMs = 8000, viewerCfg = {}) {
    const POLL_INTERVAL = 200;
    const maxAttempts = Math.ceil(maxWaitMs / POLL_INTERVAL);
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            if (!targetWindow) return null;
            const targetDoc = targetWindow.document;
            const title = targetDoc.title; // CORS 확인용 강제 접근
            
            let imgSelector = '.view-padding div img';
            if (viewerCfg.imageContainer) {
                const itemSel = viewerCfg.imageItem || 'img';
                imgSelector = viewerCfg.imageContainer.split(',').map(c => `${c.trim()} ${itemSel}`).join(', ');
            }
            const novelSelector = viewerCfg.novelContent || '#novel_content';
            
            // [개선] 룰의 exclude/remove 셀렉터를 활용한 정밀한 유효 이미지 판정
            const allImgs = Array.from(targetDoc.querySelectorAll(imgSelector));
            const excludeRule = viewerCfg.exclude || viewerCfg.remove;
            const excludeSelectors = excludeRule 
                ? (Array.isArray(excludeRule) ? excludeRule : [excludeRule]) 
                : [];

            const validImages = allImgs.filter(img => {
                const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-original') || '';
                if (!src || src.startsWith('data:image')) return false;
                const lower = src.toLowerCase();
                if (lower.includes('blank.gif') || lower.includes('loading.gif') || lower.includes('loading-image.gif')) return false;
                if (excludeSelectors.some(sel => img.matches(sel) || img.closest(sel))) return false;
                return true;
            });

            const hasImages = validImages.length >= 3;
            const novelEl = targetDoc.querySelector(novelSelector);
            const hasNovel = novelEl && novelEl.innerText.trim().length > 50;
            
            if (hasImages || hasNovel) {
                const type = hasImages ? 'Webtoon' : 'Novel';
                LogBox.getInstance().log(`[DOM Poll] ${type} 콘텐츠 감지 (유효 이미지: ${validImages.length}개, ${(i + 1) * POLL_INTERVAL}ms)`, 'DOM:Poll');
                return targetDoc;
            }
        } catch (e) {
            if (e.name === 'SecurityError' || e.message.includes('Blocked a frame')) {
                throw e;
            }
        }
        await sleep(POLL_INTERVAL);
    }
    console.warn(`[DOM Poll] ${maxWaitMs}ms 내 콘텐츠 미감지 — 갈무리 시도`);
    LogBox.getInstance().warn(`DOM 폴링 타임아웃 ${maxWaitMs}ms — 콘텐츠 미감지, 멈춰서 물 평가`, 'DOM:Poll');
}

export async function scrollToLoad(iframeDoc, stallTimeoutMs = 20000, viewerCfg = {}, multiplier = 1.0) {
    const win = iframeDoc.defaultView || iframeDoc.parentWindow;
    if (!win) return;

    const isHidden = document.visibilityState === 'hidden';
    const behavior = isHidden ? 'auto' : 'smooth';
    
    // [개선] 자식 워커 환경인 경우, 부모 창에 postMessage로 로그를 중계하는 가상 로거 프록시를 적용
    let logger = null;
    const isWorker = typeof window !== 'undefined' && window.opener && window.opener !== window;
    
    if (isWorker) {
        logger = {
            log: (msg, context = '') => {
                const prefix = context ? `[${context}] ` : '';
                try {
                    if (window.opener && !window.opener.closed) {
                        window.opener.postMessage({
                            type: 'TOKI_WORKER_LOG',
                            payload: { msg: `${prefix}${msg}`, level: 'info' },
                            timestamp: Date.now()
                        }, '*');
                    }
                } catch (e) {
                    console.log(`[ScrollEngine] ${prefix}${msg}`);
                }
            },
            warn: (msg, context = '') => {
                const prefix = context ? `[${context}] ` : '';
                try {
                    if (window.opener && !window.opener.closed) {
                        window.opener.postMessage({
                            type: 'TOKI_WORKER_LOG',
                            payload: { msg: `${prefix}${msg}`, level: 'warn' },
                            timestamp: Date.now()
                        }, '*');
                    }
                } catch (e) {
                    console.warn(`[ScrollEngine] ${prefix}${msg}`);
                }
            },
            error: (msg, context = '') => {
                const prefix = context ? `[${context}] ` : '';
                try {
                    if (window.opener && !window.opener.closed) {
                        window.opener.postMessage({
                            type: 'TOKI_WORKER_LOG',
                            payload: { msg: `${prefix}${msg}`, level: 'error' },
                            timestamp: Date.now()
                        }, '*');
                    }
                } catch (e) {
                    console.error(`[ScrollEngine] ${prefix}${msg}`);
                }
            }
        };
    } else {
        logger = LogBox.getInstance();
    }

    logger.log('⏳ [ScrollEngine] 동적 가상화(div ➔ img) 둔갑 대기 스크롤 모드를 작동합니다.', 'DOM:Scroll');

    // 1. 부모 이미지 컨테이너 탐지
    let container = null;
    if (viewerCfg.imageContainer) {
        const containers = viewerCfg.imageContainer.split(',');
        for (const sel of containers) {
            const el = iframeDoc.querySelector(sel.trim());
            if (el) {
                container = el;
                break;
            }
        }
    }

    // 폴백용 이미지 셀렉터 정의 (부모 컨테이너가 없거나 감지 실패 시를 대비)
    let fallbackSelectors = '.view-padding div img, .viewer-main img, #v_content img, .img-tag';
    if (viewerCfg.imageContainer) {
        const itemSel = viewerCfg.imageItem || 'img';
        fallbackSelectors = viewerCfg.imageContainer.split(',').map(c => `${c.trim()} ${itemSel}`).join(', ');
    }

    // ── [케이스 1: 부모 컨테이너가 존재하고 내부 자식 노드들이 확인되는 경우 (가상화 뷰어 직격)] ──
    if (container && container.children && container.children.length > 0) {
        const pageElements = Array.from(container.children);
        logger.log(`🎯 [ScrollEngine] 컨테이너 내 직계 자식 노드 ${pageElements.length}개 발견. 둔갑 추적을 기동합니다.`, 'DOM:Scroll');

        for (let idx = 0; idx < pageElements.length; idx++) {
            const displayIdx = idx + 1;
            
            // 해당 순번의 노드를 부드럽게 화면 중앙에 고정 (Intersection Observer 트리거)
            const initialEl = container.children[idx];
            if (initialEl) {
                initialEl.scrollIntoView({ behavior, block: 'center' });
                if (isHidden) win.dispatchEvent(new Event('scroll'));
            }

            // 둔갑 및 이미지 실시간 완착 대기 루프 (최대 4초 * 배율)
            const SINGLE_PAGE_TIMEOUT = Math.round(4000 * multiplier);
            const POLL_INTERVAL = 200;
            let elapsed = 0;

            while (elapsed < SINGLE_PAGE_TIMEOUT) {
                // 매 주기마다 해당 인덱스의 최신 DOM 노드를 재조회 (div에서 img로 치환되는 동적 상황 대응)
                const currentEl = container.children[idx];
                if (!currentEl) break;

                // 해당 자리가 진짜 img 태그로 바뀌었거나, 자식으로 img 요소를 채웠는지 실시간 판별
                let targetImg = null;
                if (currentEl.tagName === 'IMG') {
                    targetImg = currentEl;
                } else {
                    targetImg = currentEl.querySelector('img');
                }

                // [개선] 1초(1000ms * multiplier) 동안 이미지 엘리먼트 자체가 생성되지 않으면 가상화 이미지 노드가 아닌 것으로 판정 (광고/댓글 등 건너뛰기)
                if (!targetImg && elapsed >= Math.round(1000 * multiplier)) {
                    logger.warn(`⚠️ [Scroll] 페이지 [${displayIdx} / ${pageElements.length}] 이미지 태그 미발견 (무관한 노드로 판단하여 대기 건너뜀)`, 'DOM:Scroll');
                    break;
                }

                // 둔갑 성공 확인 시, 해당 진짜 이미지의 바이너리 로드 완료(complete && naturalWidth > 0)까지 대기
                if (targetImg) {
                    const isLoaded = targetImg.complete && targetImg.naturalWidth > 0;
                    if (isLoaded) {
                        break;
                    }
                }

                logger.log(`⏳ [Scroll] 페이지 [${displayIdx} / ${pageElements.length}] 이미지 둔갑 대기 중... (${elapsed}ms)`, 'DOM:Scroll');
                await sleep(POLL_INTERVAL);
                elapsed += POLL_INTERVAL;
            }

            if (elapsed >= SINGLE_PAGE_TIMEOUT) {
                logger.warn(`⚠️ [Scroll] 페이지 [${displayIdx} / ${pageElements.length}] 둔갑 대기 시간 초과! (다음으로 전진)`, 'DOM:Stall');
            } else {
                logger.log(`✅ [Scroll] 페이지 [${displayIdx} / ${pageElements.length}] 이미지 완착 성공!`, 'DOM:Scroll');
            }

            await sleep(Math.round(100 * multiplier)); // 지연 로딩 방어용 완충 딜레이
        }
    } 
    // ── [케이스 2: 부모 컨테이너가 없거나 자식이 없는 경우 (구형/일반 뷰어 안전 폴백)] ──
    else {
        logger.warn('⚠️ [ScrollEngine] 자식 둔갑 추적 대상 없음. 기존 이미지 탐색 폴백 모드를 가동합니다.', 'DOM:Scroll');
        
        const allImages = Array.from(iframeDoc.querySelectorAll(fallbackSelectors));
        const excludeRule = viewerCfg.exclude || viewerCfg.remove;
        const excludeSelectors = excludeRule 
            ? (Array.isArray(excludeRule) ? excludeRule : [excludeRule]) 
            : [];

        const isDummySrc = (src) => {
            if (!src || src.trim() === '') return true;
            if (src.startsWith('data:image')) return true;
            const lower = src.toLowerCase();
            const dummyFilenames = ['blank.gif', 'loading.gif', 'loading-image.gif', 'pixel.gif', 'spacer.gif', 'transparent.gif', '1x1.gif', 'dot.gif'];
            return dummyFilenames.some(p => lower.includes(p));
        };

        const validImages = allImages.filter(img => {
            const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-original') || '';
            if (isDummySrc(src)) return false;
            if (excludeSelectors.some(sel => img.matches(sel) || img.closest(sel))) return false;
            return true;
        });

        if (validImages.length === 0) {
            logger.warn('⚠️ [ScrollEngine] 유효한 폴백 이미지를 찾지 못했습니다. 물리적 하향 스크롤을 감행합니다.', 'DOM:Scroll');
            win.scrollTo({ top: iframeDoc.documentElement.scrollHeight, behavior });
            if (isHidden) win.dispatchEvent(new Event('scroll'));
            await sleep(1500);
            return;
        }

        logger.log(`🎯 [ScrollEngine] 폴백 이미지 ${validImages.length}개 발견. 순차 로드 스캔 개시.`, 'DOM:Scroll');

        for (let idx = 0; idx < validImages.length; idx++) {
            const img = validImages[idx];
            const displayIdx = idx + 1;

            img.scrollIntoView({ behavior, block: 'center' });
            if (isHidden) win.dispatchEvent(new Event('scroll'));

            const SINGLE_IMAGE_TIMEOUT = Math.round(4000 * multiplier);
            const POLL_INTERVAL = 200;
            let elapsed = 0;

            while (elapsed < SINGLE_IMAGE_TIMEOUT) {
                if (img.complete && img.naturalWidth > 0) break;
                logger.log(`⏳ [Scroll] 폴백 이미지 [${displayIdx} / ${validImages.length}] 로딩 대기 중... (${elapsed}ms)`, 'DOM:Scroll');
                await sleep(POLL_INTERVAL);
                elapsed += POLL_INTERVAL;
            }
            await sleep(Math.round(100 * multiplier));
        }
    }

    // 공통 마무리: 최하단으로 최종 스크롤 꽂아넣기
    win.scrollTo({ top: iframeDoc.documentElement.scrollHeight, behavior });
    if (isHidden) win.dispatchEvent(new Event('scroll'));
    logger.log('🎉 [ScrollEngine] 모든 지연 이미지 수집 및 둔갑 대기 프로세스가 대성공으로 완료되었습니다!', 'DOM:Scroll');
    await sleep(500);
}

// Pause execution until user resolves captcha
export function pauseForCaptcha(targetUrl) {
    return new Promise((resumeCallback) => {
        const logger = LogBox.instance;
        
        // 1. 대시보드 팝업 열기 및 캡차 배너 표시
        if (logger) {
            logger.openDashboard();
            logger.log(`[Captcha] ⚠️ 캡차 감지! 현재 탭에서 캡차를 해결한 후 자동으로 재개됩니다.`, 'error');
        }

        // 대시보드 팝업에 캡차 배너 주입
        const showCaptchaBanner = () => {
            if (!logger) return;
            const doc = logger.popupWindow?.document;
            if (!doc) return;
            const existing = doc.getElementById('toki-captcha-banner');
            if (existing) return;
            const banner = doc.createElement('div');
            banner.id = 'toki-captcha-banner';
            banner.style.cssText = `
                position: sticky; top: 0; z-index: 9999;
                background: #c0392b; color: #fff;
                padding: 12px 16px; font-size: 14px; font-weight: bold;
                display: flex; justify-content: space-between; align-items: center;
            `;
            banner.innerHTML = `
                <span>⚠️ 캡차 감지 — 원본 탭에서 캡차를 해결해 주세요</span>
                <button id="toki-captcha-manual-resume" style="background:#fff;color:#c0392b;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-weight:bold;">✅ 수동 재개</button>
            `;
            doc.body.prepend(banner);
            doc.getElementById('toki-captcha-manual-resume').onclick = () => {
                clearInterval(checkInterval);
                banner.remove();
                resumeCallback();
            };
        };

        setTimeout(showCaptchaBanner, 300);

        // 2. 현재 탭 포커스 (사용자 안내)
        window.focus();

        // 3. 백그라운드 폴링 — 대상 페이지 document를 직접 감시
        const checkInterval = setInterval(() => {
            try {
                const captchaFieldset = document.querySelector('fieldset#captcha, fieldset.captcha');
                const captchaImg = document.querySelector('img.captcha_img, img[src*="kcaptcha_image.php"]');
                const captchaForm = document.querySelector('form[action*="captcha_check.php"]');
                const hcaptcha = document.querySelector('iframe[src*="hcaptcha"]');
                const recaptcha = document.querySelector('.g-recaptcha');
                const cloudflare = document.querySelector('.cf-browser-verification');
                const hasCaptcha = !!(captchaFieldset || captchaImg || captchaForm || hcaptcha || recaptcha || cloudflare);

                if (!hasCaptcha) {
                    clearInterval(checkInterval);
                    if (logger) {
                        const doc = logger.popupWindow?.document;
                        doc?.getElementById('toki-captcha-banner')?.remove();
                        logger.log('[Captcha] ✅ 해결 감지! 수집을 재개합니다.', 'success');
                    }
                    resumeCallback();
                }
            } catch(e) {
                // 페이지 전환 등 — 해결된 것으로 간주
                clearInterval(checkInterval);
                if (logger) {
                    const doc = logger.popupWindow?.document;
                    doc?.getElementById('toki-captcha-banner')?.remove();
                }
                resumeCallback();
            }
        }, 1000);
    });
}


// data: JSZip object OR Blob OR Promise<Blob>
export async function saveFile(data, filename, type = 'local', extension = 'zip', metadata = {}) {
    const fullFileName = `${filename}.${extension}`;
    
    let content;
    if (data.generateAsync) {
        // [v1.7.3] Native 다운로드 시 확장자 변조 방지를 위해 MIME 타입 명시
        const mimeMap = {
            cbz: 'application/octet-stream', // content-sniffing 방지를 위해 범용 바이너리 타입 사용
            epub: 'application/epub+zip',
            zip: 'application/zip'
        };
        content = await data.generateAsync({ 
            type: "blob",
            mimeType: mimeMap[extension] || 'application/zip'
        });
    } else {
        content = await data; // Unbox promise or use blob directly
    }

    if (type === 'local') {
        console.log(`[Local] 다운로드 중... (${fullFileName})`);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = fullFileName;
        link.click();
        const url = link.href;
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        link.remove();
        console.log(`[Local] 완료`);
    } else if (type === 'native') {
        // [v1.6.0] GM_download with subfolder support
        const folderName = metadata.folderName || "TokiSync";
        // Final Path: "TokiSync/SeriesTitle/Filename.zip"
        const finalPath = `TokiSync/${folderName}/${fullFileName}`.replace(/[<>:"|?*]/g, '_'); // Sanitization for safety

        console.log(`[Native] 자동 분류 다운로드 시도... (${finalPath})`);
        const logger = LogBox.getInstance();

        return new Promise((resolve, reject) => {
            if (typeof GM_download !== 'function') {
                const err = "GM_download 권한이 없거나 지원되지 않는 환경입니다.";
                logger.error(`[Native] 실패: ${err}`);
                reject(new Error(err));
                return;
            }

            GM_download({
                url: URL.createObjectURL(content),
                name: finalPath,
                saveAs: false, // Use browser setting or automatic
                onload: () => {
                   logger.success(`[Native] 자동 저장 완료: ${fullFileName}`);
                   resolve(true);
                },
                onerror: (err) => {
                    const errMsg = err ? (err.error || err.reason || "알 수 없는 오류") : "알 수 없는 오류";
                    if (err && err.error === 'not_whitelisted') {
                        logger.critical(`[Native 방어] 다운로드 차단됨: 지원하지 않는 확장자입니다.\n👉 템퍼몽키 [설정] -> [고급] -> [Whitelisted File Extensions]에 '${extension}' 확장자(cbz/epub)를 추가해주세요.`);
                    } else {
                        logger.error(`[Native] 다운로드 실패: ${errMsg}`);
                    }
                    console.error("[Native Error]", err);
                    reject(new Error(errMsg));
                }
            });
        });
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
            throw e;
        }
    }
}

/**
 * Blob으로부터 이미지의 가로/세로 크기를 추출 (비동기)
 * @param {Blob} blob 
 * @returns {Promise<{width: number, height: number}>}
 */
export async function getImageDimensions(blob) {
    try {
        const bitmap = await createImageBitmap(blob);
        const dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close(); // 메모리 해제
        return dimensions;
    } catch (e) {
        console.warn('[Utils] Image dimensions extraction failed:', e);
        return { width: 0, height: 0 };
    }
}

/**
 * [v1.8.4] GM_xmlhttpRequest 기반의 안전한 Blob Fetcher
 * 브라우저 fetch()로 인해 발생하는 CORS 및 Referer 차단을 우회합니다.
 * @param {string} url 
 * @param {string} [referer]
 * @returns {Promise<Blob>}
 */
export async function fetchBlobWithXHR(url, referer) {
    // 35초 절대 강제 타임아웃 프로미스 정의 (CORS/샌드박스 먹통 상황 방어용 극약 처방)
    let timeoutTimer = null;
    const forceTimeoutPromise = new Promise((_, reject) => {
        timeoutTimer = setTimeout(() => {
            reject(new Error(`절대 타임아웃 한계(35초) 초과로 다운로드를 강제 건너뛰었습니다.`));
        }, 35000);
    });

    const downloadPromise = (async () => {
        // 1. GM_xmlhttpRequest API 유효성 검사 및 표준 fetch 1차 폴백 우회
        if (typeof GM_xmlhttpRequest === 'undefined') {
            console.warn('[TokiSync Utils] GM_xmlhttpRequest가 팝업 환경에서 유효하지 않습니다. 표준 fetch API로 즉시 대체합니다:', url);
            try {
                const resp = await fetch(url, {
                    mode: 'cors',
                    credentials: 'include'
                });
                if (!resp.ok) throw new Error(`HTTP status ${resp.status}`);
                return await resp.blob();
            } catch (fetchErr) {
                throw new Error(`Standard Fetch 실패 (CORS 또는 네트워크 장애): ${fetchErr.message} -> ${url}`);
            }
        }

        return new Promise((resolve, reject) => {
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: {
                        "Referer": referer || window.location.href,
                        "User-Agent": navigator.userAgent
                    },
                    responseType: 'blob',
                    timeout: 25000, // 25초 네트워크 타임아웃으로 조정
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            resolve(res.response);
                        } else {
                            reject(new Error(`HTTP ${res.status}: ${url}`));
                        }
                    },
                    onerror: (err) => {
                        console.warn('[TokiSync Utils] GM_xmlhttpRequest 오류 감지. fetch 폴백을 발동합니다:', url);
                        fetch(url, { mode: 'cors', credentials: 'include' })
                            .then(r => {
                                if (!r.ok) throw new Error(`HTTP status ${r.status}`);
                                return r.blob();
                            })
                            .then(resolve)
                            .catch(e => reject(new Error(`GM_xmlhttpRequest 에러 및 fetch 폴백 실패: ${e.message}`)));
                    },
                    ontimeout: () => {
                        console.warn('[TokiSync Utils] GM_xmlhttpRequest 25초 타임아웃. fetch 폴백 시도:', url);
                        fetch(url, { mode: 'cors', credentials: 'include' })
                            .then(r => {
                                if (!r.ok) throw new Error(`HTTP status ${r.status}`);
                                return r.blob();
                            })
                            .then(resolve)
                            .catch(reject);
                    }
                });
            } catch (e) {
                console.error('[TokiSync Utils] GM_xmlhttpRequest 호출 중 예외 발생, 일반 fetch로 긴급 우회:', e);
                fetch(url, { mode: 'cors', credentials: 'include' })
                    .then(r => {
                        if (!r.ok) throw new Error(`HTTP status ${r.status}`);
                        return r.blob();
                    })
                    .then(resolve)
                    .catch(reject);
            }
        });
    })();

    try {
        const result = await Promise.race([downloadPromise, forceTimeoutPromise]);
        return result;
    } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer);
    }
}
