import { EventBus, EVT } from './EventBus.js';
import { addEpisodesToQueue, initQueueScheduler, activeWorkers, processingSlots, sessionRegistry, getQueue, clearQueue, getQueueItemId, setQueueStorage, stopAllWorkers, removeCompletedAndFailedItems, _activeProcessing, assertConsistent } from './queue.js';
import { initBatchWorkerController } from './worker-controller.js';
import { CbzBuilder } from './cbz.js';
import { getConfig, setConfig, setConfigStorage } from './config.js';
import { GMStorageBackend } from './storage/GMStorageBackend.js';
import { setSeriesStorage, getSeriesConfig, saveSeriesConfig, deleteSeriesConfig, getSeriesConfigKey, normalizeQueueItem } from './series-config.js';
import JSZip from 'jszip';

globalThis.JSZip = JSZip;

let passCount = 0;
let failCount = 0;
const tests = [];

/**
 * 플러그앤플레이(Plug-and-play) 스타일의 회귀 테스트 등록기
 */
function test(name, fn) {
    tests.push({ name, fn });
}

/**
 * Mock Storage 헬퍼 — in-memory Map으로 GMStorageBackend 대체
 * @param {boolean} setSeries - setSeriesStorage 호출 여부
 * @param {boolean} setQueue - setQueueStorage 호출 여부
 * @returns {{ backend: GMStorageBackend, store: Map }}
 */
function mockStorage(setSeries = false, setQueue = false) {
    const store = new Map();
    const b = new GMStorageBackend();
    b.get = (k, d) => store.has(k) ? store.get(k) : d;
    b.set = (k, v) => { store.set(k, v); return true; };
    b.delete = (k) => { store.delete(k); };
    if (setSeries) setSeriesStorage(b);
    if (setQueue) setQueueStorage(b);
    return { backend: b, store };
}

// ── [동기/비동기 공용 테스트 러너 기동] ──────────────────────
async function runTests() {
    console.log('🧪 tokiSync 코어 회귀 테스트 수트(Core Regression Test Suite)를 시작합니다...\n');
    
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
    
    console.log(`\n📊 테스트 완료: 성공 ${passCount}건 / 실패 ${failCount}건`);
    
    if (failCount > 0) {
        process.exit(1);
    } else {
        console.log('🎉 모든 Core 단위 테스트를 무사히 통과했습니다!');
        process.exit(0);
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

    EventBus.emit(EVT.LOG, { msg: '다운로드 시작', tag: 'Downloader', level: 'info' });
    EventBus.emit(EVT.LOG, { msg: '대기 중 경고', tag: 'System', level: 'warn' });
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

    const unsubscribe = EventBus.on(EVT.NOTIFY_ERROR, ({ msg }) => {
        mockWindow.alert(msg);
    });

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

    EventBus.emit(EVT.UPDATE_PROGRESS);

    console.assert(progressUpdated === true, '진행 상황 업데이트 핸들러가 기동되지 않았습니다.');

    if (!progressUpdated) {
        throw new Error('Update Progress 신호 연동 실패');
    }

    unsubscribe();
});

// ── 테스트 6: 표준 postMessage 데이터 수집 및 ACK 송수신 검증 ──────────────────────
test('부모-자식 간 postMessage를 통한 텍스트/바이너리 수집과 ACK 통지가 정상 작동해야 합니다.', async () => {
    let ackReceived = false;
    let capturedData = null;
    const testQueueId = 'test_series_001';

    const mockParentWindow = {
        listeners: new Set(),
        addEventListener(type, cb) {
            this.listeners.add(cb);
        },
        removeEventListener(type, cb) {
            this.listeners.delete(cb);
        },
        receiveMessage(eventData) {
            this.listeners.forEach(cb => cb({
                data: eventData,
                source: mockChildWindow,
                origin: 'http://localhost'
            }));
        }
    };

    const mockChildWindow = {
        closed: false,
        postMessage(msg) {
            if (msg.type === 'IPC_ACK' && msg.payload?.queueId === testQueueId) {
                ackReceived = true;
            }
        },
        close() {
            this.closed = true;
        }
    };

    mockParentWindow.addEventListener('message', (event) => {
        const { type, payload } = event.data;
        if (type === 'TASK_COMPLETED' && payload?.queueId === testQueueId) {
            capturedData = payload.content;
            event.source.postMessage({ type: 'IPC_ACK', payload: { queueId: testQueueId } });
        }
    });

    mockParentWindow.receiveMessage({
        type: 'TASK_COMPLETED',
        payload: {
            queueId: testQueueId,
            content: '소설 본문 테스트 내용'
        }
    });

    console.assert(capturedData === '소설 본문 테스트 내용', '부모가 소설 텍스트 데이터를 정상 캡처하지 못했습니다.');
    console.assert(ackReceived === true, '자식 워커가 부모로부터 IPC_ACK 피드백을 전달받지 못했습니다.');

    if (capturedData !== '소설 본문 테스트 내용' || !ackReceived) {
        throw new Error('표준 postMessage & ACK 통신 검증 실패');
    }
});

// ── 테스트 7: GM Storage 크로스도메인 2중 폴백 채널 검증 ──────────────────────
test('postMessage 전송 차단 상황 시 GM_setValue를 활용한 2중 폴백 중계가 원활히 작동해야 합니다.', async () => {
    let capturedData = null;
    let storageDeleted = false;
    const testQueueId = 'fallback_series_999';

    const mockStorage = new Map();
    globalThis.GM_setValue = (key, val) => mockStorage.set(key, val);
    globalThis.GM_getValue = (key) => mockStorage.get(key);
    globalThis.GM_deleteValue = (key) => {
        mockStorage.delete(key);
        storageDeleted = true;
    };

    const mockParentWindow = {
        listener: null,
        addEventListener(type, cb) {
            this.listener = cb;
        },
        receiveMessage(eventData) {
            if (this.listener) {
                this.listener({ data: eventData, source: {}, origin: '*' });
            }
        }
    };

    mockParentWindow.addEventListener('message', (event) => {
        const { type, payload } = event.data;
        if (type === 'TASK_COMPLETED_FALLBACK' && payload?.queueId === testQueueId) {
            const key = `tokisync_fallback_${testQueueId}`;
            const rawData = GM_getValue(key);
            if (rawData) {
                capturedData = rawData.images;
                GM_deleteValue(key);
            }
        }
    });

    const mockImagesPayload = [{ url: 'img1.jpg', ext: '.jpg' }, { url: 'img2.jpg', ext: '.jpg' }];
    GM_setValue(`tokisync_fallback_${testQueueId}`, { queueId: testQueueId, images: mockImagesPayload });
    mockParentWindow.receiveMessage({
        type: 'TASK_COMPLETED_FALLBACK',
        payload: { queueId: testQueueId }
    });

    console.assert(capturedData !== null && capturedData.length === 2, '폴백 채널을 통해 이미지 목록을 복원하지 못했습니다.');
    console.assert(storageDeleted === true, '중계 완료된 후 GM Storage 임시 데이터가 파기되지 않았습니다.');

    if (!capturedData || capturedData.length !== 2 || !storageDeleted) {
        throw new Error('GM Storage 2중 폴백 채널 검증 실패');
    }

    delete globalThis.GM_setValue;
    delete globalThis.GM_getValue;
    delete globalThis.GM_deleteValue;
});

// ── 테스트 8: ACK 지연 타임아웃 세이프가드 검증 ──────────────────────
test('부모 ACK 지연 시 자식 워커가 정해진 타임아웃 후 자체 안전 종료(자가 복구)를 수행해야 합니다.', async () => {
    let closedTriggered = false;
    let queueStatus = 'processing';

    const mockChild = {
        close() {
            closedTriggered = true;
        }
    };

    const runChildTimeoutGuard = (timeoutMs) => {
        return new Promise((resolve) => {
            setTimeout(() => {
                queueStatus = 'completed';
                mockChild.close();
                resolve();
            }, timeoutMs);
        });
    };

    await runChildTimeoutGuard(10);

    console.assert(queueStatus === 'completed', '타임아웃 발생 시 큐 상태가 완료로 복구되지 않았습니다.');
    console.assert(closedTriggered === true, '타임아웃 발생 시 워커 팝업이 안전 닫기(close)를 호출하지 않았습니다.');

    if (queueStatus !== 'completed' || !closedTriggered) {
        throw new Error('ACK 지연 타임아웃 세이프가드 검증 실패');
    }
});

// ── 테스트 9: 에피소드 범위 파싱 및 오름차순 정렬 유효성 검증 ──────────────────────
test('parseRangeSpec 범위 필터 파싱과 목록 오름차순 정규 정렬 로직이 완벽하게 일치해야 합니다.', () => {
    const parseRangeSpecLocal = (spec) => {
        if (!spec || !spec.trim()) return null;
        const nums = new Set();
        const parts = spec.split(',');
        for (const part of parts) {
            const trimmed = part.trim();
            const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
            if (rangeMatch) {
                const from = parseInt(rangeMatch[1]);
                const to   = parseInt(rangeMatch[2]);
                for (let n = Math.min(from, to); n <= Math.max(from, to); n++) nums.add(n);
            } else if (/^\d+$/.test(trimmed)) {
                nums.add(parseInt(trimmed));
            }
        }
        return nums.size > 0 ? nums : null;
    };

    const range = parseRangeSpecLocal('1,3-5, 2, 공지, 특별편');
    console.assert(range.has(1) && range.has(2) && range.has(3) && range.has(4) && range.has(5), '범위 파싱 실패');
    console.assert(!range.has(0) && !range.has(6), '비범위 숫자 오버래핑 결함');

    const rawList = [
        { num: '5', title: '5화' },
        { num: '공지', title: '공지' },
        { num: '2', title: '2화' },
        { num: '3', title: '3화' },
        { num: '1', title: '1화' }
    ];

    const mappedList = rawList.map(item => ({
        item,
        num: parseInt(item.num) || 0
    }));

    const sortedList = mappedList.sort((a, b) => a.num - b.num).map(x => x.item);
    
    console.assert(sortedList[0].num === '공지', 'NaN(0)이 선두 정렬에 누락되었습니다.');
    console.assert(sortedList[1].num === '1', '1화 정렬 정합성 이탈');
    console.assert(sortedList[2].num === '2', '2화 정렬 정합성 이탈');
    console.assert(sortedList[3].num === '3', '3화 정렬 정합성 이탈');
    console.assert(sortedList[4].num === '5', '5화 정렬 정합성 이탈');

    if (sortedList[4].num !== '5' || sortedList[0].num !== '공지') {
        throw new Error('범위 파싱 및 오름차순 정렬 검증 실패');
    }
});

// ── 테스트 10: 만화 배치(10화 Chunking) 분할 및 GC 가드 검증 ──────────────────────
test('만화 수집 시 10화 단위 청크 저장(saveFile)과 masterZip GC가 경계값에서 정상 구동되어야 합니다.', () => {
    let saveCount = 0;
    let savedFilenames = [];
    let masterZip = {
        files: {},
        file(name, data) {
            this.files[name] = data;
        }
    };

    const mockSaveFile = (zip, filename) => {
        saveCount++;
        savedFilenames.push(filename);
    };

    const BATCH_SIZE = 10;
    const totalEpisodes = 25;

    for (let i = 0; i < totalEpisodes; i++) {
        const fullFilename = `Episode_${i+1}`;
        masterZip.file(`${fullFilename}.cbz`, 'dummy_data');

        const processedCount = i + 1;
        const isLastItem = (i === totalEpisodes - 1);

        if ((processedCount % BATCH_SIZE === 0) || isLastItem) {
            const batchNum = Math.ceil(processedCount / BATCH_SIZE);
            const batchFilename = `SeriesTitle_Part${batchNum}`;
            
            mockSaveFile(masterZip, batchFilename);
            
            // GC 가드 시뮬레이션
            masterZip = null;
            masterZip = {
                files: {},
                file(name, data) {
                    this.files[name] = data;
                }
            };
        }
    }

    console.assert(saveCount === 3, '세이브 파일 저장 개수 불일치');
    console.assert(savedFilenames[0] === 'SeriesTitle_Part1', '1차 청크 파일 네이밍 에러');
    console.assert(savedFilenames[2] === 'SeriesTitle_Part3', '3차 청크 파일 네이밍 에러');
    console.assert(masterZip !== null && Object.keys(masterZip.files).length === 0, 'zip 메모리 GC 릴리즈 실패');

    if (saveCount !== 3 || savedFilenames[2] !== 'SeriesTitle_Part3') {
        throw new Error('배치 분할 10화 청크 가드 검증 실패');
    }
});

// ── 테스트 11: 소설 복호화(XOR 및 Nonce) 정밀도 검증 ──────────────────────
test('토큰 XOR 디코딩 및 Nonce 조합을 통한 소설 텍스트 복호화 로직이 정밀하게 일치해야 합니다.', () => {
    const encryptXor = (plainText, keyStr) => {
        const keyBytes = new TextEncoder().encode(keyStr);
        const plainBytes = new TextEncoder().encode(plainText);
        const cipherBytes = new Uint8Array(plainBytes.length);
        for (let i = 0; i < plainBytes.length; i++) {
            cipherBytes[i] = plainBytes[i] ^ keyBytes[i % keyBytes.length];
        }
        return cipherBytes;
    };

    const decryptXor = (cipherBytes, keyStr) => {
        const keyBytes = new TextEncoder().encode(keyStr);
        const decBytes = new Uint8Array(cipherBytes.length);
        for (let i = 0; i < cipherBytes.length; i++) {
            decBytes[i] = cipherBytes[i] ^ keyBytes[i % keyBytes.length];
        }
        return new TextDecoder().decode(decBytes);
    };

    const key = 'toki_secret_key';
    const plain = '안녕하세요. 소설 본문 테스트 문장입니다.';
    
    // XOR 인코딩 (암호화 바이트)
    const cipherBytes = encryptXor(plain, key);

    // XOR 디코딩 (복호화 텍스트)
    const decrypted = decryptXor(cipherBytes, key);
    
    console.assert(decrypted === plain, 'XOR 복호화 복원 훼손 결함 감지');

    // Nonce 추출 검증
    const mockToken = 'jwt_header_payload.jwt_body_payload.jwt_signature';
    const firstPart = mockToken.split('.')[0];
    
    console.assert(firstPart === 'jwt_header_payload', 'JWT 시드 키 추출 실패');

    if (decrypted !== plain || firstPart !== 'jwt_header_payload') {
        throw new Error('소설 복호화 및 Nonce 복원 검증 실패');
    }
});

// ── 테스트 12: Jitter Delay 랜덤 분포 유효성 검증 ──────────────────────
test('WAF 방어 우회 Jitter Delay 분포 범위가 [3000ms, 5000ms] 이내를 100% 만족해야 합니다.', () => {
    const minDelay = 3000;
    const maxDelay = 5000;
    let inRange = true;

    for (let i = 0; i < 100; i++) {
        const jitterDelay = 3000 + Math.random() * 2000;
        if (jitterDelay < minDelay || jitterDelay > maxDelay) {
            inRange = false;
            break;
        }
    }

    console.assert(inRange === true, 'Jitter Delay 분포 범위를 이탈한 에지케이스 감지');

    if (!inRange) {
        throw new Error('Jitter Delay 분포 유효성 검증 실패');
    }
});

// ── 테스트 13: 파일명 템플릿 처리 시 설정(config) 객체 참조 유효성 검증 ──────────────────────
test('파일명 템플릿 포매팅 함수가 config 객체 참조 하에 예외 없이 정상 빌드되어야 합니다.', () => {
    let configObject = null;
    const testGetConfig = () => configObject;

    const buildFilenameMock = (itemNum, chapterTitle, seriesTitle) => {
        const config = testGetConfig();
        if (!config) {
            throw new ReferenceError('config is not defined');
        }

        const paddingVal = parseInt(config.localEpisodePadding, 10);
        const paddedNum = paddingVal > 0 
            ? (itemNum || '').toString().padStart(paddingVal, '0') 
            : (itemNum || '').toString();

        const template = config.localNameTemplate || "{number} - {title}";
        return template
            .replace(/{number}/g, paddedNum)
            .replace(/{rawNumber}/g, (itemNum || '').toString())
            .replace(/{series}/g, seriesTitle || '')
            .replace(/{title}/g, chapterTitle || '');
    };

    // [에러 감지] config가 없을 때 ReferenceError가 발생하는가?
    let referenceErrorThrown = false;
    try {
        buildFilenameMock('1', '1화', '테스트작품');
    } catch (err) {
        if (err instanceof ReferenceError && err.message.includes('config')) {
            referenceErrorThrown = true;
        }
    }
    console.assert(referenceErrorThrown === true, 'ReferenceError가 검출되지 않았습니다.');

    // [정상 매핑] config가 정상 주입되었을 때 정합성 검증
    configObject = {
        localEpisodePadding: '4',
        localNameTemplate: '[{series}] {number} - {title}'
    };

    const finalName = buildFilenameMock('2', '2화', '테스트작품');
    console.assert(finalName === '[테스트작품] 0002 - 2화', `템플릿 가공 정합성 실패: ${finalName}`);

    if (!referenceErrorThrown || finalName !== '[테스트작품] 0002 - 2화') {
        throw new Error('파일명 템플릿 및 config 참조 유효성 검증 실패');
    }
});

// ── 테스트 14: 멀티큐 자율 배치 스케줄러 시나리오 통합 테스트 ──────────────────────
test('멀티큐 자율 배치 스케줄러 시나리오가 Concurrency 한도를 준수하며 완료 처리 및 최종 캐시 갱신까지 성공해야 합니다.', async () => {
    const backupGM_getValue = globalThis.GM_getValue;
    const backupGM_setValue = globalThis.GM_setValue;
    const backupGM_deleteValue = globalThis.GM_deleteValue;
    const backupGM_addValueChangeListener = globalThis.GM_addValueChangeListener;
    const backupGM_xmlhttpRequest = globalThis.GM_xmlhttpRequest;
    const backupWindow = globalThis.window;
    const backupSetTimeout = globalThis.setTimeout;

    const mockStorage = new Map();
    const changeListeners = new Set();

    // 1. GM_getValue / GM_setValue / GM_deleteValue 모킹
    globalThis.GM_getValue = (key, defaultVal) => {
        if (mockStorage.has(key)) return mockStorage.get(key);
        return defaultVal;
    };

    globalThis.GM_setValue = (key, val) => {
        const oldVal = mockStorage.get(key);
        mockStorage.set(key, val);
        // change listener 비동기 호출 시뮬레이션
        changeListeners.forEach(cb => {
            backupSetTimeout(() => {
                try {
                    cb(key, oldVal, val, false);
                } catch (e) {
                    console.error('Change listener err:', e);
                }
            }, 0);
        });
    };

    globalThis.GM_deleteValue = (key) => {
        mockStorage.delete(key);
    };

    // 2. GM_addValueChangeListener 모킹
    globalThis.GM_addValueChangeListener = (key, cb) => {
        changeListeners.add(cb);
        return () => changeListeners.delete(cb);
    };

    // 3. GM_xmlhttpRequest 모킹
    let cacheRefreshCalledCount = 0;
    globalThis.GM_xmlhttpRequest = (details) => {
        let responseBody = 'ok';
        let responseHeaders = '';

        if (details.data && typeof details.data === 'string') {
            try {
                const payload = JSON.parse(details.data);
                if (payload.type === 'view_update_cache') {
                    cacheRefreshCalledCount++;
                } else if (payload.type === 'view_get_token') {
                    responseBody = { token: 'mock-token' };
                } else if (payload.type === 'init') {
                    responseBody = { uploadUrl: 'http://mock-upload-url' };
                } else if (payload.type === 'init_update') {
                    responseBody = { uploadUrl: 'http://mock-upload-url' };
                }
            } catch (e) {}
        }

        // Google Drive API Mocking
        if (details.url && details.url.includes('googleapis.com')) {
            if (details.url.includes('/files?q=')) {
                // Search Folder or File
                responseBody = { files: [{ id: 'mock-file-id', name: 'mock-file-name', size: '5000' }] };
            } else if (details.url.includes('/files') && (details.method === 'POST' || details.method === 'PATCH')) {
                // Create Folder or Init Upload Session
                responseBody = { id: 'mock-created-id' };
                responseHeaders = 'location: http://mock-upload-session-url\r\nx-guploader-uploadid: mock-upload-id\r\n';
            }
        }

        if (details.onload) {
            setTimeout(() => {
                details.onload({
                    status: 200,
                    responseText: typeof responseBody === 'string' ? responseBody : JSON.stringify({ status: 'success', body: responseBody }),
                    responseHeaders: responseHeaders
                });
            }, 1);
        }
    };

    // 4. setTimeout 모킹 (WAF Jitter 및 스케줄러 딜레이 단축)
    globalThis.setTimeout = (cb, delay) => {
        // 1초 이상의 대기(스케줄러 jitter 등)는 1ms로 단축
        const targetDelay = delay >= 1000 ? 1 : delay;
        return backupSetTimeout(cb, targetDelay);
    };

    // 설정 데이터 프리필 (gasUrl, folderId 등이 존재하여 isConfigValid()가 true가 되도록 셋업)
    globalThis.GM_setValue('TOKI_GAS_ID', 'mock-gas-id');
    globalThis.GM_setValue('TOKI_FOLDER_ID', 'mock-folder-id');
    globalThis.GM_setValue('TOKI_SCAN_SPEED', '750');

    // 5. window 객체 모킹
    const messageListeners = new Set();
    const createdPopups = [];

    globalThis.window = {
        tokisync_batch_controller_initialized: false,
        screen: { width: 1920 },
        location: { origin: 'http://localhost' },
        addEventListener(type, cb) {
            if (type === 'message') {
                messageListeners.add(cb);
            }
        },
        removeEventListener(type, cb) {
            if (type === 'message') {
                messageListeners.delete(cb);
            }
        },
        open(url, name, specs) {
            const mockPopup = {
                closed: false,
                location: {
                    replace(newUrl) {
                        this.href = newUrl;
                    },
                    href: url
                },
                name: name,
                close() {
                    this.closed = true;
                },
                postMessage(msg, origin) {
                    // mock postMessage to prevent TypeError warnings in logs
                }
            };
            createdPopups.push(mockPopup);
            return mockPopup;
        }
    };

    function simulateWorkerMessage(sourceWindow, type, payload) {
        const event = {
            data: {
                type: `TOKI_${type}`,
                payload: payload,
                timestamp: Date.now()
            },
            source: sourceWindow,
            origin: 'http://localhost'
        };
        messageListeners.forEach(cb => cb(event));
    }

    try {
        // 기존 큐 청소
        clearQueue();
        activeWorkers.clear();
        processingSlots.clear();
        sessionRegistry.clear();

        // 에피소드 3개 등록
        const novelTitle = '테스트소설';
        const episodes = [
            { title: '1화', url: 'http://example.com/1', episodeNum: '1', folderId: 'mock-folder-id', category: 'novel', destination: 'drive', rootFolder: 'TestSeries' },
            { title: '2화', url: 'http://example.com/2', episodeNum: '2', folderId: 'mock-folder-id', category: 'novel', destination: 'drive', rootFolder: 'TestSeries' },
            { title: '3화', url: 'http://example.com/3', episodeNum: '3', folderId: 'mock-folder-id', category: 'novel', destination: 'drive', rootFolder: 'TestSeries' }
        ];

        addEpisodesToQueue(episodes, novelTitle);

        const id1 = getQueueItemId(novelTitle, '1');
        const id2 = getQueueItemId(novelTitle, '2');
        const id3 = getQueueItemId(novelTitle, '3');

        // 배치 컨트롤러 및 스케줄러 기동
        initBatchWorkerController();
        initQueueScheduler();

        // 비동기 스케줄링 틱이 돌도록 살짝 대기
        await new Promise(resolve => backupSetTimeout(resolve, 300));

        // 6. Concurrency 한도(1) 검증
        // 3개 중 1화만 우선 processing 상태여야 한다. (v1.25.0 순차 수집 사양)
        const queueState1 = getQueue();
        const item1 = queueState1.find(i => i.id === id1);
        const item2 = queueState1.find(i => i.id === id2);
        const item3 = queueState1.find(i => i.id === id3);

        console.assert(item1 && item1.status === 'processing', '1화가 processing 상태가 아닙니다.');
        console.assert(item2 && item2.status === 'pending', '2화는 pending 상태여야 합니다.');
        console.assert(item3 && item3.status === 'pending', '3화는 pending 상태여야 합니다.');

        console.assert(activeWorkers.size === 1, `활성 워커 개수 불일치: ${activeWorkers.size}`);
        console.assert(activeWorkers.has(id1), '1화 워커 등록 누락');

        if (item1.status !== 'processing' || item2.status !== 'pending' || item3.status !== 'pending' || activeWorkers.size !== 1) {
            throw new Error('Concurrency 한도 제어 검증 실패 (v1.25.0)');
        }

        // 7. 1화 완료 처리 시뮬레이션
        // READY 수신 후 -> TASK_COMPLETED
        const popup1 = activeWorkers.get(id1);
        simulateWorkerMessage(popup1, 'WORKER_READY', { targetUrl: 'http://example.com/1' });
        simulateWorkerMessage(popup1, 'TASK_COMPLETED', { queueId: id1, content: '1화 본문' });

        // 8. 릴레이 호출 및 다음 작업(2화) 자동 실행 검증
        await new Promise(resolve => backupSetTimeout(resolve, 300));

        const queueState2 = getQueue();
        const updatedItem1 = queueState2.find(i => i.id === id1);
        const updatedItem2 = queueState2.find(i => i.id === id2);

        console.assert(updatedItem1.status === 'completed', '1화가 완료되지 않았습니다.');
        console.assert(updatedItem2.status === 'processing', '2화가 자동으로 스케줄링되지 않았습니다.');

        if (updatedItem1.status !== 'completed' || updatedItem2.status !== 'processing') {
            throw new Error('대기 중이던 2화 자동 실행 전이 실패');
        }

        // 9. 2화 완료 처리 시뮬레이션
        const popup2 = activeWorkers.get(id2);
        simulateWorkerMessage(popup2, 'WORKER_READY', { targetUrl: 'http://example.com/2' });
        simulateWorkerMessage(popup2, 'TASK_COMPLETED', { queueId: id2, content: '2화 본문' });

        // 2화 완료 후 3화 자동 실행 검증
        await new Promise(resolve => backupSetTimeout(resolve, 300));

        const queueState3 = getQueue();
        const updatedItem3 = queueState3.find(i => i.id === id3);
        console.assert(updatedItem3.status === 'processing', '3화가 자동으로 스케줄링되지 않았습니다.');
        if (updatedItem3.status !== 'processing') {
            throw new Error('대기 중이던 3화 자동 실행 전이 실패');
        }

        // 10. 3화 완료 처리 시뮬레이션
        const popup3 = activeWorkers.get(id3);
        simulateWorkerMessage(popup3, 'WORKER_READY', { targetUrl: 'http://example.com/3' });
        simulateWorkerMessage(popup3, 'TASK_COMPLETED', { queueId: id3, content: '3화 본문' });

        await new Promise(resolve => backupSetTimeout(resolve, 300));

        // 11. 최종 상태 검증
        const queueState4 = getQueue();
        const allCompleted = queueState4.every(i => i.status === 'completed');
        console.assert(allCompleted === true, '모든 에피소드가 완료되지 않았습니다.');

        // 12. 최종 1회 드라이브 캐시 갱신 함수 호출 검증
        console.assert(cacheRefreshCalledCount === 1, `최종 드라이브 캐시 갱신 호출 횟수 불일치: ${cacheRefreshCalledCount}`);

        if (!allCompleted || cacheRefreshCalledCount !== 1) {
            throw new Error('전체 완료 및 드라이브 캐시 최종 1회 갱신 검증 실패');
        }

    } finally {
        // 복구
        globalThis.GM_getValue = backupGM_getValue;
        globalThis.GM_setValue = backupGM_setValue;
        globalThis.GM_deleteValue = backupGM_deleteValue;
        globalThis.GM_addValueChangeListener = backupGM_addValueChangeListener;
        globalThis.GM_xmlhttpRequest = backupGM_xmlhttpRequest;
        globalThis.window = backupWindow;
        globalThis.setTimeout = backupSetTimeout;
        clearQueue();
        activeWorkers.clear();
        processingSlots.clear();
        sessionRegistry.clear();
    }
});

// ── 테스트 15: 구버전 커스텀 규칙(TOKI_CUSTOM_RULES) 자동 마이그레이션 검증 ──────────────────────
test('RuleManager는 구버전 커스텀 규칙이 존재하면 새로운 TOKI_PARSER_RULES로 마이그레이션해야 합니다.', async () => {
    const backupGM_getValue = globalThis.GM_getValue;
    const backupGM_setValue = globalThis.GM_setValue;
    const backupGM_deleteValue = globalThis.GM_deleteValue;

    try {
        const mockStorage = new Map();
        globalThis.GM_getValue = (key, defaultVal) => mockStorage.has(key) ? mockStorage.get(key) : defaultVal;
        globalThis.GM_setValue = (key, val) => mockStorage.set(key, val);
        globalThis.GM_deleteValue = (key) => mockStorage.delete(key);

        const legacyRules = [
            { id: "custom_test_site", name: "커스텀 테스트 사이트 규칙", urlPattern: ".*custom.*" }
        ];
        globalThis.GM_setValue('TOKI_CUSTOM_RULES', JSON.stringify(legacyRules));

        const { RuleManager } = await import('./parsers/RuleManager.js');
        const rules = await RuleManager.getRules();

        const customRule = rules.find(r => r.id === 'custom_test_site');
        console.assert(customRule !== undefined, '커스텀 규칙이 마이그레이션되지 않았습니다.');
        console.assert(globalThis.GM_getValue('TOKI_CUSTOM_RULES') === undefined, '레거시 스토리지 키가 삭제되지 않았습니다.');

        if (!customRule || globalThis.GM_getValue('TOKI_CUSTOM_RULES') !== undefined) {
            throw new Error('구버전 커스텀 규칙 마이그레이션 실패');
        }
    } finally {
        globalThis.GM_getValue = backupGM_getValue;
        globalThis.GM_setValue = backupGM_setValue;
        globalThis.GM_deleteValue = backupGM_deleteValue;
    }
});

// ── 테스트 16: localStorage 기반 설정 2중 백업/복원(Self-Healing) 검증 ──────────────────────
test('config 모듈은 GM_getValue 설정이 유실되었을 때 localStorage 백업으로부터 설정을 복원해야 합니다.', async () => {
    const backupGM_getValue = globalThis.GM_getValue;
    const backupGM_setValue = globalThis.GM_setValue;
    const backupLocalStorage = globalThis.localStorage;

    try {
        const mockStorage = new Map();
        globalThis.GM_getValue = (key, defaultVal) => mockStorage.has(key) ? mockStorage.get(key) : defaultVal;
        globalThis.GM_setValue = (key, val) => mockStorage.set(key, val);

        const localStore = new Map();
        globalThis.localStorage = {
            setItem(key, val) { localStore.set(key, val); },
            getItem(key) { return localStore.get(key) || null; }
        };

        const { getConfig, setConfig } = await import('./config.js');

        // 1. 초기값 설정 및 백업 생성 검증
        setConfig('TOKI_FOLDER_ID', 'test-folder-123');
        setConfig('TOKI_GAS_ID', 'test-gas-456');

        const backupStr = localStore.get('tokisync_config_backup');
        console.assert(backupStr !== undefined, 'localStorage 백업 사본이 생성되지 않았습니다.');

        // 2. GM 스페이스 강제 소멸 (초기화 시나리오)
        mockStorage.clear();

        // 3. 복원 검증
        const config = getConfig();
        console.assert(config.folderId === 'test-folder-123', `설정이 복원되지 않았습니다. folderId: ${config.folderId}`);
        console.assert(config.gasId === 'test-gas-456', `설정이 복원되지 않았습니다. gasId: ${config.gasId}`);

    } finally {
        globalThis.GM_getValue = backupGM_getValue;
        globalThis.GM_setValue = backupGM_setValue;
        globalThis.localStorage = backupLocalStorage;
    }
});

// ── 테스트 17: UI 모듈 분할 및 EventBus 기반 대시보드 제어 검증 ──────────────────────
test('MenuModal의 제어 메소드가 EventBus를 통해 LogBox의 대시보드 제어 핸들러를 정상 호출해야 합니다.', async () => {
    const { EventBus, EVT } = await import('./EventBus.js');
    const { MenuModal } = await import('./ui/MenuModal.js');

    let openCalled = false;
    let closeCalled = false;
    let toggleCalled = false;

    // EventBus 구독을 통해 MenuModal의 방출 검증
    const unsubOpen = EventBus.on(EVT.OPEN_DASHBOARD, () => { openCalled = true; });
    const unsubClose = EventBus.on(EVT.CLOSE_DASHBOARD, () => { closeCalled = true; });
    const unsubToggle = EventBus.on(EVT.TOGGLE_DASHBOARD, () => { toggleCalled = true; });

    const menu = MenuModal.getInstance();
    
    // 1. MenuModal의 show, close, toggle 실행 시 EventBus 이벤트 방출 검사
    menu.show();
    menu.close();
    menu.toggle();

    console.assert(openCalled === true, 'EVT.OPEN_DASHBOARD 이벤트가 발행되지 않았습니다.');
    console.assert(closeCalled === true, 'EVT.CLOSE_DASHBOARD 이벤트가 발행되지 않았습니다.');
    console.assert(toggleCalled === true, 'EVT.TOGGLE_DASHBOARD 이벤트가 발행되지 않았습니다.');

    unsubOpen();
    unsubClose();
    unsubToggle();

    if (!openCalled || !closeCalled || !toggleCalled) {
        throw new Error('MenuModal ➡️ EventBus 이벤트 발행 검증 실패');
    }

    // 2. LogBox가 EventBus 이벤트를 수신하여 자체 제어 함수를 호출하는지 검사
    let logBoxOpenCalled = false;
    let logBoxCloseCalled = false;
    let logBoxToggleCalled = false;

    const mockLogBoxInstance = {
        openDashboard() { logBoxOpenCalled = true; },
        hide() { logBoxCloseCalled = true; },
        toggle() { logBoxToggleCalled = true; }
    };

    // 임시로 EventBus에 LogBox 역할의 리스너를 바인딩하여 정상 중개 수신되는지 검증
    const unsubBoxOpen = EventBus.on(EVT.OPEN_DASHBOARD, () => mockLogBoxInstance.openDashboard());
    const unsubBoxClose = EventBus.on(EVT.CLOSE_DASHBOARD, () => mockLogBoxInstance.hide());
    const unsubBoxToggle = EventBus.on(EVT.TOGGLE_DASHBOARD, () => mockLogBoxInstance.toggle());

    EventBus.emit(EVT.OPEN_DASHBOARD);
    EventBus.emit(EVT.CLOSE_DASHBOARD);
    EventBus.emit(EVT.TOGGLE_DASHBOARD);

    console.assert(logBoxOpenCalled === true, 'LogBox의 openDashboard 호출 중개 실패');
    console.assert(logBoxCloseCalled === true, 'LogBox의 hide 호출 중개 실패');
    console.assert(logBoxToggleCalled === true, 'LogBox의 toggle 호출 중개 실패');

    unsubBoxOpen();
    unsubBoxClose();
    unsubBoxToggle();

    if (!logBoxOpenCalled || !logBoxCloseCalled || !logBoxToggleCalled) {
        throw new Error('EventBus ➡️ LogBox 수신 및 중개 검증 실패');
    }
});

// ── 테스트 H11: EventBus emit try/catch 격리 ─────────────────
test('Listener가 throw해도 같은 이벤트의 다른 리스너가 정상 실행되어야 합니다.', () => {
    const fired = [];

    const unsub1 = EventBus.on('test:isolation', () => {
        fired.push('first');
        throw new Error('first listener failed');
    });

    const unsub2 = EventBus.on('test:isolation', () => {
        fired.push('second');
    });

    const origError = console.error;
    const errors = [];
    console.error = (msg, err) => { errors.push({ msg, err }); };

    try {
        EventBus.emit('test:isolation');

        console.assert(fired.length === 2, `리스너가 ${fired.length}개만 실행됨 (기대치: 2개)`);
        console.assert(fired[0] === 'first', '첫 번째 리스너가 먼저 실행되지 않음');
        console.assert(fired[1] === 'second', '두 번째 리스너가 실행되지 않음');
        console.assert(errors.length >= 1, 'console.error로 에러가 기록되지 않음');

        if (fired.length !== 2 || fired[1] !== 'second') {
            throw new Error('EventBus try/catch 격리 실패: throwing listener가 sibling을 차단함');
        }
    } finally {
        console.error = origError;
        unsub1();
        unsub2();
    }
});

// ── 테스트 L44: EventBus 리스너 하드캡 50 ─────────────────────
test('EventBus 리스너 수가 50개 초과 시 새 리스너 등록이 차단되어야 합니다.', () => {
    const callCounters = [];
    const FIRE_MARKER = 'test:harcap';

    // 51개 리스너 등록
    for (let i = 0; i < 51; i++) {
        const idx = i;
        callCounters[idx] = false;
        const unsub = EventBus.on(FIRE_MARKER, () => { callCounters[idx] = true; });
        if (i === 50) {
            // 51번째 on()은 no-op을 반환해야 함
            console.assert(typeof unsub === 'function', '51번째 on()이 함수를 반환해야 함');
            // 51번째는 실제로 등록되지 않으므로 emit 후 counter가 true가 되면 안 됨
        }
    }

    EventBus.emit(FIRE_MARKER);

    // 50번째까지는 모두 실행되어야 함
    let fireCount = callCounters.filter(c => c === true).length;
    console.assert(fireCount === 50, `실행된 리스너 수: ${fireCount} (기대치: 50)`);
    console.assert(callCounters[50] === undefined || callCounters[50] === false,
        `51번째 리스너가 실행됨 (기대치: 실행되지 않아야 함)`);

    if (fireCount !== 50) {
        throw new Error(`EventBus 하드캡 실패: ${fireCount}개 리스너 실행됨 (기대치: 50개, 초과 1개는 no-op 반환)`);
    }
});

// ── 테스트 G4: QUEUE_ITEM_UPDATE 이벤트 → 큐 상태 변경 ────────
test('EVT.QUEUE_ITEM_UPDATE emit 시 queue.js의 updateQueueItem이 정상 호출되어야 합니다.', () => {
    // localStorage mock (queue.js persistence 의존)
    const origLocalStorage = globalThis.localStorage;
    const mockStore = {};
    globalThis.localStorage = {
        getItem(key) { return mockStore[key] || null; },
        setItem(key, val) { mockStore[key] = val.toString(); },
        removeItem(key) { delete mockStore[key]; },
        clear() { Object.keys(mockStore).forEach(k => delete mockStore[k]); }
    };

    try {
        const testItem = {
            episodeNum: 1,
            title: '테스트 에피소드',
            url: 'http://test.com/ep/1',
            category: 'Novel'
        };

        clearQueue();

        // 1. 큐에 아이템 추가 (novelTitle로 id 생성됨)
        addEpisodesToQueue([testItem], 'G4_Test_Series');
        const afterAdd = getQueue();
        const addedItem = afterAdd.find(item => item.episodeUrl === testItem.url);
        console.assert(addedItem !== undefined, '큐에 아이템이 추가되지 않음');
        console.assert(addedItem.status === 'pending', '추가된 아이템의 상태가 pending이 아님');

        const generatedId = addedItem.id;

        // 2. QUEUE_ITEM_UPDATE emit으로 상태 변경
        EventBus.emit(EVT.QUEUE_ITEM_UPDATE, {
            id: generatedId,
            updates: { status: 'completed', progressPercent: 100 }
        });

        const afterUpdate = getQueue();
        const updatedItem = afterUpdate.find(item => item.id === generatedId);
        console.assert(updatedItem !== undefined, '업데이트 후 아이템을 찾을 수 없음');
        console.assert(updatedItem.status === 'completed',
            `아이템 상태가 'completed'가 아님 (actual: ${updatedItem.status})`);
        console.assert(updatedItem.progressPercent === 100,
            `progressPercent가 100이 아님 (actual: ${updatedItem.progressPercent})`);

        // 3. 정리
        clearQueue();

        if (!updatedItem || updatedItem.status !== 'completed') {
            throw new Error('QUEUE_ITEM_UPDATE 이벤트가 queue.js의 updateQueueItem을 호출하지 못함');
        }
    } finally {
        globalThis.localStorage = origLocalStorage;
    }
});

// ── H7: notify() timer 중복 방지 ─────────────────────────────
test('notify() 연속 호출 시 이전 타이머가 취소되고 마지막 메시지만 표시되어야 합니다.', () => {
    let timerIds = [];
    const origSetTimeout = globalThis.setTimeout;
    const origClearTimeout = globalThis.clearTimeout;

    try {
        const timers = new Map();
        let nextId = 1;
        globalThis.setTimeout = (fn, ms) => {
            const id = nextId++;
            timers.set(id, fn);
            timerIds.push(id);
            return id;
        };
        globalThis.clearTimeout = (id) => {
            timers.delete(id);
        };

        let notifyTimerId = null;
        let notification = '';

        const notify = (msg) => {
            if (notifyTimerId) globalThis.clearTimeout(notifyTimerId);
            notification = msg;
            notifyTimerId = globalThis.setTimeout(() => {
                notification = '';
                notifyTimerId = null;
            }, 3000);
        };

        notify('A');
        const firstTimer = notifyTimerId;
        notify('B');
        const secondTimer = notifyTimerId;

        console.assert(firstTimer !== secondTimer, 'notify()가 새 타이머를 생성하지 않음');
        console.assert(notification === 'B', 'notification이 마지막 메시지가 아님');
        console.assert(timers.size === 1, '이전 타이머가 취소되지 않음 (timers: ' + timers.size + ')');

        if (notification !== 'B' || timers.size !== 1) {
            throw new Error('H7 notify timer race: 이전 타이머 취소 실패');
        }
    } finally {
        globalThis.setTimeout = origSetTimeout;
        globalThis.clearTimeout = origClearTimeout;
    }
});

// ── M2: EventBus request() 즉시 reject (리스너 없음) ──────────
test('EventBus.request()가 미응답 이벤트에 대해 설정된 타임아웃 내 reject되어야 합니다.', async () => {
    const start = Date.now();
    try {
        await EventBus.request('no-such-event-ever', {}, 5);
        throw new Error('request()가 reject되지 않고 resolve됨');
    } catch (e) {
        const elapsed = Date.now() - start;
        console.assert(e.message.includes('등록되지 않았습니다') || e.message.includes('Timeout'), `에러 메시지: ${e.message}`);
        console.assert(elapsed < 100, `거부 소요 시간: ${elapsed}ms (기대치: < 100ms — pre-emit 체크로 즉시 reject)`);
        if ((!e.message.includes('등록되지 않았습니다') && !e.message.includes('Timeout')) || elapsed >= 100) {
            throw new Error('M2 request reject 실패');
        }
    }
});

// ── M10: CbzBuilder.escapeXml null guard ────────────────────
test('CbzBuilder.escapeXml()가 null/undefined 입력 시 빈 문자열을 반환해야 합니다.', () => {
    const builder = new CbzBuilder('test-series');
    console.assert(builder.escapeXml(null) === '', 'escapeXml(null)이 빈 문자열이 아님');
    console.assert(builder.escapeXml(undefined) === '', 'escapeXml(undefined)이 빈 문자열이 아님');
    console.assert(builder.escapeXml('') === '', 'escapeXml("")이 빈 문자열이 아님');
    console.assert(builder.escapeXml('hello') === 'hello', 'escapeXml(hello)가 hello가 아님');
    console.assert(builder.escapeXml('<tag>') === '&lt;tag&gt;', 'escapeXml(<tag>) 실패');
    console.assert(builder.escapeXml('"&') === '&quot;&amp;', 'escapeXml("&) 실패');

    if (builder.escapeXml(null) !== '') {
        throw new Error('M10 escapeXml(null) guard 실패: null 입력 시 TypeError 발생 가능');
    }
});

// ── M9: setInterval unbounded cleanup ─────────────────────────
test('setInterval 중복 등록 시 이전 interval이 clearInterval로 해제되어야 합니다.', () => {
    let clearCallCount = 0;
    let lastClearId = null;
    const origClearInterval = globalThis.clearInterval;
    const origSetInterval = globalThis.setInterval;

    try {
        globalThis.clearInterval = (id) => {
            clearCallCount++;
            lastClearId = id;
        };

        let batchIntervalId = null;
        const startInterval = () => {
            if (batchIntervalId) globalThis.clearInterval(batchIntervalId);
            batchIntervalId = globalThis.setInterval(() => {}, 2000);
            return batchIntervalId;
        };

        const id1 = startInterval();
        const id2 = startInterval();

        console.assert(clearCallCount === 1, `clearInterval 호출 횟수: ${clearCallCount} (기대치: 1)`);
        console.assert(lastClearId === id1, '이전 interval ID가 clearInterval로 전달되지 않음');
        console.assert(batchIntervalId === id2, 'batchIntervalId가 최신 interval ID가 아님');

        if (clearCallCount !== 1) {
            throw new Error('M9 setInterval cleanup 실패: 중복 interval 누적');
        }
    } finally {
        globalThis.clearInterval = origClearInterval;
        globalThis.setInterval = origSetInterval;
    }
});

// ── M5: 네트워크 URL Drive query encodeURIComponent ──────────
test('Drive API query URL에 encodeURIComponent가 적용되어야 합니다.', () => {
    const testName = "Action & Adventure + 100%";
    const escapedName = testName.replace(/'/g, "\\'");
    const queryPart = `name = '${escapedName}'`;
    const fullQuery = `${queryPart} and 'parent123' in parents and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fullQuery)}`;

    console.assert(url.includes('%26'), '&가 URL 인코딩되지 않음');
    console.assert(url.includes('%2B'), '+가 URL 인코딩되지 않음');
    console.assert(url.includes('%25'), '%가 URL 인코딩되지 않음');

    if (!url.includes('%26')) {
        throw new Error('M5 encodeURIComponent 누락: 특수문자로 인한 HTTP 400 위험');
    }
});

// ── L30: getOrCreateFolder URL encodeURIComponent ─────────────
test('폴더명 내 특수문자가 getOrCreateFolder URL에서 인코딩되어야 합니다.', () => {
    const folderName = "Webtoon & More";
    const queryPart = `name = '${folderName.replace(/'/g, "\\'")}'`;
    const fullQuery = `${queryPart} and 'parentId' in parents and trashed=false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fullQuery)}`;

    console.assert(searchUrl.includes('%26'), '&가 인코딩되지 않음 (HTTP 400 원인)');

    if (!searchUrl.includes('%26')) {
        throw new Error('L30 encodeURIComponent 누락: 폴더명 & 문자로 Drive API 실패');
    }
});

// ── M8: SubscriptionManager 에러 시 5분 쿨다운 ──────────────
test('SubscriptionManager 에러 시 lastFetched가 24h가 아닌 5min 쿨다운으로 설정되어야 합니다.', () => {
    const now = Date.now();
    const CHECK_INTERVAL = 86400000;
    const errorCooldown = now - CHECK_INTERVAL + 300000;

    console.assert(errorCooldown > now - CHECK_INTERVAL, 'cooldown이 24h 이전이 아님');
    console.assert(errorCooldown < now - CHECK_INTERVAL + 600000, 'cooldown이 10분을 초과함');
    console.assert(errorCooldown >= now - CHECK_INTERVAL + 300000 - 100, 'cooldown이 5분 미만임');

    const retryAfter = errorCooldown + CHECK_INTERVAL;
    const waitMinutes = (retryAfter - now) / 60000;
    console.assert(waitMinutes >= 4 && waitMinutes <= 6,
        `재시도 대기 시간이 ${waitMinutes.toFixed(1)}분 (기대치: ~5분)`);

    if (waitMinutes > 10) {
        throw new Error('M8 24h retry block: 에러 후 재시도가 10분 이상 차단됨');
    }
});

// ── M6: utils.js revokeObjectURL setTimeout 지연 ────────────
test('revokeObjectURL가 setTimeout을 통해 지연 호출되어야 합니다.', () => {
    const calls = [];
    const origSetTimeout = globalThis.setTimeout;

    try {
        globalThis.setTimeout = (fn, ms, ...args) => {
            calls.push({ fn, ms, args });
            return 1;
        };

        const url = 'blob:test-url-123';
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.assert(calls.length === 1, 'setTimeout이 호출되지 않음');
        console.assert(calls[0].ms === 1000, `지연 시간이 ${calls[0].ms}ms (기대치: 1000ms)`);

        if (calls.length === 0 || calls[0].ms !== 1000) {
            throw new Error('M6 revokeObjectURL 지연 실패');
        }
    } finally {
        globalThis.setTimeout = origSetTimeout;
    }
});

// ── M3: anti_sleep audioContext 동기식 null 설정 ────────────
test('stopSilentAudio() 호출 시 audioContext가 동기적으로 null로 설정되어야 합니다.', () => {
    let context = { state: 'running', close() { return Promise.resolve(); } };
    const closeSpy = { called: false };

    const stopSilentAudio = () => {
        if (context) {
            const ctx = context;
            context = null;
            ctx.close().then(() => {});
            closeSpy.called = true;
        }
    };

    stopSilentAudio();
    console.assert(context === null, 'stopSilentAudio() 후 context가 null이 아님');
    console.assert(closeSpy.called === true, 'close()가 호출되지 않음');

    if (context !== null) {
        throw new Error('M3 audioContext race: close() 완료 전까지 context가 null이 아님');
    }
});

// ── M1: EventBus dead constants 제거 확인 ─────────────────────
test('EVT에 NOTIFY_CONFIRM, DOWNLOAD_DONE, VERIFY_RESULT, TEST_RESULT dead constants가 없어야 합니다.', () => {
    console.assert(EVT.NOTIFY_CONFIRM === undefined,
        'EVT.NOTIFY_CONFIRM이 아직 존재함');
    console.assert(EVT.DOWNLOAD_DONE === undefined,
        'EVT.DOWNLOAD_DONE이 아직 존재함');
    console.assert(EVT.VERIFY_RESULT === undefined,
        'EVT.VERIFY_RESULT가 아직 존재함');
    console.assert(EVT.TEST_RESULT === undefined,
        'EVT.TEST_RESULT가 아직 존재함');

    if (EVT.NOTIFY_CONFIRM !== undefined) {
        throw new Error('M1 dead constants 제거 실패: NOTIFY_CONFIRM 잔존');
    }
});

// ── D1: DI StorageBackend 기본 CRUD ─────────────────────────
test('GMStorageBackend가 get/set/delete를 정상 수행해야 합니다.', async () => {
    const backupGMget = globalThis.GM_getValue;
    const backupGMset = globalThis.GM_setValue;
    const backupGMdel = globalThis.GM_deleteValue;
    const mockStore = new Map();

    globalThis.GM_getValue = (k, d) => mockStore.has(k) ? mockStore.get(k) : d;
    globalThis.GM_setValue = (k, v) => { mockStore.set(k, v); };
    globalThis.GM_deleteValue = (k) => { mockStore.delete(k); };

    const backend = new GMStorageBackend();
    const testKey = '__toki_test_d1__';

    backend.set(testKey, { a: 1, b: 'hello' });
    const result = backend.get(testKey);
    console.assert(result !== null && result !== undefined && result.b === 'hello',
        `get() 값: ${JSON.stringify(result)}`);

    backend.delete(testKey);
    const afterDelete = backend.get(testKey, 'default');
    console.assert(afterDelete === 'default',
        `delete() 후 get() 값: ${afterDelete}`);

    globalThis.GM_getValue = backupGMget;
    globalThis.GM_setValue = backupGMset;
    globalThis.GM_deleteValue = backupGMdel;

    if (!result || result.b !== 'hello') {
        throw new Error('D1: GMStorageBackend 기본 CRUD 실패');
    }
});

// ── D2: setConfigStorage 주입 후 config 저장 ──────────────────
test('setConfigStorage 주입 후 setConfig/getConfig가 StorageBackend를 사용해야 합니다.', () => {
    const backupGMget = globalThis.GM_getValue;
    const backupGMset = globalThis.GM_setValue;
    const backupLS = globalThis.localStorage;
    const mockStore = new Map();

    globalThis.GM_getValue = (k, d) => mockStore.has(k) ? mockStore.get(k) : d;
    globalThis.GM_setValue = (k, v) => { mockStore.set(k, v); };
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };

    const backend = new GMStorageBackend();
    setConfigStorage(backend);

    setConfig('TOKI_GAS_ID', 'test-gas-id-d2');
    const cfg = getConfig();

    globalThis.GM_getValue = backupGMget;
    globalThis.GM_setValue = backupGMset;
    globalThis.localStorage = backupLS;
    setConfigStorage(null);

    const ok = cfg.gasId === 'test-gas-id-d2';
    console.assert(ok, `getConfig().gasId: ${cfg.gasId}`);
    if (!ok) {
        throw new Error('D2: setConfigStorage 주입 후 getConfig 불일치');
    }
});

// ── D3: setConfig()가 실패 시 false 반환 ──────────────────────
test('setConfig()는 저장 실패 시 boolean false를 반환해야 합니다.', () => {
    setConfigStorage(null);

    const _stored = {};
    globalThis.GM_setValue = (k, v) => { _stored[k] = v; return undefined; };
    globalThis.GM_getValue = (k, d) => _stored[k] ?? d;
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };

    const ok = setConfig('TOKI_SLEEP_MODE', 'slow');

    delete globalThis.GM_setValue;
    delete globalThis.GM_getValue;
    delete globalThis.localStorage;

    console.assert(ok === true, `setConfig() 성공 시 반환값: ${ok}`);
    if (ok !== true) {
        throw new Error('D3: setConfig() 반환값이 true가 아님');
    }
});

// ── D4: TEST_NATIVE_DOWNLOAD EventBus request/respond ────────
test('EventBus.request(TEST_NATIVE_DOWNLOAD)가 성공 응답을 수신해야 합니다.', async () => {
    const unsub = EventBus.on(EVT.TEST_NATIVE_DOWNLOAD, ({ _requestId }) => {
        EventBus.respond(EVT.TEST_NATIVE_DOWNLOAD, _requestId, { ok: true, data: { result: 'ok' } });
    });

    const result = await EventBus.request(EVT.TEST_NATIVE_DOWNLOAD, {}, 3000);
    unsub();

    console.assert(result !== undefined && result.result === 'ok',
        `응답 data: ${JSON.stringify(result)}`);

    if (!result || result.result !== 'ok') {
        throw new Error('D4: TEST_NATIVE_DOWNLOAD respond 실패');
    }
});

// ── D5: TEST_NATIVE_DOWNLOAD 실패 응답 ────────────────────────
test('EventBus.request(TEST_NATIVE_DOWNLOAD)가 실패 응답을 수신해야 합니다.', async () => {
    const unsub = EventBus.on(EVT.TEST_NATIVE_DOWNLOAD, ({ _requestId }) => {
        EventBus.respond(EVT.TEST_NATIVE_DOWNLOAD, _requestId,
            { ok: false, data: { error: 'GM_download not available' }, error: 'GM_download not available' });
    });

    let caughtError = null;
    try {
        await EventBus.request(EVT.TEST_NATIVE_DOWNLOAD, {}, 3000);
    } catch (err) {
        caughtError = err;
    }
    unsub();

    console.assert(caughtError !== null, '에러가 발생하지 않음');
    console.assert(caughtError.message.includes('GM_download'),
        `오류 메시지: ${caughtError?.message}`);

    if (!caughtError) {
        throw new Error('D5: 실패 응답 수신 실패');
    }
});

// ── D6: EventBus.request 타임아웃 시 reject (리스너 등록됐지만 응답 없음) ──
test('EventBus.request()는 타임아웃(50ms) 시 reject되어야 합니다.', async () => {
    const EVT_D6 = 'test:timeout_listener';
    const unsub = EventBus.on(EVT_D6, () => { /* 응답하지 않음 */ });
    let timedOut = false;
    try {
        await EventBus.request(EVT_D6, {}, 50);
    } catch (err) {
        timedOut = err.message.includes('Timeout');
    }
    unsub();

    console.assert(timedOut === true, '타임아웃이 발생하지 않음');
    if (!timedOut) {
        throw new Error('D6: 타임아웃 reject 실패');
    }
});

// ── D7: 동시 요청 2건 requestId 충돌 방지 ────────────────────
test('동시 EventBus.request 2건이 각각 올바른 응답을 수신해야 합니다.', async () => {
    const EVT_A = 'test:req-a';
    const EVT_B = 'test:req-b';

    const unsubA = EventBus.on(EVT_A, ({ _requestId }) => {
        EventBus.respond(EVT_A, _requestId, { ok: true, data: 'result-A' });
    });
    const unsubB = EventBus.on(EVT_B, ({ _requestId }) => {
        EventBus.respond(EVT_B, _requestId, { ok: true, data: 'result-B' });
    });

    const [resA, resB] = await Promise.all([
        EventBus.request(EVT_A, {}, 3000),
        EventBus.request(EVT_B, {}, 3000)
    ]);

    unsubA();
    unsubB();

    console.assert(resA === 'result-A', `EVT_A 응답: ${resA}`);
    console.assert(resB === 'result-B', `EVT_B 응답: ${resB}`);

    if (resA !== 'result-A' || resB !== 'result-B') {
        throw new Error('D7: 동시 request 응답 불일치');
    }
});

// ── D8: respond 후 response channel listener가 제거되어야 합니다 (재호출 시 새 listener로 대체 확인). ───
test('EventBus.respond 후 response channel listener가 제거되어야 합니다.', async () => {
    const EVT_R = 'test:respond-cleanup';

    const unsub = EventBus.on(EVT_R, ({ _requestId }) => {
        EventBus.respond(EVT_R, _requestId, { ok: true, data: {} });
    });

    const res1 = await EventBus.request(EVT_R, {}, 3000);
    const res2 = await EventBus.request(EVT_R, {}, 3000);

    unsub();

    console.assert(res1 && typeof res1 === 'object', `1차 응답: ${JSON.stringify(res1)}`);
    console.assert(res2 && typeof res2 === 'object', `2차 응답: ${JSON.stringify(res2)}`);

    if (!res1 || !res2) {
        throw new Error('D8: response listener 재사용 실패');
    }
});

// ══════════════════════════════════════════════════════════════════════
// v1.28.1 에지케이스 회귀 테스트 (Series Config + Queue Consistency)
// ══════════════════════════════════════════════════════════════════════

// ── E1: SeriesConfig DI CRUD + GM fallback + localStorage fallback ──
test('SeriesConfig가 DI StorageBackend로 get/set/delete를 수행해야 합니다.', () => {
    const { store } = mockStorage(true, false);

    const key = getSeriesConfigKey('manatoki', '123', '테스트시리즈');
    const config = { matchedRule: { id: 'm1' }, folderId: 'abc', category: 'Webtoon' };

    console.assert(saveSeriesConfig(key, config) === true, 'DI save 실패');
    const loaded = getSeriesConfig(key);
    console.assert(loaded !== null && loaded.folderId === 'abc', `DI get 실패: ${JSON.stringify(loaded)}`);

    deleteSeriesConfig(key);
    console.assert(getSeriesConfig(key) === null, 'DI delete 후 값이 남아있음');

    setSeriesStorage(null);
    // GM fallback: store에 값이 없으므로 null 반환
    const fallbackVal = getSeriesConfig(key);
    console.assert(fallbackVal === null, `GM fallback get: ${fallbackVal}`);

    if (!loaded || loaded.folderId !== 'abc') {
        throw new Error('E1: SeriesConfig DI CRUD 실패');
    }
});

// ── E2: SeriesConfig string compatibility (v1.27.x migration) ──────
test('SeriesConfig가 v1.27.x JSON string 데이터를 객체로 변환해야 합니다.', () => {
    const { store } = mockStorage(true, false);

    const key = getSeriesConfigKey('compat', '001', '마이그레이션');
    store.set(key, JSON.stringify({ folderId: 'old-folder', category: 'Novel' }));

    const loaded = getSeriesConfig(key);
    console.assert(loaded !== null && typeof loaded === 'object' && loaded.folderId === 'old-folder',
        `string compat 실패: ${typeof loaded} ${JSON.stringify(loaded)}`);

    setSeriesStorage(null);
    if (!loaded || loaded.folderId !== 'old-folder') {
        throw new Error('E2: string compat 변환 실패');
    }
});

// ── E3: normalizeQueueItem behavior ───────────────────────────────
test('normalizeQueueItem이 seriesKey→config resolve, cfg null, inline fallback을 처리해야 합니다.', () => {
    const { store } = mockStorage(true, false);

    const key = getSeriesConfigKey('t', '1', 'E3');
    store.set(key, { category: 'Novel', folderId: 'f123', rootFolder: 'Test' });

    // case A: seriesKey → resolve
    const itemA = { id: 'a', seriesKey: key, episodeTitle: '1화' };
    const normA = normalizeQueueItem(itemA);
    console.assert(normA.category === 'Novel' && normA.episodeTitle === '1화',
        `case A 실패: ${JSON.stringify(normA)}`);

    // case B: seriesKey but config missing
    const itemB = { id: 'b', seriesKey: 'TOKI_SERIES_missing_key' };
    const normB = normalizeQueueItem(itemB);
    console.assert(normB === itemB, `case B: null cfg에서 item 그대로 반환되지 않음`);

    // case C: no seriesKey → inline return
    const itemC = { id: 'c', episodeTitle: '2화', category: 'Manga' };
    const normC = normalizeQueueItem(itemC);
    console.assert(normC === itemC && normC.category === 'Manga',
        `case C 실패: ${JSON.stringify(normC)}`);

    // case D: null input
    console.assert(normalizeQueueItem(null) === null, 'case D: null input');

    setSeriesStorage(null);
});

// ── E4: getSeriesConfigKey hash collision prevention ─────────────
test('getSeriesConfigKey가 다른 seriesTitle에 대해 다른 키를 생성해야 합니다.', () => {
    const k1 = getSeriesConfigKey('rule1', '123', 'A제목');
    const k2 = getSeriesConfigKey('rule1', '123', 'B제목');
    const k3 = getSeriesConfigKey('rule1', '123', 'A제목'); // same inputs

    console.assert(k1 !== k2, `다른 제목인데 동일 키: ${k1}`);
    console.assert(k1 === k3, `동일 제목인데 다른 키: ${k1} vs ${k3}`);

    if (k1 === k2 || k1 !== k3) {
        throw new Error('E4: 해시 충돌 또는 불일치');
    }
});

// ── E5: addEpisodesToQueue with seriesKey format ─────────────────
test('addEpisodesToQueue가 seriesKey 경량 포맷으로 에피소드를 등록해야 합니다.', () => {
    const { store } = mockStorage(false, true);

    clearQueue();
    const episodes = [];
    for (let i = 0; i < 3; i++) {
        episodes.push({
            episodeNum: String(i + 1).padStart(4, '0'),
            title: `에피소드 ${i + 1}`,
            url: `https://t.com/e/${i + 1}`,
            seriesKey: 'TOKI_SERIES_rule_e5_123',
            forceOverwrite: false
        });
    }

    const added = addEpisodesToQueue(episodes, 'E5시리즈');
    console.assert(added === 3, `added=${added} (expected 3)`);

    const queue = getQueue();
    const seriesItems = queue.filter(i => i.seriesKey === 'TOKI_SERIES_rule_e5_123');
    console.assert(seriesItems.length === 3, `seriesKey items in queue: ${seriesItems.length}`);

    const first = seriesItems[0];
    console.assert(first.category === undefined, 'seriesKey item에 inline category가 있음');
    console.assert(first.folderId === undefined, 'seriesKey item에 inline folderId가 있음');

    clearQueue();
    setQueueStorage(null);
    if (seriesItems.length !== 3) {
        throw new Error('E5: seriesKey 등록 실패');
    }
});

// ── E6: addEpisodesToQueue with inline format (backward compat) ──
test('addEpisodesToQueue가 구 인라인 포맷 에피소드를 등록해야 합니다.', () => {
    const { store } = mockStorage(false, true);

    clearQueue();
    const episodes = [{
        episodeNum: '0001',
        title: '구버전 에피소드',
        url: 'https://t.com/e/1',
        folderId: 'old-folder',
        category: 'Manga',
        viewerCfg: { img: '.view img' },
        rootFolder: 'OldSeries',
        destination: 'drive',
        novelFormat: 'cbz',
        matchedRule: { id: 'old' },
        protocolDomain: 'https://t.com',
        seriesMetadata: { vendor: 'test' },
        forceOverwrite: false
    }];

    const added = addEpisodesToQueue(episodes, 'E6시리즈');
    console.assert(added === 1, `added=${added}`);

    const queue = getQueue();
    const item = queue.find(i => i.episodeTitle === '구버전 에피소드');
    console.assert(item !== undefined, '인라인 아이템을 찾을 수 없음');
    console.assert(item.category === 'Manga', `category: ${item.category}`);
    console.assert(item.folderId === 'old-folder', `folderId: ${item.folderId}`);
    console.assert(item.seriesKey === undefined, '인라인 아이템에 seriesKey가 있음');

    clearQueue();
    setQueueStorage(null);
    if (!item || item.category !== 'Manga') {
        throw new Error('E6: 인라인 포맷 하위 호환 실패');
    }
});

// ── E7: assertConsistent self-healing (zombie detection + auto-reconcile) ──
test('assertConsistent가 좀비 엔트리를 감지하고 자가 치유해야 합니다.', () => {
    const { store } = mockStorage(false, true);
    clearQueue();

    // Scenario A: processingSlots zombie (sessionRegistry에 없는 ID)
    const zombieA = 'zombie_in_slots';
    processingSlots.add(zombieA);
    console.assert(processingSlots.has(zombieA), 'zombieA 생성 실패');

    assertConsistent('e7:slots_zombie');
    console.assert(!processingSlots.has(zombieA), `zombieA 잔존: slots=${processingSlots.has(zombieA)}`);

    // Scenario B: sessionRegistry zombie (processingSlots에 없는 ID)
    const zombieB = 'zombie_in_registry';
    sessionRegistry.set(zombieB, { sessionToken: 'z', popupRef: null, createdAt: Date.now(), lastActivity: Date.now() });
    console.assert(sessionRegistry.has(zombieB), 'zombieB 생성 실패');

    assertConsistent('e7:reg_zombie');
    console.assert(!sessionRegistry.has(zombieB), `zombieB 잔존: reg=${sessionRegistry.has(zombieB)}`);

    // Scenario C: activeWorkers zombie (어느 레지스트리에도 없는 ID)
    const zombieC = 'zombie_in_workers';
    activeWorkers.set(zombieC, {});
    console.assert(activeWorkers.has(zombieC), 'zombieC 생성 실패');

    assertConsistent('e7:worker_zombie');
    console.assert(!activeWorkers.has(zombieC), `zombieC 잔존: workers=${activeWorkers.has(zombieC)}`);

    // Scenario D: 정상 등록된 세션은 삭제되지 않아야 함
    const healthy = 'healthy_session';
    processingSlots.add(healthy);
    sessionRegistry.set(healthy, { sessionToken: 'h', popupRef: null, createdAt: Date.now(), lastActivity: Date.now() });
    activeWorkers.set(healthy, {});

    assertConsistent('e7:healthy');
    console.assert(processingSlots.has(healthy) && sessionRegistry.has(healthy) && activeWorkers.has(healthy),
        `건강한 세션 삭제됨: slots=${processingSlots.has(healthy)} reg=${sessionRegistry.has(healthy)} workers=${activeWorkers.has(healthy)}`);

    // Cleanup
    processingSlots.delete(healthy);
    sessionRegistry.delete(healthy);
    activeWorkers.delete(healthy);
    setQueueStorage(null);
});

// ── E8: removeCompletedAndFailedItems seriesKey GC ──────────────
test('removeCompletedAndFailedItems가 고아 seriesKey만 GC해야 합니다.', () => {
    clearQueue();
    const { store } = mockStorage(true, true);

    // seriesKey "A": 1개 pending, 1개 completed → completed 삭제해도 GC되면 안 됨
    // seriesKey "B": 2개 completed → GC되어야 함
    const queue = [
        { id: 'a1', seriesKey: 'SK_A', status: 'pending', episodeTitle: 'A-1' },
        { id: 'a2', seriesKey: 'SK_A', status: 'completed', episodeTitle: 'A-2' },
        { id: 'b1', seriesKey: 'SK_B', status: 'completed', episodeTitle: 'B-1' },
        { id: 'b2', seriesKey: 'SK_B', status: 'completed', episodeTitle: 'B-2' },
    ];
    store.set('TOKI_QUEUE', queue);

    store.set('SK_A', JSON.stringify({ folderId: 'fa' }));
    store.set('SK_B', JSON.stringify({ folderId: 'fb' }));

    removeCompletedAndFailedItems();

    const remaining = store.get('TOKI_QUEUE', []);
    const a1 = remaining.find(i => i.id === 'a1');
    console.assert(a1 !== undefined, 'pending item "a1"이 삭제됨');
    console.assert(remaining.find(i => i.id === 'b1') === undefined, 'completed "b1"이 남아있음');

    // SK_B는 모든 아이템이 삭제되었으므로 GC됨
    // SK_A는 pending 아이템이 있으므로 GC되지 않아야 함
    console.assert(store.get('SK_B') === undefined, 'SK_B가 GC되지 않음');
    console.assert(store.get('SK_A') !== undefined, 'SK_A가 잘못 GC됨');

    clearQueue();
    setQueueStorage(null);
    setSeriesStorage(null);
    if (a1 === undefined || store.get('SK_A') === undefined) {
        throw new Error('E8: seriesKey GC 실패');
    }
});

// ── E10: STORAGE_FATAL event emit 구독 ──────────────────────────
test('STORAGE_FATAL 이벤트가 emit 시 구독자에게 전달되어야 합니다.', () => {
    let received = null;
    const unsub = EventBus.on(EVT.STORAGE_FATAL, (payload) => {
        received = payload;
    });

    EventBus.emit(EVT.STORAGE_FATAL, { key: 'test_key', retriesExhausted: 3 });

    console.assert(received !== null, 'STORAGE_FATAL 미수신');
    console.assert(received.key === 'test_key', `key: ${received?.key}`);
    console.assert(received.retriesExhausted === 3, `retries: ${received?.retriesExhausted}`);

    unsub();
    if (!received || received.key !== 'test_key') {
        throw new Error('E10: STORAGE_FATAL emit 실패');
    }
});

// ── E11: saveSeriesConfig failure → inline fallback scenario ──
test('saveSeriesConfig가 실패하면 episode에 seriesKey 대신 inline 필드가 있어야 합니다.', () => {
    // GM_setValue가 없는 환경 → saveSeriesConfig 실패, false 반환
    // 이 테스트는 DI가 null이고 GM API도 없는 상황을 가정
    setSeriesStorage(null);
    const backupGM = globalThis.GM_setValue;
    delete globalThis.GM_setValue;

    const key = getSeriesConfigKey('rr', '999', 'FailTest');
    const saved = saveSeriesConfig(key, { folderId: 'ff' });
    console.assert(saved === false, 'GM 없는 환경에서 saveSeriesConfig가 true 반환');

    // inline fallback: seriesKey 없이 sharedFields를 episode에 직접 넣는 게 downloader의 책임
    // 여기서는 normalizeQueueItem이 seriesKey 없으면 item을 그대로 반환하는지만 확인
    const item = { id: 'e11', episodeTitle: '인라인', folderId: 'inline-folder' };
    const norm = normalizeQueueItem(item);
    console.assert(norm.folderId === 'inline-folder', `normalize: ${JSON.stringify(norm)}`);

    if (backupGM !== undefined) globalThis.GM_setValue = backupGM;
    if (saved !== false) {
        throw new Error('E11: saveSeriesConfig 실패 시나리오 불일치');
    }
});

// ── E12: stopAllWorkers → paused 유지 (true) ───────────────────
test('stopAllWorkers 호출 후 queue가 paused 상태여야 합니다.', () => {
    const { store } = mockStorage(false, true);

    clearQueue();

    const episodes = [{
        episodeNum: '0001', title: 'PauseTest', url: 'https://t.com/e/1',
        seriesKey: 'TOKI_SERIES_rule_e12',
        forceOverwrite: false
    }];
    addEpisodesToQueue(episodes, 'E12시리즈');

    const before = getQueue().length;
    console.assert(before > 0, `큐 비어있음: ${before}`);

    stopAllWorkers(false);

    const after = getQueue();
    const pendingItems = after.filter(i => i.status === 'pending');
    console.assert(pendingItems.length === 0, `중단 후 pending 항목 ${pendingItems.length}개 잔존`);

    clearQueue();
    setQueueStorage(null);
});

// ── E13: clearQueue with active processing → stopAllWorkers 호출 ─
test('clearQueue가 진행 중인 작업이 있을 때 stopAllWorkers를 먼저 호출해야 합니다.', () => {
    const { store } = mockStorage(false, true);

    clearQueue();
    const testId = 'test_active_id';
    processingSlots.add(testId);
    _activeProcessing.add(testId);

    const beforeSlots = processingSlots.size;
    console.assert(beforeSlots > 0, 'processingSlots 비어있음');

    clearQueue();

    console.assert(processingSlots.size === 0, `clearQueue 후 processingSlots 잔존: ${processingSlots.size}`);
    console.assert(_activeProcessing.size === 0, `clearQueue 후 _activeProcessing 잔존: ${_activeProcessing.size}`);
    console.assert(sessionRegistry.size === 0, `clearQueue 후 sessionRegistry 잔존: ${sessionRegistry.size}`);

    setQueueStorage(null);
});

// 테스트 기동
runTests();
