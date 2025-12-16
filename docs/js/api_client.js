/**
 * 🚀 TokiSync API Client
 * GAS(Google Apps Script) Backend와 통신하는 전용 클라이언트
 * google.script.run 대체용
 */

class TokiApiClient {
    constructor() {
        this.baseUrl = localStorage.getItem('TOKI_API_URL') || '';
        this.folderId = localStorage.getItem('TOKI_ROOT_ID') || '';
    }

    /**
     * API 설정 저장
     */
    setConfig(url, id) {
        this.baseUrl = url;
        this.folderId = id;
        localStorage.setItem('TOKI_API_URL', url);
        localStorage.setItem('TOKI_ROOT_ID', id);
    }

    isConfigured() {
        return this.baseUrl && this.folderId;
    }

    /**
     * 통합 API 요청 함수
     * @param {string} type - 요청 타입 (e.g. 'view_get_library')
     * @param {object} payload - 추가 데이터
     */
    async request(type, payload = {}) {
        if (!this.baseUrl) throw new Error("API URL이 설정되지 않았습니다.");

        // 기본 Payload 구성
        const bodyData = {
            ...payload,
            type: type,
            folderId: this.folderId, // 기본적으로 Root ID 전송 (필요 시 오버라이드 가능)
            protocolVersion: 3
        };

        try {
            // [CORS Workaround] GAS는 application/json preflight를 거절하는 경우가 많음.
            // text/plain으로 보내면 브라우저가 preflight를 생략하고 보냄.
            // GAS 서버에서는 e.postData.contents로 파싱 가능.
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8', 
                },
                body: JSON.stringify(bodyData)
            });

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const json = await response.json();

            if (json.status === 'error') {
                throw new Error(json.body || "Unknown Server Error");
            }

            return json.body;

        } catch (e) {
            console.error(`[API] Request Failed (${type}):`, e);
            throw e;
        }
    }
}

// 전역 인스턴스
const API = new TokiApiClient();
