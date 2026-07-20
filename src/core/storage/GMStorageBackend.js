/**
 * GMStorageBackend — Tampermonkey GM API 구현체
 * GM_getValue / GM_setValue / GM_deleteValue / GM_addValueChangeListener
 * localStorage 폴백, MV3 Promise 대응, 재시도 로직 포함
 */
import { StorageBackend } from './StorageBackend.js';
import { EventBus, EVT } from '../EventBus.js';

const SAVE_RETRY_MAX = 3;
const SAVE_RETRY_BASE_DELAY_MS = 1000;

export class GMStorageBackend extends StorageBackend {
  constructor() {
    super();
    this._changeListeners = new Set();
  }

  get(key, defaultValue) {
    try {
      if (typeof GM_getValue !== 'undefined') {
        return GM_getValue(key, defaultValue);
      }
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : defaultValue;
      }
    } catch (e) {
      console.error(`[GMStorageBackend] get(${key}) 실패:`, e);
    }
    return defaultValue;
  }

  set(key, value) {
    try {
      if (typeof GM_setValue !== 'undefined') {
        const result = GM_setValue(key, value);
        if (result && typeof result.catch === 'function') {
          result.catch(err => {
            console.warn(`[GMStorageBackend] MV3 set(${key}) 비동기 실패:`, err.message);
            this._scheduleRetry(key, value, 1);
          });
        }
        this._notifyListeners(key, value);
        return true;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
        this._notifyListeners(key, value);
        return true;
      }
    } catch (e) {
      console.warn(`[GMStorageBackend] set(${key}) 실패:`, e.message);
    }
    return false;
  }

  delete(key) {
    try {
      if (typeof GM_deleteValue !== 'undefined') {
        GM_deleteValue(key);
        this._notifyListeners(key, undefined);
        return true;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        this._notifyListeners(key, undefined);
        return true;
      }
    } catch (e) {
      console.warn(`[GMStorageBackend] delete(${key}) 실패:`, e.message);
    }
    return false;
  }

  addChangeListener(key, callback) {
    if (typeof GM_addValueChangeListener !== 'undefined') {
      return GM_addValueChangeListener(key, callback);
    }
    const wrapper = (changedKey, oldVal, newVal) => {
      if (changedKey === key) callback(changedKey, oldVal, newVal);
    };
    this._changeListeners.add(wrapper);
    return () => this._changeListeners.delete(wrapper);
  }

  _notifyListeners(key, newVal) {
    this._changeListeners.forEach(cb => {
      try { cb(key, undefined, newVal); } catch (e) {}
    });
  }

  _scheduleRetry(key, value, attempt) {
    if (attempt > SAVE_RETRY_MAX) {
      console.error(`[GMStorageBackend] ❌ set(${key}) 완전 실패 (${SAVE_RETRY_MAX}회 재시도)`);
      EventBus.emit(EVT.STORAGE_FATAL, {
        key,
        retriesExhausted: SAVE_RETRY_MAX
      });
      return;
    }
    const delayMs = SAVE_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
    console.warn(`[GMStorageBackend] 저장 재시도 ${attempt}/${SAVE_RETRY_MAX} (${delayMs}ms)`);
    setTimeout(() => {
      if (this.set(key, value)) {
        EventBus.emit(EVT.UPDATE_PROGRESS);
      } else {
        this._scheduleRetry(key, value, attempt + 1);
      }
    }, delayMs);
  }
}
