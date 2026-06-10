export const SLEEP_MULTIPLIERS = {
    cautious: 1.0,   // 신중 (1.0배율)
    thorough: 1.5,   // 철저 (1.5배율)
    slow: 2.2,       // 느림 (2.2배율)
    very_slow: 3.0   // 매우 느림 (3.0배율)
};

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
export const CFG_LOG_LEVEL = "TOKI_LOG_LEVEL";

/**
 * Get current configuration
 * @returns {{gasId: string, gasUrl: string, folderId: string, policy: string, apiKey: string, sleepMode: string, smartSkipRatio: number, logLevel: string}}
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
        sleepMode: GM_getValue(CFG_SLEEP_MODE, "cautious"), // default: cautious
        smartSkipRatio: parseInt(GM_getValue(CFG_SMART_SKIP_RATIO, "50"), 10), // default 50% of Max
        novelMode: GM_getValue(CFG_NOVEL_MODE, "perChapter"), // default: chapter-by-chapter
        novelFormat: GM_getValue(CFG_NOVEL_FORMAT, "epub"), // default: EPUB
        remoteRuleUrl: remoteRuleUrl,
        customRules: GM_getValue(CFG_CUSTOM_RULES, "[]"),
        scanSpeed: (() => {
            let val = parseFloat(GM_getValue(CFG_SCAN_SPEED, "1000"));
            if (isNaN(val)) val = 1000;
            // 하위 호환성: 기존의 배속 배율 값(예: 0.5 ~ 5.0)이 저장되어 있는 경우 밀리세컨드 단위로 자동 변환
            if (val <= 10) {
                val = val * 1000; // 1.0배속 -> 1000ms, 3.0배속 -> 3000ms 등
            }
            return Math.round(val);
        })(),
        localNameTemplate: GM_getValue(CFG_LOCAL_NAME_TEMPLATE, "{number} - {title}"),
        localEpisodePadding: GM_getValue(CFG_LOCAL_EPISODE_PADDING, "4"),
        logLevel: GM_getValue(CFG_LOG_LEVEL, "info")
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
 * Check if configuration is valid
 * @returns {boolean}
 */
export function isConfigValid() {
    const config = getConfig();
    return (config.gasId || config.gasUrl) && config.folderId;
}