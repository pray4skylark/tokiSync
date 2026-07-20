export const SLEEP_MULTIPLIERS = {
    cautious: 1.0,
    thorough: 1.5,
    slow: 2.2,
    very_slow: 3.0
};

export const CFG_URL_KEY = "TOKI_GAS_URL";
export const CFG_ID_KEY = "TOKI_GAS_ID";
export const CFG_FOLDER_ID = "TOKI_FOLDER_ID";
export const CFG_POLICY_KEY = "TOKI_DOWNLOAD_POLICY";
export const CFG_API_KEY = "TOKI_API_KEY";
export const CFG_SLEEP_MODE = "TOKI_SLEEP_MODE";
export const CFG_SMART_SKIP_RATIO = "TOKI_SMART_SKIP_RATIO";
export const CFG_NOVEL_MODE = "TOKI_NOVEL_MODE";
export const CFG_NOVEL_FORMAT = "TOKI_NOVEL_FORMAT";
export const CFG_PARSER_RULES = "TOKI_PARSER_RULES";
export const CFG_SCAN_SPEED = "TOKI_SCAN_SPEED";
export const CFG_LOCAL_NAME_TEMPLATE = "TOKI_LOCAL_NAME_TEMPLATE";
export const CFG_LOG_LEVEL = "TOKI_LOG_LEVEL";
export const CFG_RULE_SUBSCRIPTIONS = "TOKI_RULE_SUBSCRIPTIONS";

const BACKUP_KEY = "tokisync_config_backup";

let _storage = null;

export function setConfigStorage(backend) {
    _storage = backend;
}

function _storageGet(key, defaultValue) {
    if (_storage) return _storage.get(key, defaultValue);
    if (typeof GM_getValue !== 'undefined') return GM_getValue(key, defaultValue);
    if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : defaultValue;
    }
    return defaultValue;
}

function _storageSet(key, value) {
    if (_storage) return _storage.set(key, value);
    if (typeof GM_setValue !== 'undefined') {
        GM_setValue(key, value);
        return true;
    }
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    }
    return false;
}

function backupToLocalStorage(configObj) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(BACKUP_KEY, JSON.stringify(configObj));
        }
    } catch (e) {
        console.warn("[Config] LocalStorage 백업 저장 실패:", e);
    }
}

function restoreFromLocalStorage() {
    try {
        if (typeof localStorage !== 'undefined') {
            const backupStr = localStorage.getItem(BACKUP_KEY);
            if (backupStr) {
                const backup = JSON.parse(backupStr);
                if (backup && (backup.gasId || backup.folderId)) {
                    console.log("[Config] 🛡️ LocalStorage 백업 감지 -> Storage로 복원");
                    _storageSet(CFG_ID_KEY, backup.gasId);
                    _storageSet(CFG_FOLDER_ID, backup.folderId);
                    if (backup.policy) _storageSet(CFG_POLICY_KEY, backup.policy);
                    if (backup.apiKey) _storageSet(CFG_API_KEY, backup.apiKey);
                    if (backup.sleepMode) _storageSet(CFG_SLEEP_MODE, backup.sleepMode);
                    if (backup.smartSkipRatio) _storageSet(CFG_SMART_SKIP_RATIO, backup.smartSkipRatio.toString());
                    if (backup.novelMode) _storageSet(CFG_NOVEL_MODE, backup.novelMode);
                    if (backup.novelFormat) _storageSet(CFG_NOVEL_FORMAT, backup.novelFormat);
                    if (backup.scanSpeed) _storageSet(CFG_SCAN_SPEED, backup.scanSpeed.toString());
                    if (backup.localNameTemplate) _storageSet(CFG_LOCAL_NAME_TEMPLATE, backup.localNameTemplate);
                    if (backup.logLevel) _storageSet(CFG_LOG_LEVEL, backup.logLevel);
                    return true;
                }
            }
        }
    } catch (e) {
        console.warn("[Config] LocalStorage 백업 복원 실패:", e);
    }
    return false;
}

export function getConfig() {
    let gasId = _storageGet(CFG_ID_KEY, "");
    let folderId = _storageGet(CFG_FOLDER_ID, "");

    if (!gasId && !folderId) {
        const restored = restoreFromLocalStorage();
        if (restored) {
            gasId = _storageGet(CFG_ID_KEY, "");
            folderId = _storageGet(CFG_FOLDER_ID, "");
        }
    }

    let gasUrl = _storageGet(CFG_URL_KEY, "");

    if (!gasId && gasUrl) {
        const match = gasUrl.match(/\/s\/([^\/]+)\/exec/);
        if (match) {
            gasId = match[1];
            _storageSet(CFG_ID_KEY, gasId);
            console.log("✅ [Config] GAS URL 마이그레이션 완료");
        }
    }

    const finalGasId = gasId;
    const finalGasUrl = finalGasId
        ? `https://script.google.com/macros/s/${finalGasId}/exec`
        : gasUrl;

    const configObj = {
        gasId: finalGasId,
        gasUrl: finalGasUrl,
        folderId: _storageGet(CFG_FOLDER_ID, ""),
        policy: _storageGet(CFG_POLICY_KEY, "folderInCbz"),
        apiKey: _storageGet(CFG_API_KEY, ""),
        sleepMode: _storageGet(CFG_SLEEP_MODE, "cautious"),
        smartSkipRatio: parseInt(_storageGet(CFG_SMART_SKIP_RATIO, "50"), 10),
        novelMode: _storageGet(CFG_NOVEL_MODE, "perChapter"),
        novelFormat: _storageGet(CFG_NOVEL_FORMAT, "epub"),
        scanSpeed: (() => {
            let val = parseFloat(_storageGet(CFG_SCAN_SPEED, "1000"));
            if (isNaN(val)) val = 1000;
            if (val <= 10) val = val * 1000;
            return Math.round(val);
        })(),
        localNameTemplate: _storageGet(CFG_LOCAL_NAME_TEMPLATE, "{number:4} - {title}"),
        logLevel: _storageGet(CFG_LOG_LEVEL, "info")
    };
    backupToLocalStorage(configObj);
    return configObj;
}

export function setConfig(key, value) {
    const ok = _storageSet(key, value);
    if (!ok) {
        console.error(`[Config] ${key} 저장 실패: storage backend unavailable`);
    }
    try {
        const configObj = getConfig();
        backupToLocalStorage(configObj);
    } catch (e) {
        console.warn(`[Config] Backup to localStorage failed: ${e.message}`);
    }
    return ok;
}

export function isConfigValid() {
    const config = getConfig();
    return (config.gasId || config.gasUrl) && config.folderId;
}