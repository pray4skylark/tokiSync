export const CFG_URL_KEY = "TOKI_GAS_URL"; // legacy
export const CFG_ID_KEY = "TOKI_GAS_ID";
export const CFG_FOLDER_ID = "TOKI_FOLDER_ID";
export const CFG_POLICY_KEY = "TOKI_DOWNLOAD_POLICY";
export const CFG_API_KEY = "TOKI_API_KEY";
export const CFG_SLEEP_MODE = "TOKI_SLEEP_MODE";
export const CFG_SMART_SKIP_RATIO = "TOKI_SMART_SKIP_RATIO";
export const CFG_NOVEL_MODE = "TOKI_NOVEL_MODE";
export const CFG_NOVEL_FORMAT = "TOKI_NOVEL_FORMAT";
export const CFG_REMOTE_RULE_URL = "TOKI_REMOTE_RULE_URL";
export const CFG_CUSTOM_RULES = "TOKI_CUSTOM_RULES";

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

    let remoteRuleUrl = GM_getValue(CFG_REMOTE_RULE_URL, "");
    if (!remoteRuleUrl || remoteRuleUrl.trim() === "") {
        remoteRuleUrl = "https://pray4skylark.github.io/tokiSync/rules.json";
    }

    return {
        gasId: finalGasId,
        gasUrl: finalGasUrl,
        folderId: GM_getValue(CFG_FOLDER_ID, ""),
        policy: GM_getValue(CFG_POLICY_KEY, "folderInCbz"),
        apiKey: GM_getValue(CFG_API_KEY, ""),
        sleepMode: GM_getValue(CFG_SLEEP_MODE, "agile"), // default: agile
        smartSkipRatio: parseInt(GM_getValue(CFG_SMART_SKIP_RATIO, "50"), 10), // default 50% of Max
        novelMode: GM_getValue(CFG_NOVEL_MODE, "perChapter"), // default: chapter-by-chapter
        novelFormat: GM_getValue(CFG_NOVEL_FORMAT, "epub"), // default: EPUB
        remoteRuleUrl: remoteRuleUrl,
        customRules: GM_getValue(CFG_CUSTOM_RULES, "[]")
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
export function showConfigModal(popupDoc = document) {
    const doc = popupDoc;
    // Remove existing modal if any
    const existing = doc.getElementById('toki-config-modal');
    if (existing) existing.remove();

    const config = getConfig();

    // -- HTML Structure (v1.9.1 Glassmorphism) --
    const overlay = doc.createElement('div');
    overlay.id = 'toki-config-modal';
    overlay.className = 'toki-modal-overlay';
    

    overlay.innerHTML = `
        <div class="toki-modal toki-modal-main">
            <div class="toki-modal-header toki-modal-header-borderless">
                <div class="toki-modal-title toki-text-lg">🛠️ 상세 설정 (Advanced)</div>
            </div>
            
            <div class="toki-section-title toki-mt-0">Cloud & Storage</div>
            <div class="toki-control-group">
                <label class="toki-label">GAS Script ID</label>
                <input type="text" id="toki-cfg-gas-id" class="toki-input" placeholder="AKfycb..." value="${config.gasId}">
            </div>

            <div class="toki-control-group">
                <label class="toki-label">Google Drive Folder ID</label>
                <input type="text" id="toki-cfg-folder" class="toki-input" placeholder="Folder ID" value="${config.folderId}">
            </div>

            <div class="toki-control-group">
                <label class="toki-label">API Key (보안)</label>
                <input type="password" id="toki-cfg-apikey" class="toki-input" placeholder="API Key" value="${config.apiKey}">
            </div>

            <div class="toki-section-title">Global Policies</div>
            <div class="toki-control-group">
                <label class="toki-label">다운로드 정책</label>
                <select id="toki-cfg-policy" class="toki-select">
                    <option value="individual">개별 파일 (Individual)</option>
                    <option value="zipOfCbzs">챕터 묶음 (ZIP of CBZs)</option>
                    <option value="native">자동 분류 (Native)</option>
                    <option value="drive">드라이브 업로드 (GoogleDrive)</option>
                </select>
            </div>

            <div class="toki-control-group">
                <label class="toki-label">다운로드 속도</label>
                <select id="toki-cfg-sleepmode" class="toki-select">
                    <option value="agile">빠름 (1-3초)</option>
                    <option value="cautious">신중 (2-5초)</option>
                    <option value="thorough">철저 (3-8초)</option>
                    <option value="slow">느림 (5-15초)</option>
                    <option value="very_slow">매우 느림 (10-30초)</option>
                </select>
            </div>

            <div class="toki-control-group">
                <label class="toki-label">Smart Skip 민감도</label>
                <select id="toki-cfg-smartskip" class="toki-select">
                    <option value="90">90% (매우 민감)</option>
                    <option value="80">80% (민감)</option>
                    <option value="70">70% (보통)</option>
                    <option value="50">50% (기본)</option>
                </select>
            </div>
            
            <div class="toki-section-title">Format & Rules</div>
            <div class="toki-form-grid">
                <div class="toki-control-group">
                    <label class="toki-label">소설 포맷</label>
                    <select id="toki-cfg-novel-format" class="toki-select">
                        <option value="epub">EPUB</option>
                        <option value="txt">TXT</option>
                    </select>
                </div>
                <div class="toki-control-group">
                    <label class="toki-label">소설 패키징</label>
                    <select id="toki-cfg-novel-mode" class="toki-select">
                        <option value="perChapter">개별 회차</option>
                        <option value="singleVolume">범위 합본</option>
                    </select>
                </div>
            </div>

            <div class="toki-control-group">
                <label class="toki-label">원격 파싱 룰 URL (JSON)</label>
                <input type="text" id="toki-cfg-remote-rule" class="toki-input" placeholder="https://example.com/rules.json" value="${config.remoteRuleUrl}">
            </div>

            <div class="toki-control-group">
                <label class="toki-label">커스텀 파싱 룰 (JSON Array)</label>
                <textarea id="toki-cfg-custom-rule" class="toki-textarea toki-textarea-code" placeholder="[{...}]">${config.customRules}</textarea>
            </div>

            <div class="toki-modal-footer toki-btn-group-row toki-mt-32">
                <button id="toki-btn-cancel" class="toki-btn-action toki-btn-secondary">취소</button>
                <button id="toki-btn-save" class="toki-btn-action">설정 저장하기</button>
            </div>
        </div>
    `;

    doc.body.appendChild(overlay);

    // -- Logic --
    const policySelect = doc.getElementById('toki-cfg-policy');
    if(policySelect) policySelect.value = config.policy;
    
    const sleepModeSelect = doc.getElementById('toki-cfg-sleepmode');
    if(sleepModeSelect) sleepModeSelect.value = config.sleepMode;

    const smartSkipSelect = doc.getElementById('toki-cfg-smartskip');
    if(smartSkipSelect) smartSkipSelect.value = config.smartSkipRatio;

    const novelModeSelect = doc.getElementById('toki-cfg-novel-mode');
    if(novelModeSelect) novelModeSelect.value = config.novelMode;

    const novelFormatSelect = doc.getElementById('toki-cfg-novel-format');
    if(novelFormatSelect) novelFormatSelect.value = config.novelFormat;

    doc.getElementById('toki-btn-cancel').onclick = () => overlay.remove();
    
    doc.getElementById('toki-btn-save').onclick = () => {
        const newGasId = doc.getElementById('toki-cfg-gas-id').value.trim();
        const newFolder = doc.getElementById('toki-cfg-folder').value.trim();
        const newApiKey = doc.getElementById('toki-cfg-apikey').value.trim();
        const newPolicy = doc.getElementById('toki-cfg-policy').value;
        const newSleepMode = doc.getElementById('toki-cfg-sleepmode').value;
        const newSmartSkip = doc.getElementById('toki-cfg-smartskip').value;
        const newNovelMode = doc.getElementById('toki-cfg-novel-mode').value;
        const newNovelFormat = doc.getElementById('toki-cfg-novel-format').value;
        const newRemoteRule = doc.getElementById('toki-cfg-remote-rule').value.trim();
        const newCustomRule = doc.getElementById('toki-cfg-custom-rule').value.trim() || '[]';

        // Validate Custom Rules JSON
        let validCustomRule = '[]';
        try {
            let parsed = JSON.parse(newCustomRule);
            
            // [v1.8.1] 룰 구조 유연화: { rules: [...] } 형태의 전체 구조를 넣었을 경우 자동 처리
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                if (Array.isArray(parsed.rules)) {
                    parsed = parsed.rules;
                } else {
                    throw new Error("커스텀 룰은 JSON 배열이거나, 'rules' 키를 포함한 객체여야 합니다.");
                }
            }

            if (!Array.isArray(parsed)) {
                throw new Error("커스텀 룰은 JSON 배열(Array) 형태여야 합니다.");
            }
            validCustomRule = JSON.stringify(parsed, null, 2);
        } catch (e) {
            alert(`커스텀 룰 JSON 파싱 오류:\n${e.message}\n설정을 저장할 수 없습니다.`);
            return;
        }

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
        setConfig(CFG_NOVEL_MODE, newNovelMode);
        setConfig(CFG_NOVEL_FORMAT, newNovelFormat);
        setConfig(CFG_REMOTE_RULE_URL, newRemoteRule);
        setConfig(CFG_CUSTOM_RULES, validCustomRule);

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