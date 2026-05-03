import { uploadToGAS } from './gas.js';
import { LogBox, Notifier } from './ui.js';

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
    let prefix = str1.substring(0, i).trim();
    
    // Remove trailing partial numbers (e.g. "인싸 공명 1" → "인싸 공명")
    // Stop at last word boundary before a number
    prefix = prefix.replace(/\s+\d+$/, '');
    
    return prefix;
}

export async function waitIframeLoad(iframe, url) {
    return new Promise((resolve) => {
        const handler = async () => {
            iframe.removeEventListener('load', handler);
            
            // [Fix] 시나리오 1/4: 고정 sleep(500) 대신 실제 콘텐츠 DOM 폴링
            // load 이벤트 후에도 JS lazy-render 페이지는 DOM이 비어있을 수 있음
            // 이미지(.view-padding div img) 또는 소설 텍스트(#novel_content / 새 ntk 본문 컨테이너) 중 하나가
            // 나타날 때까지 최대 8초 폴링 (200ms 간격 × 40회)
            await waitForContent(iframe, 8000);
            
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
                await waitIframeLoad(iframe, url);
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
 * iframe 내부에 실제 콘텐츠가 로드될 때까지 폴링 대기
 * 웹툰: .view-padding div img / 소설: #novel_content 또는 새 ntk 본문 컨테이너
 * @param {HTMLIFrameElement} iframe
 * @param {number} maxWaitMs 최대 대기 시간 (ms), 기본 8000
 */
async function waitForContent(iframe, maxWaitMs = 8000) {
    const POLL_INTERVAL = 200;
    const maxAttempts = Math.ceil(maxWaitMs / POLL_INTERVAL);
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const iframeDoc = iframe.contentWindow.document;
            const hasImages = iframeDoc.querySelector('.view-padding div img') !== null;
            const hasNovel  = iframeDoc.querySelector([
                '#novel_content',
                '.novel-content',
                '.novel_view',
                '.novel-view',
                '.episode-content',
                '.episode_view',
                '.viewer-content',
                '.reading-content',
                'article',
                'main'
            ].join(',')) !== null;
            
            if (hasImages || hasNovel) {
                const type = hasImages ? 'Webtoon' : 'Novel';
                LogBox.getInstance().log(`[DOM Poll] ${type} 콘텐츠 감지 (${(i + 1) * POLL_INTERVAL}ms)`, 'DOM:Poll');
                return; // 콘텐츠 발견 → 즉시 반환
            }
        } catch (e) {
            // CORS 등 접근 불가 시 → 대기 지속
        }
        await sleep(POLL_INTERVAL);
    }
    // 타임아웃 — 콘텐츠 없이 진행 (후속 로직에서 빈 결과 처리)
    console.warn(`[DOM Poll] ${maxWaitMs}ms 내 콘텐츠 미감지 — 갈무리 시도`);
    LogBox.getInstance().warn(`DOM 폴링 타임아웃 ${maxWaitMs}ms — 콘텐츠 미감지, 멈춰서 물 평가`, 'DOM:Poll');
}

/**
 * iframe 내부를 끝까지 스크롤하여 레이지 로딩 이미지가 실제 URL을 불러오도록 강제하는 함수
 * [v1.7.4] 시간 기반 → 진행도 기반으로 개편
 *   Phase 1: 페이지 최하단까지 스크롤 (횟수 제한 없음, 위치 기반 종료)
 *   Phase 2: 모든 lazy 이미지가 실제 URL로 전환될 때까지 폴링
 *            - 개수가 줄어드는 한 계속 대기 (진행 중)
 *            - stallTimeoutMs 동안 변화 없으면 포기 (스톨)
 * @param {HTMLDocument} iframeDoc
 * @param {number} stallTimeoutMs 진행 없을 때 포기하는 시간 (ms), 기본 20000
 */
export async function scrollToLoad(iframeDoc, stallTimeoutMs = 20000) {
    const POLL_INTERVAL = 300;

    const win = iframeDoc.defaultView || iframeDoc.parentWindow;
    if (!win) return;

    const isHidden = document.visibilityState === 'hidden';
    const behavior = isHidden ? 'auto' : 'smooth';
    const scrollInterval = isHidden ? 200 : 100;

    const logger = LogBox.getInstance();

    // ── Phase 1: 요소 추적 하이브리드 점프 (EBHJ) ────────────────
    logger.log(`[ScrollToLoad] Phase 1: 고속 점프 시작 (${behavior} 모드)`, 'DOM:Scroll');

    // 범용적인 이미지 컨테이너 탐지 (마나토끼 등 다양한 사이트 구조 대응)
    const targetSelectors = '.view-padding div img, .viewer-main img, #v_content img, .img-tag';
    const allImages = Array.from(iframeDoc.querySelectorAll(targetSelectors));
    
    if (allImages.length > 0) {
        // 4개 단위로 샘플링하여 징검다리 점프 수행 (IntersectionObserver rootMargin 활용)
        const SAMPLE_STEP = 4;
        const jumpTargets = allImages.filter((_, idx) => idx % SAMPLE_STEP === 0);
        
        // 마지막 이미지는 무조건 포함
        if (allImages.length % SAMPLE_STEP !== 1) {
            jumpTargets.push(allImages[allImages.length - 1]);
        }

        for (let i = 0; i < jumpTargets.length; i++) {
            const target = jumpTargets[i];
            target.scrollIntoView({ behavior, block: 'center' });
            
            // 전역 스크롤 이벤트 발화 (일부 사이트용)
            if (isHidden) win.dispatchEvent(new Event('scroll'));
            
            logger.log(`[EBHJ] 점프 중... (${i + 1}/${jumpTargets.length})`, 'DOM:Jump');
            await sleep(scrollInterval);
        }
    } else {
        logger.warn('[EBHJ] 화면 내 이미지 요소를 찾을 수 없어 물리 스크롤 모드로 전환합니다.', 'DOM:Scroll');
    }

    // Hybrid Fallback: 마지막에 문서를 바닥으로 내려꽂아 무한 스크롤 및 지연 로직 강제 기상
    win.scrollTo({ top: iframeDoc.documentElement.scrollHeight, behavior });
    if (isHidden) win.dispatchEvent(new Event('scroll'));
    await sleep(scrollInterval * 2);

    logger.log('[ScrollToLoad] Phase 1 완료 (요소 점프 및 바닥 도달). Phase 2: 이미지 활성화 대기...', 'DOM:Scroll');

    // ── Phase 2: lazy 이미지가 모두 실제 URL로 바뀔 때까지 폴링 ────
    const isDummySrc = (src) => {
        if (!src || src.trim() === '') return true;
        if (src.startsWith('data:image')) return true;
        const lower = src.toLowerCase();
        
        // 알려진 더미 파일명 패턴
        const dummyFilenames = [
            'blank.gif', 'loading.gif', 'loading-image.gif',
            'pixel.gif', 'spacer.gif', 'transparent.gif',
            '1x1.gif', 'dot.gif',
        ];
        if (dummyFilenames.some(p => lower.includes(p))) return true;

        // 경로 기반 패턴
        if (/\/img\/loading/.test(lower)) return true;
        if (/\/img\/placeholder/.test(lower)) return true;

        return false;
    };

    let lastCount = -1;
    let stallElapsed = 0;

    while (true) {
        const images = Array.from(iframeDoc.querySelectorAll('.view-padding div img'));
        const remaining = images.filter(img => {
            const src = img.src || '';
            // 1. 알려진 플레이스홀더 URL → 대기
            if (isDummySrc(src)) return true;
            // 2. 이미지가 아직 로딩 중 → 대기
            if (!img.complete) return true;
            // 3. complete=true → 성공이든 실패든 확정 상태, 더 기다려도 바뀌지 않음
            //    (naturalWidth=0 + complete=true = HTML 페이지 URL이거나 CORS/404 실패)
            return false;
        });

        if (remaining.length === 0) {
            logger.log('[ScrollToLoad] Phase 2 완료: 모든 이미지 URL 활성화!', 'DOM:Scroll');
            break;
        }

        if (remaining.length < lastCount || lastCount === -1) {
            // 진행 중 → 스톨 타이머 리셋
            stallElapsed = 0;
            logger.log(`[ScrollToLoad] 진행 중... 잔여 lazy: ${remaining.length}개`, 'DOM:Scroll');
        } else {
            // 변화 없음 → 스톨 누적
            stallElapsed += POLL_INTERVAL;

            // 5초마다 스톨 대상 이미지 상세 정보 출력
            if (stallElapsed % 5000 < POLL_INTERVAL) {
                logger.warn(`[ScrollToLoad] 스톨 중 (${stallElapsed / 1000}s 경과) — 미해결 이미지 목록:`, 'DOM:Scroll');
                remaining.forEach((img, i) => {
                    const src = img.src || '(empty)';
                    const shortSrc = src.length > 80 ? '...' + src.slice(-77) : src;
                    const reason = isDummySrc(img.src || '')
                        ? ((!img.src || img.src.trim() === '') ? 'src 없음' : img.src.startsWith('data:image') ? 'data:image' : '더미 URL 패턴')
                        : `naturalWidth=${img.naturalWidth} (complete=${img.complete})`;
                    logger.warn(`  [${i + 1}] ${reason} | ${shortSrc}`, 'DOM:Stall');
                });
            }

            if (stallElapsed >= stallTimeoutMs) {
                logger.warn(`[ScrollToLoad] 스톨 감지: ${remaining.length}개 미활성화 상태로 ${stallTimeoutMs / 1000}초 경과. 갈무리 진행.`, 'DOM:Scroll');
                // 최종 스톨 목록 출력
                remaining.forEach((img, i) => {
                    const src = img.src || '(empty)';
                    const shortSrc = src.length > 80 ? '...' + src.slice(-77) : src;
                    logger.warn(`  [최종 스톨 ${i + 1}] src="${shortSrc}" | naturalWidth=${img.naturalWidth} | complete=${img.complete}`, 'DOM:Stall');
                });
                break;
            }
        }

        lastCount = remaining.length;
        await sleep(POLL_INTERVAL);
    }
}

// Pause execution until user resolves captcha
function pauseForCaptcha(targetUrl) {
    return new Promise((resumeCallback) => {
        // Create full-screen overlay
        const overlay = document.createElement('div');
        overlay.id = 'toki-captcha-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.9); z-index: 999999;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            color: white; font-family: Arial, sans-serif;
        `;
        
        overlay.innerHTML = `
            <h1 style="font-size: 32px; margin-bottom: 20px;">⚠️ 캡차 감지</h1>
            <p style="font-size: 18px; margin-bottom: 30px;">아래 프레임에서 캡차를 해결해주세요. (전용 프레임 모드)</p>
            <div style="width: 80%; height: 60%; background: white; border-radius: 10px; overflow: hidden; margin-bottom: 20px;" id="toki-captcha-frame-container"></div>
            <button id="toki-resume-btn" style="padding: 15px 40px; font-size: 18px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer;">
                해결 후 재개하기
            </button>
        `;
        
        document.body.appendChild(overlay);
        
        // 캡차 조작 전용 신규 프레임 띄우기 (다운로드용 프레임의 간섭 방지)
        const captchaIframe = document.createElement('iframe');
        captchaIframe.src = targetUrl;
        captchaIframe.style.width = '100%';
        captchaIframe.style.height = '100%';
        captchaIframe.style.border = 'none';
        
        const container = document.getElementById('toki-captcha-frame-container');
        if (container) {
            container.appendChild(captchaIframe);
        }

        captchaIframe.onload = () => {
            try {
                const iframeDoc = captchaIframe.contentWindow.document;
                const captchaField = iframeDoc.querySelector('fieldset#captcha, fieldset.captcha, .captcha_box');
                if (captchaField) {
                    captchaField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                const captchaInput = iframeDoc.querySelector('#captcha_key, input.captcha_box');
                if (captchaInput) {
                    setTimeout(() => captchaInput.focus(), 300);
                }
            } catch (e) {
                console.warn('[Captcha] Auto-scroll/focus failed (May be CORS):', e.message);
            }
        };
        
        // Periodic check for captcha resolution (auto-resume)
        const checkInterval = setInterval(() => {
            try {
                const iframeDoc = captchaIframe.contentWindow.document;
                
                // Check if captcha fields still exist
                const captchaFieldset = iframeDoc.querySelector('fieldset#captcha, fieldset.captcha');
                const captchaImg = iframeDoc.querySelector('img.captcha_img, img[src*="kcaptcha_image.php"]');
                const captchaForm = iframeDoc.querySelector('form[action*="captcha_check.php"]');
                
                const hcaptcha = iframeDoc.querySelector('iframe[src*="hcaptcha"]');
                const recaptcha = iframeDoc.querySelector('.g-recaptcha');
                const cloudflare = iframeDoc.querySelector('.cf-browser-verification');
                
                const hasCaptcha = !!(captchaFieldset || captchaImg || captchaForm || hcaptcha || recaptcha || cloudflare);
                
                if (!hasCaptcha) {
                    console.log('[Captcha] 자동 감지: 캡차 해결됨!');
                    clearInterval(checkInterval);
                    overlay.remove();
                    resumeCallback();
                }
            } catch (e) {
                // CORS error or iframe changed - likely resolved
                console.log('[Captcha] 자동 감지: 상위 프레임 권한 막힘 또는 리다이렉트 발생 (해결됨으로 추정)');
                clearInterval(checkInterval);
                overlay.remove();
                resumeCallback();
            }
        }, 1000); // Check every 1 second
        
        // Resume button (manual override)
        document.getElementById('toki-resume-btn').onclick = () => {
            clearInterval(checkInterval);
            overlay.remove();
            resumeCallback();
        };
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
        URL.revokeObjectURL(link.href);
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
            // Optional: Notify on error only if it's critical, but for individual files, log is better.
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
