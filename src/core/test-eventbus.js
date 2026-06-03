import { EventBus, EVT } from './EventBus.js';

console.log('🧪 EventBus 계층 분리 통신 테스트를 시작합니다...\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${name}`);
        passCount++;
    } catch (err) {
        console.error(`❌ FAIL: ${name}`);
        console.error(err);
        failCount++;
    }
}

// ── 테스트 1: 기본 이벤트 발행 및 구독 ──────────────────────
test('EventBus는 이벤트를 등록하고 정상적으로 발행할 수 있어야 합니다.', () => {
    let triggered = false;
    let receivedPayload = null;

    const unsubscribe = EventBus.on('test-event', (payload) => {
        triggered = true;
        receivedPayload = payload;
    });

    EventBus.emit('test-event', { data: 'hello' });

    console.assert(triggered === true, '이벤트 핸들러가 호출되지 않았습니다.');
    console.assert(receivedPayload?.data === 'hello', '페이로드가 정상적으로 전달되지 않았습니다.');
    
    if (!triggered || receivedPayload?.data !== 'hello') {
        throw new Error('기본 이벤트 발행/구독 검증 실패');
    }

    unsubscribe();
});

// ── 테스트 2: 구독 해제(Unsubscribe) 검증 ──────────────────
test('구독 해제 후에는 이벤트를 더 이상 수신하지 않아야 합니다.', () => {
    let callCount = 0;

    const unsubscribe = EventBus.on('test-unsubscribe', () => {
        callCount++;
    });

    EventBus.emit('test-unsubscribe');
    unsubscribe();
    EventBus.emit('test-unsubscribe');

    console.assert(callCount === 1, `콜백이 ${callCount}회 호출되었습니다. (기대치: 1회)`);
    
    if (callCount !== 1) {
        throw new Error('구독 해제 기능 실패');
    }
});

// ── 테스트 3: Mock LogBox 연동 (worker-controller ➔ UI) ─────
test('EventBus.emit(EVT.LOG) 발생 시 Mock UI가 적절한 메서드를 호출하여 수신해야 합니다.', () => {
    const mockLogs = [];
    
    // Mock UI LogBox 구현
    const mockLogBox = {
        log(msg, type = 'normal', tag = '') {
            mockLogs.push({ method: 'log', msg, type, tag });
        },
        warn(msg, tag = '') {
            mockLogs.push({ method: 'warn', msg, tag });
        },
        error(msg, tag = '') {
            mockLogs.push({ method: 'error', msg, tag });
        },
        success(msg, tag = '') {
            mockLogs.push({ method: 'success', msg, tag });
        }
    };

    // UI의 EventBus.on(EVT.LOG) 리스너 셋업
    const unsubscribe = EventBus.on(EVT.LOG, ({ msg, tag, level }) => {
        if (level === 'error') {
            mockLogBox.error(msg, tag);
        } else if (level === 'warn') {
            mockLogBox.warn(msg, tag);
        } else if (level === 'success') {
            mockLogBox.success(msg, tag);
        } else {
            mockLogBox.log(msg, 'normal', tag);
        }
    });

    // 1. info 로그 발행
    EventBus.emit(EVT.LOG, { msg: '다운로드 시작', tag: 'Downloader', level: 'info' });
    // 2. warn 로그 발행
    EventBus.emit(EVT.LOG, { msg: '대기 중 경고', tag: 'System', level: 'warn' });
    // 3. error 로그 발행
    EventBus.emit(EVT.LOG, { msg: '수집 실패', tag: 'Queue', level: 'error' });

    console.assert(mockLogs.length === 3, '로그 개수가 일치하지 않습니다.');
    console.assert(mockLogs[0].method === 'log' && mockLogs[0].tag === 'Downloader', '첫 번째 로그 매핑 실패');
    console.assert(mockLogs[1].method === 'warn' && mockLogs[1].tag === 'System', '두 번째 로그 매핑 실패');
    console.assert(mockLogs[2].method === 'error' && mockLogs[2].tag === 'Queue', '세 번째 로그 매핑 실패');

    if (mockLogs.length !== 3 || mockLogs[0].method !== 'log' || mockLogs[2].method !== 'error') {
        throw new Error('LogBox Mock UI 연동 실패');
    }

    unsubscribe();
});

// ── 테스트 4: Mock Alert 연동 (downloader ➔ UI) ──────────
test('EVT.NOTIFY_ERROR 발생 시 alert 모달이 호출되어야 합니다.', () => {
    let alertCalled = false;
    let alertMsg = '';

    const mockWindow = {
        alert(msg) {
            alertCalled = true;
            alertMsg = msg;
        }
    };

    // UI의 NOTIFY_ERROR 리스너 셋업
    const unsubscribe = EventBus.on(EVT.NOTIFY_ERROR, ({ msg }) => {
        mockWindow.alert(msg);
    });

    // downloader.js 에서 에러 발생 시
    EventBus.emit(EVT.NOTIFY_ERROR, { msg: '지원하지 않는 사이트입니다.' });

    console.assert(alertCalled === true, 'alert가 호출되지 않았습니다.');
    console.assert(alertMsg === '지원하지 않는 사이트입니다.', '경고 메시지가 일치하지 않습니다.');

    if (!alertCalled || alertMsg !== '지원하지 않는 사이트입니다.') {
        throw new Error('Alert Mock UI 연동 실패');
    }

    unsubscribe();
});

// ── 테스트 5: 진행 상황 갱신 신호 연동 ──────────────────────
test('EVT.UPDATE_PROGRESS 수신 시 갱신 메서드가 구동되어야 합니다.', () => {
    let progressUpdated = false;

    const mockUI = {
        updateProgressUI() {
            progressUpdated = true;
        }
    };

    const unsubscribe = EventBus.on(EVT.UPDATE_PROGRESS, () => {
        mockUI.updateProgressUI();
    });

    // worker-controller 에서 진행 갱신 발생 시
    EventBus.emit(EVT.UPDATE_PROGRESS);

    console.assert(progressUpdated === true, '진행 상황 업데이트 핸들러가 기동되지 않았습니다.');

    if (!progressUpdated) {
        throw new Error('Update Progress 신호 연동 실패');
    }

    unsubscribe();
});

console.log(`\n📊 테스트 완료: 성공 ${passCount}건 / 실패 ${failCount}건`);

if (failCount > 0) {
    process.exit(1);
} else {
    console.log('🎉 모든 EventBus 단위 테스트를 무사히 통과했습니다!');
    process.exit(0);
}
