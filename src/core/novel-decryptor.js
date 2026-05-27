/**
 * [하이브리드 멀티 엔진] 소설 렌더링 기반 동적 수집 모듈 (Popup Controller & API Decryptor)
 * - 플랜 B (기본): 팝업 통신 및 Shadow DOM Piercing 수집 (액티브)
 * - 플랜 C (폴백): JWT 토큰 디코딩 + 동적 Nonce 추출 API 직접 복호화 (페이퍼 플랜 대기)
 */

import { activeWorkers, WORKER_STAGE } from './queue.js';

let activePopupRef = null;

// =============================================================
// 🛠️ 공통 유틸리티 & Base64 / 암호학 헬퍼 함수
// =============================================================

function b64urlDecode(str) {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - str.length % 4);
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function b64urlEncode(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return b64urlEncode(new Uint8Array(sig));
}

function xorDecrypt(payloadB64, token) {
    const payload = b64urlDecode(payloadB64);
    const xorKey = token.split('.')[0];
    const key = new TextEncoder().encode(xorKey);
    const result = new Uint8Array(payload.length);
    for (let i = 0; i < payload.length; i++) {
        result[i] = payload[i] ^ key[i % key.length];
    }
    return new TextDecoder('utf-8').decode(result);
}

function getCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}

async function resetNvCookie(cookieName) {
    console.log(`[Decryptor] ${cookieName} 쿠키 리셋 중...`);
    document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    await fetch('/api/nv-issue', { method: 'POST', credentials: 'same-origin' });
    console.log(`[Decryptor] ${cookieName} 쿠키 재발급 완료`);
}

function getIdsFromUrl(url) {
    const match = url.match(/\/novel\/(\d+)\/(\d+)/);
    if (!match) return null;
    return { novelId: match[1], episodeId: match[2] };
}

function getValidNonce(token) {
    try {
        const base64UrlPayload = token.split('.')[0];
        const base64Payload = base64UrlPayload.replace(/-/g, '+').replace(/_/g, '/');
        const binStr = atob(base64Payload);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
            bytes[i] = binStr.charCodeAt(i);
        }
        const decodedString = new TextDecoder('utf-8').decode(bytes);
        const tokenData = JSON.parse(decodedString);

        if (tokenData && tokenData.nonce) {
            console.log("[Decryptor] 신형 토큰 감지 - 내장된 Nonce 추출 완료:", tokenData.nonce);
            return tokenData.nonce;
        }
    } catch (e) {
        console.warn("[Decryptor] 토큰 디코딩 중 오류 발생, 기존 폴백 적용:", e);
    }
    console.log("[Decryptor] 구형 토큰 감지 - 랜덤 Nonce를 생성합니다.");
    return b64urlEncode(crypto.getRandomValues(new Uint8Array(24)));
}

// 이스케이프 대응 토큰 정규식
const RE_TOKEN = /\\?"token\\?":\\?"(eyJ[A-Za-z0-9_-]+[A-Za-z0-9_=.-]*)\\?"/;

// =============================================================
// 팝업 수집 창 리소스 관리 헬퍼
// =============================================================

export function closeActivePopup() {
    if (activePopupRef && !activePopupRef.closed) {
        console.log('[Controller] 액티브 팝업 세션 수동 폐쇄');
        activePopupRef.close();
    }
    activePopupRef = null;

    // activeWorkers 맵 내 모든 활성 팝업 강제 폐쇄
    for (const [id, popupRef] of activeWorkers.entries()) {
        if (popupRef && !popupRef.closed) {
            console.log(`[Controller] 멀티큐 액티브 팝업(${id}) 강제 폐쇄`);
            popupRef.close();
        }
    }
    activeWorkers.clear();
}

// =============================================================
// 🏛️ 플랜 B Engine: 팝업 렌더링 IPC 수집 엔진 (액티브)
// =============================================================

async function fetchMediaViaPopupSingleAttempt(episodeUrl, targetType = 'novel', config = {}) {
    const timeoutDuration = config.timeout || 45000;

    return new Promise((resolve) => {
        let timeoutId = null;
        let pushInterval = null;

        const cleanup = () => {
            window.removeEventListener('message', messageHandler);
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            if (pushInterval) {
                clearInterval(pushInterval);
                pushInterval = null;
            }
        };

        const startPushHeartbeat = () => {
            if (pushInterval) clearInterval(pushInterval);

            const sendInstruction = () => {
                if (activePopupRef && !activePopupRef.closed) {
                    let popupUrl = 'unknown';
                    try { popupUrl = activePopupRef.location.href; } catch(e) { popupUrl = 'CORS/Blocked'; }
                    activePopupRef.postMessage({
                        type: 'TOKI_START_EXTRACTION',
                        targetType: targetType,
                        viewerCfg: config.viewerCfg || {}
                    }, '*');
                }
            };

            // Immediate execution, then interval every 1.5 seconds
            sendInstruction();
            pushInterval = setInterval(sendInstruction, 1500);
        };

        const messageHandler = async (event) => {
            if (!event.data) return;

            // 1. Handshake Backup (if window.opener is still alive, fallback gracefully)
            if (event.data.type === 'TOKI_WORKER_READY') {
                if (activePopupRef && !activePopupRef.closed) {
                    console.log(`[Controller] 📢 자식 팝업 READY 수신. 동작 지시문 즉시 주입 -> 유형: ${targetType}`);
                    activePopupRef.postMessage({
                        type: 'TOKI_START_EXTRACTION',
                        targetType: targetType,
                        viewerCfg: config.viewerCfg || {}
                    }, '*');
                }
                return;
            }

            // 2. 캡차/클라우드플레어 대기 상태 수신
            if (event.data.type === 'TOKI_CAPTCHA_DETECTED') {
                console.warn(`[Controller] ⚠️ 팝업에서 클라우드플레어/캡차 통과 화면이 감지되었습니다. 타임아웃을 5분으로 연장합니다.`);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => {
                        cleanup();
                        console.error(`[Controller] 캡차/클라우드플레어 통과 시간 초과 (5분) - 유형: ${targetType}`);
                        closeActivePopup();
                        resolve(null);
                    }, 300000); // 5분 연장
                }
                return;
            }

            // 3. Data collection complete
            if (event.data.type === 'TOKI_MEDIA_DATA') {
                const { contentType, content, images, novelId, episodeId } = event.data.data;
                
                // [보안/무결성] 이전 팝업 페이지(잔류 워커)가 보낸 고스트 데이터 필터링
                const expectedIds = getIdsFromUrl(episodeUrl);
                if (expectedIds && episodeId && episodeId !== '0') {
                    if (expectedIds.episodeId !== episodeId) {
                        console.warn(`[Controller] ⚠️ 이전 페이지의 지연된 고스트 데이터를 차단했습니다. (요청: ${expectedIds.episodeId} != 수신: ${episodeId})`);
                        return;
                    }
                }
                
                if (contentType === targetType) {
                    cleanup();

                    // WAF mitigation delay (Jitter 3s - 5s)
                    const jitterDelay = 3000 + Math.random() * 2000;
                    console.log(`[Controller] WAF 행동 패턴 탐지 방어: 랜덤 지터 대기 시작... (${(jitterDelay / 1000).toFixed(2)}초)`);
                    
                    await new Promise(r => setTimeout(r, jitterDelay));
                    console.log(`[Controller] 지터 대기 완료. 다운로드 큐로 데이터 전달.`);
                    
                    if (targetType === 'novel') {
                        console.log(`[Controller] 팝업으로부터 소설 본문 수집 성공 - 길이: ${content.length}자`);
                        resolve(content);
                    } else {
                        console.log(`[Controller] 팝업으로부터 만화 이미지 수집 성공 - 개수: ${images.length}개`);
                        resolve(images);
                    }
                }
            }
        };

        window.addEventListener('message', messageHandler);

        timeoutId = setTimeout(() => {
            cleanup();
            console.error(`[Controller] 팝업 미디어 수집 타임아웃 발생 (45초) - 유형: ${targetType}`);
            closeActivePopup();
            resolve(null);
        }, timeoutDuration);

        try {
            if (activePopupRef && !activePopupRef.closed) {
                console.log('[Controller] 기존 팝업 재활용 (location.replace 우회):', episodeUrl);
                try {
                    activePopupRef.location.replace(episodeUrl);
                    // Force-bind name to prevent browser security cleanups
                    activePopupRef.name = 'tokisync-novel-worker';
                } catch (replaceErr) {
                    console.warn('[Controller] location.replace 보안 차단 발생, href 폴백 전환:', replaceErr);
                    activePopupRef.location.href = episodeUrl;
                    activePopupRef.name = 'tokisync-novel-worker';
                }
            } else {
                console.log('[Controller] 신규 수집용 팝업 생성:', episodeUrl);
                activePopupRef = window.open(episodeUrl, 'tokisync-novel-worker', 'width=50,height=400,left=0,top=0,noopener=false');
                if (!activePopupRef) {
                    throw new Error('브라우저에 의해 팝업 차단이 감지되었습니다.');
                }
            }

            // Immediately start pushing active extraction commands downwards
            startPushHeartbeat();

        } catch (err) {
            cleanup();
            console.error('[Controller] 팝업 수집 세션 기동 실패:', err);
            closeActivePopup();
            alert(`[TokiSync 팝업 차단 알림]\n\n브라우저 주소창 우측에서 [팝업 및 리다이렉트 항상 허용]으로 설정해 주셔야 정상 수집이 가능합니다.\n\n허용 후 다시 시도해 주세요.\n(오류: ${err.message})`);
            resolve(null);
        }
    });
}

async function fetchMediaViaPopup(episodeUrl, targetType = 'novel', config = {}) {
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        console.log(`[Controller] 🚀 팝업 미디어 수집 시도 시작 (${attempt}/${MAX_RETRIES}) - URL: ${episodeUrl}`);
        
        // 2회차 재시도부터는 기존 팝업 세션을 강력 종료하고 1.5초 여유 딜레이 확보하여 찌꺼기 완벽 클린업
        if (attempt > 1) {
            console.warn(`[Controller] ⚠️ 이전 시도 실패 감지. 팝업 세션을 강제 파괴하고 재설정합니다.`);
            closeActivePopup();
            await new Promise(r => setTimeout(r, 1500));
        }
        
        try {
            const result = await fetchMediaViaPopupSingleAttempt(episodeUrl, targetType, config);
            if (result && result.length > 0) {
                console.log(`[Controller] 🎉 팝업 미디어 수집 시도 (${attempt}/${MAX_RETRIES}) 최종 성공!`);
                return result;
            }
            console.warn(`[Controller] ⚠️ 팝업 미디어 수집 시도 (${attempt}/${MAX_RETRIES}) 실패 (획득 패키지 부재)`);
        } catch (err) {
            console.error(`[Controller] ❌ 팝업 미디어 수집 중 예외 발생 (시도 ${attempt}/${MAX_RETRIES}):`, err);
        }
    }
    console.error(`[Controller] 🛑 총 ${MAX_RETRIES}회의 모든 팝업 수집 시도가 실패했습니다. - URL: ${episodeUrl}`);
    return null;
}

// =============================================================
// 🏛️ 플랜 C Engine: API 직접 복호화 엔진 (페이퍼 플랜 대기 상태)
// =============================================================

async function fetchNovelTextViaApi(episodeUrl, config = {}, _isRetry = false) {
    const endpoint = config.endpoint || '/api/novel-content';
    const cookieName = config.cookieName || 'nv';
    const clientHeader = config.clientHeader || 'shadow-v2';

    try {
        const ids = getIdsFromUrl(episodeUrl);
        if (!ids) return null;

        // 1. Fresh Token 추출
        const html = await fetch(episodeUrl, { credentials: 'same-origin' }).then(r => r.text());
        const tokenMatch = html.match(RE_TOKEN);
        if (!tokenMatch) {
            console.warn('[Decryptor-API] 토큰 추출 실패 (API 호출 중단)');
            return null;
        }
        const token = tokenMatch[1];

        // 2. 쿠키 확인
        let cookie = getCookie(cookieName);
        if (!cookie) {
            console.log('[Decryptor-API] 쿠키 없음 - nv-issue 시도');
            await fetch('/api/nv-issue', { method: 'POST', credentials: 'same-origin' });
            cookie = getCookie(cookieName);
        }
        if (!cookie) return null;

        // 3. Proof 생성 (동적 Nonce 추출 연동)
        const nonce = getValidNonce(token);
        const proof = await hmacSign(cookie, `${token}.${nonce}.${navigator.userAgent}`);

        // 4. API 호출
        const resp = await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'content-type': 'application/json',
                'x-novel-client': clientHeader
            },
            body: JSON.stringify({
                novelId: ids.novelId,
                episodeId: ids.episodeId,
                token, nonce, proof
            })
        });

        // 5. API 실패 시 — 세션 차단 감지 → 쿠키 리셋 후 1회 재시도
        if (!resp.ok) {
            if (!_isRetry) {
                console.warn(`[Decryptor-API] API 실패 (${resp.status}) → 세션 차단 의심, 쿠키 리셋 후 재시도`);
                await resetNvCookie(cookieName);
                return fetchNovelTextViaApi(episodeUrl, config, true);
            }
            console.error(`[Decryptor-API] 재시도 후에도 실패 (${resp.status})`);
            return null;
        }

        const data = await resp.json();
        if (!data.ok || !data.payload) return null;

        // 6. XOR 복호화 및 URI 디코딩 정제 (신형 스펙 보정 적용)
        let resultString = xorDecrypt(data.payload, token);
        if (!resultString) return null;

        if (resultString.startsWith('%')) {
            resultString = decodeURIComponent(resultString);
        }

        return resultString;

    } catch (e) {
        console.error('[Decryptor-API] 복호화 과정 중 예외 발생:', e);
        return null;
    }
}

// =============================================================
// 🏛️ 통합 게이트웨이 진입점 (Gateway)
// =============================================================

export async function fetchNovelText(episodeUrl, config = {}) {
    console.log('[Controller] 소설 본문 수집 개시 - 플랜 B (팝업 IPC) 가동');
    
    // 1순위: 플랜 B (팝업 IPC) 실행
    const content = await fetchMediaViaPopup(episodeUrl, 'novel', config);
    
    if (content) {
        return content;
    }
    
    console.warn('[Controller] 플랜 B (팝업 IPC) 수집 실패 또는 차단 감지');
    
    // 2순위: 플랜 C (API 직접 복호화) - 페이퍼 플랜 대기 상태
    // ⚠️ 긴급 상황 시 아래 조건을 true로 변경하여 즉시 런타임에 투입 가능합니다.
    const EMERGENCY_API_FALLBACK = false;
    
    if (EMERGENCY_API_FALLBACK) {
        console.log('[Controller] 🚨 긴급 폴백 가동: 플랜 C (API 직접 복호화) 실행');
        return await fetchNovelTextViaApi(episodeUrl, config);
    }
    
    return null;
}

export async function fetchComicImages(episodeUrl, config = {}) {
    console.log('[Controller] 만화 이미지 수집 개시 - 팝업 IPC 가동');
    return await fetchMediaViaPopup(episodeUrl, 'comic', config);
}
