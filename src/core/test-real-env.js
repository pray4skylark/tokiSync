import { EventBus, EVT } from './EventBus.js';
import { LogBox } from './ui/LogBox.js';
import { MenuModal } from './ui/MenuModal.js';
import { initQueueScheduler } from './queue.js';

let passCount = 0;
let failCount = 0;
const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

// ── 가상 DOM 및 브라우저 환경 셋업 ───────────────────────────
const originalWindow = globalThis.window;
const originalGM = {
    register: globalThis.GM_registerMenuCommand,
    get: globalThis.GM_getValue,
    set: globalThis.GM_setValue
};

function setupMockBrowser() {
    globalThis.window = {
        screen: { width: 1920, height: 1080 },
        open() {
            return createMockPopup();
        }
    };
    globalThis.GM_registerMenuCommand = () => {};
    globalThis.GM_getValue = (key, defaultVal) => {
        if (key === 'TOKI_QUEUE') return '[]';
        if (key === 'TOKI_CONFIG') return '{}';
        return defaultVal !== undefined ? defaultVal : null;
    };
    globalThis.GM_setValue = () => {};
    globalThis.localStorage = {
        _store: {},
        getItem(key) { return this._store[key] || null; },
        setItem(key, val) { this._store[key] = val.toString(); },
        removeItem(key) { delete this._store[key]; },
        clear() { this._store = {}; }
    };
}

function restoreBrowser() {
    globalThis.window = originalWindow;
    globalThis.GM_registerMenuCommand = originalGM.register;
    globalThis.GM_getValue = originalGM.get;
    globalThis.GM_setValue = originalGM.set;
    delete globalThis.localStorage;
}

function createMockPopup() {
    const docElements = new Map();
    
    // 모의 DOM 엘리먼트 헬퍼
    const createMockElement = (id) => ({
        id,
        style: {},
        classList: {
            add() {},
            remove() {},
            toggle() {}
        },
        textContent: '',
        innerHTML: '',
        onclick: null,
        onchange: null,
        appendChild(child) {},
        addEventListener(evt, cb) {},
        removeEventListener(evt, cb) {},
        getAttribute(name) {
            if (name === 'data-tab') return 'download';
            return '';
        },
        querySelector(selector) {
            return createMockElement('query-sub');
        }
    });

    const doc = {
        title: '',
        head: { appendChild() {} },
        body: {
            appendChild() {},
            innerHTML: ''
        },
        createElement(tag) {
            return createMockElement(tag);
        },
        getElementById(id) {
            if (!docElements.has(id)) {
                docElements.set(id, createMockElement(id));
            }
            return docElements.get(id);
        },
        querySelector(selector) {
            return createMockElement('query-result');
        },
        querySelectorAll(selector) {
            return [createMockElement('query-all-1'), createMockElement('query-all-2')];
        }
    };

    const listeners = new Map();

    const popup = {
        closed: false,
        document: doc,
        focus() {},
        close() {
            this.closed = true;
            if (listeners.has('beforeunload')) {
                listeners.get('beforeunload').forEach(cb => cb());
            }
        },
        addEventListener(evt, cb) {
            if (!listeners.has(evt)) listeners.set(evt, []);
            listeners.get(evt).push(cb);
        },
        removeEventListener(evt, cb) {
            if (listeners.has(evt)) {
                listeners.set(evt, listeners.get(evt).filter(l => l !== cb));
            }
        },
        confirm() { return true; }
    };

    return popup;
}

// ── 테스트 1: Cross-Window EventBus 스코프 바인딩 검증 ──────
test('Cross-Window 환경에서 자식 팝업 내부의 클릭 이벤트가 부모 창의 EventBus에 도달해야 합니다.', () => {
    setupMockBrowser();
    initQueueScheduler();
    
    // LogBox와 MenuModal 인스턴스 초기화 (싱글톤 초기화)
    LogBox.instance = null;
    MenuModal.instance = null;

    const logBox = new LogBox();
    const menuModal = new MenuModal();

    // 팝업 열기
    logBox.openDashboard();
    const popup = logBox.popupWindow;

    // 팝업 바인딩 검증용 이벤트 감시
    let updateProgressEmitted = false;
    const unsub = EventBus.on(EVT.UPDATE_PROGRESS, () => {
        updateProgressEmitted = true;
    });

    // 팝업 내 toki-inline-stop 엘리먼트 가져오기
    const stopBtn = popup.document.getElementById('toki-inline-stop');
    
    // 클릭 이벤트 트리거 시뮬레이션
    if (typeof stopBtn.onclick === 'function') {
        stopBtn.onclick();
    }

    console.assert(updateProgressEmitted === true, '자식 팝업 클릭 시 부모 창의 EventBus로 이벤트가 중계되지 않았습니다.');

    if (!updateProgressEmitted) {
        unsub();
        restoreBrowser();
        throw new Error('Cross-Window EventBus 중계 실패');
    }

    unsub();
    logBox.hide();
    restoreBrowser();
});

// ── 테스트 2: GM API 미정의 환경 안전 장치 검증 ────────────────
test('GM_registerMenuCommand API가 정의되지 않은 사이트/샌드박스에서도 UI 모듈이 크래시 없이 로드되어야 합니다.', () => {
    setupMockBrowser();
    
    // GM API 미정의 시뮬레이션
    delete globalThis.GM_registerMenuCommand;

    LogBox.instance = null;
    let initializedWithoutError = false;

    try {
        const logBox = new LogBox();
        initializedWithoutError = (logBox !== null);
    } catch (e) {
        console.error('GM API 미정의 환경 로드 실패:', e);
    }

    console.assert(initializedWithoutError === true, 'GM API가 없을 때 LogBox 생성자가 예외로 중단되었습니다.');

    if (!initializedWithoutError) {
        restoreBrowser();
        throw new Error('GM API 미정의 시 크래시 발생');
    }

    restoreBrowser();
});

// ── 테스트 3: setInterval 팝업 라이프사이클 클린업 검증 ──────
test('대시보드 팝업이 열릴 때 동기화 타이머가 작동하고, 닫힐 때 완전히 해제되어야 합니다.', () => {
    setupMockBrowser();
    
    LogBox.instance = null;
    const logBox = new LogBox();

    // 초기 상태: 팝업이 없으므로 타이머가 동작하지 않음
    console.assert(logBox.syncIntervalId === null, '초기 상태에 동기화 타이머가 실행 중입니다.');

    // 팝업 열기
    logBox.openDashboard();
    console.assert(logBox.syncIntervalId !== null, '팝업 활성화 후 동기화 타이머가 시작되지 않았습니다.');

    // 팝업 닫기
    logBox.hide();
    console.assert(logBox.syncIntervalId === null, '팝업이 닫혔음에도 동기화 타이머가 해제되지 않았습니다.');

    if (logBox.syncIntervalId !== null) {
        restoreBrowser();
        throw new Error('타이머 클린업 실패');
    }

    restoreBrowser();
});

// ── 실행 ──────────────────────────────────────────────────────
async function runRealEnvTests() {
    console.log('🧪 실환경 시나리오(Cross-Window, GM API, 타이머) 시뮬레이션 테스트를 시작합니다...\n');
    
    for (const t of tests) {
        try {
            await t.fn();
            console.log(`✅ PASS: ${t.name}`);
            passCount++;
        } catch (err) {
            console.error(`❌ FAIL: ${t.name}`);
            console.error(err.stack || err);
            failCount++;
        }
    }
    
    console.log(`\n📊 실환경 시뮬레이션 결과: 성공 ${passCount}건 / 실패 ${failCount}건`);
    
    if (failCount > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runRealEnvTests();
