export const CFG_URL_KEY = "TOKI_GAS_URL"; // legacy
export const CFG_ID_KEY = "TOKI_GAS_ID";
export const CFG_FOLDER_ID = "TOKI_FOLDER_ID";
export const CFG_POLICY_KEY = "TOKI_DOWNLOAD_POLICY";
export const CFG_API_KEY = "TOKI_API_KEY";
export const CFG_SLEEP_MODE = "TOKI_SLEEP_MODE";
export const CFG_SMART_SKIP_RATIO = "TOKI_SMART_SKIP_RATIO";

/**
 * Get current configuration
 * @returns {{gasId: string, gasUrl: string, folderId: string, policy: string, apiKey: string, sleepMode: string, smartSkipRatio: number}}
 */
export function getConfig() {
    let gasId = GM_getValue(CFG_ID_KEY, "");
    let gasUrl = GM_getValue(CFG_URL_KEY, "");

    // Auto-migration: gasUrl -> gasId
    if (!gasId && gasUrl) {
        const match = gasUrl.match(/\/s\/([^\/]+)\/exec/);
        if (match) {
            gasId = match[1];
            GM_setValue(CFG_ID_KEY, gasId);
            console.log("✅ [Config] Auto-migrated GAS URL to ID:", gasId);
        }
    }

    const finalGasId = gasId;
    // URL fallback for legacy or reconstructed from ID
    const finalGasUrl = finalGasId 
        ? `https://script.google.com/macros/s/${finalGasId}/exec` 
        : gasUrl;

    return {
        gasId: finalGasId,
        gasUrl: finalGasUrl,
        folderId: GM_getValue(CFG_FOLDER_ID, ""),
        policy: GM_getValue(CFG_POLICY_KEY, "folderInCbz"),
        apiKey: GM_getValue(CFG_API_KEY, ""),
        sleepMode: GM_getValue(CFG_SLEEP_MODE, "agile"), // default: agile
        smartSkipRatio: parseInt(GM_getValue(CFG_SMART_SKIP_RATIO, "50"), 10) // default 50% of Max
    };
}

/**
 * Set configuration value
 * @param {string} key 
 * @param {string} value 
 */
export function setConfig(key, value) {
    GM_setValue(key, value);
}

/**
 * Show Configuration Modal
 */
export function showConfigModal() {
    // Remove existing modal if any
    const existing = document.getElementById('toki-config-modal');
    if (existing) existing.remove();

    const config = getConfig();

    // -- Styles --
    const styleId = 'toki-config-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .toki-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(5px);
                z-index: 10000;
                display: flex; justify-content: center; align-items: center;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            .toki-modal-container {
                background: rgba(30, 32, 35, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                border-radius: 16px;
                padding: 24px;
                width: 400px;
                color: #fff;
            }
            .toki-modal-header {
                font-size: 20px; font-weight: 600; margin-bottom: 20px;
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
            }
            .toki-input-group { margin-bottom: 16px; }
            .toki-label { display: block; font-size: 12px; color: #aaa; margin-bottom: 6px; }
            .toki-input, .toki-select {
                width: 100%; padding: 10px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: #fff; font-size: 14px;
                box-sizing: border-box;
            }
            .toki-input:focus, .toki-select:focus {
                outline: none; border-color: #6a5acd;
                box-shadow: 0 0 0 2px rgba(106, 90, 205, 0.3);
            }
            .toki-modal-footer {
                display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;
            }
            .toki-btn {
                padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;
                font-size: 14px; font-weight: 500; transition: all 0.2s;
            }
            .toki-btn-cancel { background: transparent; color: #aaa; border: 1px solid rgba(255,255,255,0.1); }
            .toki-btn-cancel:hover { background: rgba(255,255,255,0.05); color: #fff; }
            .toki-btn-save {
                background: linear-gradient(135deg, #6a5acd, #483d8b);
                color: #fff;
                box-shadow: 0 4px 15px rgba(106, 90, 205, 0.4);
            }
            .toki-btn-save:hover { filter: brightness(1.1); transform: translateY(-1px); }
        `;
        document.head.appendChild(style);
    }

    // -- HTML Structure --
    const overlay = document.createElement('div');
    overlay.id = 'toki-config-modal';
    overlay.className = 'toki-modal-overlay';
    
    overlay.innerHTML = `
        <div class="toki-modal-container">
            <div class="toki-modal-header">TokiSync 설정</div>
            
            <div class="toki-input-group">
                <label class="toki-label">GAS Script ID</label>
                <input type="text" id="toki-cfg-gas-id" class="toki-input" placeholder="AKfycb..." value="${config.gasId}">
            </div>

            <div class="toki-input-group">
                <label class="toki-label">Google Drive Folder ID</label>
                <input type="text" id="toki-cfg-folder" class="toki-input" placeholder="Folder ID" value="${config.folderId}">
            </div>

            <div class="toki-input-group">
                <label class="toki-label">API Key (보안)</label>
                <input type="password" id="toki-cfg-apikey" class="toki-input" placeholder="API Key" value="${config.apiKey}">
            </div>

            <div class="toki-input-group">
                <label class="toki-label">다운로드 정책</label>
                <select id="toki-cfg-policy" class="toki-select">
                    <option value="individual">1. 개별 파일 (Individual)</option>
                    <option value="zipOfCbzs">2. 챕터 묶음 (ZIP of CBZs)</option>
                    <option value="native">3. 자동 분류 (Native)</option>
                    <option value="drive">4. 드라이브 업로드 (GoogleDrive)</option>
                    <option value="folderInCbz" style="display:none;">[구버전] 통합 파일 (Folder in CBZ/EPUB)</option>
                </select>
            </div>

            <div class="toki-input-group">
                <label class="toki-label">다운로드 속도</label>
                <select id="toki-cfg-sleepmode" class="toki-select">
                    <option value="agile">빠름 (1-3초)</option>
                    <option value="cautious">신중 (2-5초)</option>
                    <option value="thorough">철저 (3-8초)</option>
                </select>
            </div>

            <div class="toki-input-group">
                <label class="toki-label">Smart Skip 민감도 (최고 용량 기준)</label>
                <select id="toki-cfg-smartskip" class="toki-select">
                    <option value="90">90% (매우 민감: 최고 용량의 90% 미만 재다운로드)</option>
                    <option value="80">80% (민감: 최고 용량의 80% 미만 재다운로드)</option>
                    <option value="70">70% (보통: 최고 용량의 70% 미만 재다운로드)</option>
                    <option value="50">50% (기본: 최고 용량 대비 반토막 난 파일만 감지)</option>
                </select>
            </div>

            <div class="toki-modal-footer">
                <button id="toki-btn-cancel" class="toki-btn toki-btn-cancel">취소</button>
                <button id="toki-btn-save" class="toki-btn toki-btn-save">저장</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // -- Logic --
    const policySelect = document.getElementById('toki-cfg-policy');
    if(policySelect) policySelect.value = config.policy;
    
    const sleepModeSelect = document.getElementById('toki-cfg-sleepmode');
    if(sleepModeSelect) sleepModeSelect.value = config.sleepMode;

    const smartSkipSelect = document.getElementById('toki-cfg-smartskip');
    if(smartSkipSelect) smartSkipSelect.value = config.smartSkipRatio;

    document.getElementById('toki-btn-cancel').onclick = () => overlay.remove();
    
    document.getElementById('toki-btn-save').onclick = () => {
        const newGasId = document.getElementById('toki-cfg-gas-id').value.trim();
        const newFolder = document.getElementById('toki-cfg-folder').value.trim();
        const newApiKey = document.getElementById('toki-cfg-apikey').value.trim();
        const newPolicy = document.getElementById('toki-cfg-policy').value;
        const newSleepMode = document.getElementById('toki-cfg-sleepmode').value;
        const newSmartSkip = document.getElementById('toki-cfg-smartskip').value;

        // URL 입력 시 ID 추출 로직 병합 (사용자 편의성)
        let finalGasId = newGasId;
        const urlMatch = newGasId.match(/\/s\/([^\/]+)\/exec/);
        if (urlMatch) finalGasId = urlMatch[1];

        setConfig(CFG_ID_KEY, finalGasId);
        setConfig(CFG_FOLDER_ID, newFolder);
        setConfig(CFG_API_KEY, newApiKey);
        setConfig(CFG_POLICY_KEY, newPolicy);
        setConfig(CFG_SLEEP_MODE, newSleepMode);
        setConfig(CFG_SMART_SKIP_RATIO, newSmartSkip);

        alert('설정이 저장되었습니다.');
        overlay.remove();
    };

    // Close on background click
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
}

/**
 * Check if configuration is valid
 * @returns {boolean}
 */
export function isConfigValid() {
    const config = getConfig();
    return (config.gasId || config.gasUrl) && config.folderId;
}