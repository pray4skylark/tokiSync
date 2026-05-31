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
export const CFG_SCAN_SPEED = "TOKI_SCAN_SPEED";
export const CFG_LOCAL_NAME_TEMPLATE = "TOKI_LOCAL_NAME_TEMPLATE";
export const CFG_LOCAL_EPISODE_PADDING = "TOKI_LOCAL_EPISODE_PADDING";

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
        customRules: GM_getValue(CFG_CUSTOM_RULES, "[]"),
        scanSpeed: parseFloat(GM_getValue(CFG_SCAN_SPEED, "1.0")),
        localNameTemplate: GM_getValue(CFG_LOCAL_NAME_TEMPLATE, "{number} - {title}"),
        localEpisodePadding: GM_getValue(CFG_LOCAL_EPISODE_PADDING, "4")
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
                <label class="toki-label">로컬 파일명 템플릿</label>
                <input type="text" id="toki-cfg-nametemplate" class="toki-input" 
                       placeholder="{number} - {title}" value="${config.localNameTemplate}">
                <div class="toki-hint" style="font-size: 11px; color: #888; margin-top: 4px;">
                    로컬 저장 시 파일명 포맷입니다. 
                    (치환자: <b>{number}</b>=패딩번호, <b>{rawNumber}</b>=원본번호, <b>{series}</b>=작품명, <b>{title}</b>=회차제목)<br>
                    ※ 구글 드라이브 업로드 시에는 호환성을 위해 템플릿이 적용되지 않고 기존 포맷으로 고정됩니다.
                </div>
            </div>

            <div class="toki-control-group">
                <label class="toki-label">로컬 화수 패딩 자릿수</label>
                <select id="toki-cfg-localpadding" class="toki-select">
                    <option value="0">패딩 없음 (1, 2, 10)</option>
                    <option value="2">2자리 패딩 (01, 02, 10)</option>
                    <option value="3">3자리 패딩 (001, 002, 010)</option>
                    <option value="4">4자리 패딩 (0001, 0002, 0010)</option>
                </select>
                <div class="toki-hint" style="font-size: 11px; color: #888; margin-top: 4px;">
                    템플릿 내 <b>{number}</b> 치환자에 적용될 패딩 자릿수입니다.
                </div>
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
                <label class="toki-label">이미지 스캔 속도 배율
                    <span id="toki-scan-speed-val">${config.scanSpeed.toFixed(1)}×</span>
                </label>
                <input type="range" id="toki-cfg-scanspeed" 
                       min="0.5" max="5.0" step="0.5" value="${config.scanSpeed}"
                       class="toki-range" style="width: 100%;">
                <div class="toki-hint" style="font-size: 11px; color: #888; margin-top: 4px;">
                    0.5×(빠름/불안정) ─ 1.0×(기본) ─ 3.0×(안정) ─ 5.0×(확실)
                </div>
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

    const localPaddingSelect = doc.getElementById('toki-cfg-localpadding');
    if(localPaddingSelect) localPaddingSelect.value = config.localEpisodePadding;
    
    const sleepModeSelect = doc.getElementById('toki-cfg-sleepmode');
    if(sleepModeSelect) sleepModeSelect.value = config.sleepMode;

    const scanSpeedSlider = doc.getElementById('toki-cfg-scanspeed');
    if (scanSpeedSlider) {
        scanSpeedSlider.oninput = (e) => {
            const valSpan = doc.getElementById('toki-scan-speed-val');
            if (valSpan) valSpan.innerText = `${parseFloat(e.target.value).toFixed(1)}×`;
        };
    }

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
        const newScanSpeed = doc.getElementById('toki-cfg-scanspeed').value;
        const newNameTemplate = doc.getElementById('toki-cfg-nametemplate').value.trim() || "{number} - {title}";
        const newLocalPadding = doc.getElementById('toki-cfg-localpadding').value;
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
        setConfig(CFG_SCAN_SPEED, newScanSpeed);
        setConfig(CFG_LOCAL_NAME_TEMPLATE, newNameTemplate);
        setConfig(CFG_LOCAL_EPISODE_PADDING, newLocalPadding);
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