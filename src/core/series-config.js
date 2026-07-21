/**
 * tokiSync - Series Config Manager
 * 시리즈별 공유 데이터를 큐 아이템과 분리하여 별도 GM 키에 저장
 *   TOKI_SERIES_{ruleId}_{seriesId} = { matchedRule, viewerCfg, seriesMetadata,
 *       rootFolder, folderId, category, destination, novelFormat, protocolDomain }
 */
import { EventBus, EVT } from './EventBus.js';

const STORAGE_PREFIX = 'TOKI_SERIES_';

let _storage = null;

export function setSeriesStorage(backend) {
    _storage = backend;
}

function _get(key) {
    if (_storage) return _storage.get(key, null);
    if (typeof GM_getValue !== 'undefined') {
        try { return GM_getValue(key, null); } catch (e) {}
    }
    if (typeof localStorage !== 'undefined') {
        try {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : null;
        } catch (e) {}
    }
    return null;
}

function _set(key, value) {
    if (_storage) return _storage.set(key, value);
    if (typeof GM_setValue !== 'undefined') {
        try { GM_setValue(key, value); return true; } catch (e) {}
    }
    if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) {}
    }
    return false;
}

function _delete(key) {
    if (_storage) { _storage.delete(key); return; }
    if (typeof GM_deleteValue !== 'undefined') {
        try { GM_deleteValue(key); } catch (e) {}
    }
    if (typeof localStorage !== 'undefined') {
        try { localStorage.removeItem(key); } catch (e) {}
    }
}

export function getSeriesConfigKey(ruleId, seriesId, seriesTitle = '') {
    // seriesTitle 단축 해시로 ruleId/seriesId 충돌 방지
    let hash = 0;
    for (let i = 0; i < seriesTitle.length; i++) {
        hash = ((hash << 5) - hash) + seriesTitle.charCodeAt(i);
        hash |= 0;
    }
    const shortHash = Math.abs(hash).toString(16).substring(0, 4);
    return `${STORAGE_PREFIX}${ruleId}_${shortHash}_${seriesId}`;
}

export function getSeriesConfig(seriesKey) {
    const val = _get(seriesKey);
    if (!val) return null;
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch (e) { return null; }
    }
    return val;
}

export function saveSeriesConfig(seriesKey, config) {
    return _set(seriesKey, config);
}

export function deleteSeriesConfig(seriesKey) {
    if (!seriesKey) return;
    _delete(seriesKey);
}

/**
 * 구 queue 아이템(공유 필드 inline) 또는 신규 아이템(seriesKey)을 정규화
 * @param {Object} item queue item
 * @returns {Object} 공유 필드가 주입된 완전한 item (원본은 변경하지 않음)
 */
export function normalizeQueueItem(item) {
    if (!item) return item;
    if (!item.seriesKey) return item;
    const cfg = getSeriesConfig(item.seriesKey);
    if (!cfg) {
        console.warn(`[SeriesConfig] normalizeQueueItem: seriesKey="${item.seriesKey}" 참조 실패 (config deleted or not saved)`);
        return item;
    }
    return { ...cfg, ...item };
}
