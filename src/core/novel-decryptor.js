/**
 * tokiSync - Novel API Decryptor (Plan C Engine)
 *
 * JWT 토큰 디코딩 + 동적 Nonce 추출 + XOR 복호화 기반 API 직접 수집.
 * 팝업 IPC(Plan B)가 실패한 경우의 긴급 폴백 전용 모듈.
 *
 * 팝업 워커 IPC(Plan B)는 worker-controller.js 참조.
 */

// =============================================================
// 🛠️ 암호학 유틸리티 (내부 전용)
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
        const tokenData = JSON.parse(new TextDecoder('utf-8').decode(bytes));

        if (tokenData && tokenData.nonce) {
            console.log('[Decryptor] 신형 토큰 — 내장 Nonce 추출:', tokenData.nonce);
            return tokenData.nonce;
        }
    } catch (e) {
        console.warn('[Decryptor] 토큰 디코딩 오류 — 랜덤 Nonce 생성:', e);
    }
    return b64urlEncode(crypto.getRandomValues(new Uint8Array(24)));
}

// 이스케이프 대응 토큰 정규식
const RE_TOKEN = /\\?"token\\?":\\?"(eyJ[A-Za-z0-9_-]+[A-Za-z0-9_=.-]*)\\?"/;

// =============================================================
// 🏛️ Plan C Engine: API 직접 복호화
// =============================================================

/**
 * JWT + HMAC Proof 기반 소설 API 직접 복호화 수집.
 * Plan B(팝업 IPC) 실패 시 긴급 폴백으로만 사용.
 * @param {string} episodeUrl
 * @param {Object} config - { endpoint, cookieName, clientHeader }
 * @param {boolean} _isRetry
 */
export async function fetchNovelTextViaApi(episodeUrl, config = {}, _isRetry = false) {
    const endpoint = config.endpoint || '/api/novel-content';
    const cookieName = config.cookieName || 'nv';
    const clientHeader = config.clientHeader || 'shadow-v2';

    try {
        const ids = getIdsFromUrl(episodeUrl);
        if (!ids) return null;

        // 1. 페이지에서 Fresh Token 추출
        const html = await fetch(episodeUrl, { credentials: 'same-origin' }).then(r => r.text());
        const tokenMatch = html.match(RE_TOKEN);
        if (!tokenMatch) {
            console.warn('[Decryptor] 토큰 추출 실패 — API 호출 중단');
            return null;
        }
        const token = tokenMatch[1];

        // 2. 세션 쿠키 확인 및 발급
        let cookie = getCookie(cookieName);
        if (!cookie) {
            console.log('[Decryptor] 쿠키 없음 — nv-issue 시도');
            await fetch('/api/nv-issue', { method: 'POST', credentials: 'same-origin' });
            cookie = getCookie(cookieName);
        }
        if (!cookie) return null;

        // 3. Proof 생성 (동적 Nonce 연동)
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
            body: JSON.stringify({ novelId: ids.novelId, episodeId: ids.episodeId, token, nonce, proof })
        });

        // 5. 실패 시 쿠키 리셋 후 1회 재시도
        if (!resp.ok) {
            if (!_isRetry) {
                console.warn(`[Decryptor] API 실패 (${resp.status}) — 세션 차단 의심, 쿠키 리셋 후 재시도`);
                await resetNvCookie(cookieName);
                return fetchNovelTextViaApi(episodeUrl, config, true);
            }
            console.error(`[Decryptor] 재시도 후에도 실패 (${resp.status})`);
            return null;
        }

        const data = await resp.json();
        if (!data.ok || !data.payload) return null;

        // 6. XOR 복호화 및 URI 디코딩 정제
        let resultString = xorDecrypt(data.payload, token);
        if (!resultString) return null;

        if (resultString.startsWith('%')) {
            resultString = decodeURIComponent(resultString);
        }

        return resultString;

    } catch (e) {
        console.error('[Decryptor] 복호화 예외 발생:', e);
        return null;
    }
}
