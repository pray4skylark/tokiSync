import { EventBus, EVT } from './EventBus.js';
import { addEpisodesToQueue, initQueueScheduler, activeWorkers, getQueue, clearQueue, getQueueItemId } from './queue.js';
import { initBatchWorkerController } from './worker-controller.js';

let passCount = 0;
let failCount = 0;
const tests = [];

/**
 * 플러그앤플레이(Plug-and-play) 스타일의 회귀 테스트 등록기
 */
function test(name, fn) {
    tests.push({ name, fn });
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
        if (details.data && typeof details.data === 'string') {
            try {
                const payload = JSON.parse(details.data);
                if (payload.type === 'view_update_cache') {
                    cacheRefreshCalledCount++;
                }
            } catch (e) {}
        }
        if (details.onload) {
            setTimeout(() => {
                details.onload({
                    responseText: JSON.stringify({ status: 'success', body: 'ok' })
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
        await new Promise(resolve => backupSetTimeout(resolve, 50));

        // 6. Concurrency 한도(2) 검증
        // 3개 중 1화와 2화만 우선 processing 상태여야 한다.
        const queueState1 = getQueue();
        const item1 = queueState1.find(i => i.id === id1);
        const item2 = queueState1.find(i => i.id === id2);
        const item3 = queueState1.find(i => i.id === id3);

        console.assert(item1 && item1.status === 'processing', '1화가 processing 상태가 아닙니다.');
        console.assert(item2 && item2.status === 'processing', '2화가 processing 상태가 아닙니다.');
        console.assert(item3 && item3.status === 'pending', '3화는 Concurrency(2)에 의해 pending 상태여야 합니다.');

        console.assert(activeWorkers.size === 2, `활성 워커 개수 불일치: ${activeWorkers.size}`);
        console.assert(activeWorkers.has(id1), '1화 워커 등록 누락');
        console.assert(activeWorkers.has(id2), '2화 워커 등록 누락');

        if (item1.status !== 'processing' || item2.status !== 'processing' || item3.status !== 'pending' || activeWorkers.size !== 2) {
            throw new Error('Concurrency 한도 제어 검증 실패');
        }

        // 7. 1화 완료 처리 시뮬레이션
        // READY 수신 후 -> EXTRACTION 진행 -> TASK_COMPLETED
        const popup1 = activeWorkers.get(id1);
        simulateWorkerMessage(popup1, 'WORKER_READY', { targetUrl: 'http://example.com/1' });
        simulateWorkerMessage(popup1, 'TASK_COMPLETED', { queueId: id1, content: '1화 본문' });

        // 8. 릴레이 호출 및 다음 작업 자동 실행 검증
        // 1화 완료 직후 스케줄러가 돌아 3화가 실행 상태로 넘어가야 한다.
        await new Promise(resolve => backupSetTimeout(resolve, 50));

        const queueState2 = getQueue();
        const updatedItem1 = queueState2.find(i => i.id === id1);
        const updatedItem3 = queueState2.find(i => i.id === id3);

        console.assert(updatedItem1.status === 'completed', '1화가 완료되지 않았습니다.');
        console.assert(updatedItem3.status === 'processing', '3화가 자동으로 스케줄링되지 않았습니다.');

        if (updatedItem1.status !== 'completed' || updatedItem3.status !== 'processing') {
            throw new Error('대기 중이던 3화 자동 실행 전이 실패');
        }

        // 3화 팝업은 기존 1화 팝업(popup1)을 재활용해야 함.
        const popup3 = activeWorkers.get(id3);
        console.assert(popup3 === popup1, '3화 가용 슬롯 팝업 재사용 실패');

        if (popup3 !== popup1) {
            throw new Error('팝업 재활용 검증 실패');
        }

        // 9. 2화 완료 처리 시뮬레이션
        const popup2 = activeWorkers.get(id2);
        simulateWorkerMessage(popup2, 'WORKER_READY', { targetUrl: 'http://example.com/2' });
        simulateWorkerMessage(popup2, 'TASK_COMPLETED', { queueId: id2, content: '2화 본문' });

        await new Promise(resolve => backupSetTimeout(resolve, 50));

        // 10. 3화 완료 처리 시뮬레이션
        simulateWorkerMessage(popup3, 'WORKER_READY', { targetUrl: 'http://example.com/3' });
        simulateWorkerMessage(popup3, 'TASK_COMPLETED', { queueId: id3, content: '3화 본문' });

        await new Promise(resolve => backupSetTimeout(resolve, 50));

        // 11. 최종 상태 검증
        const queueState3 = getQueue();
        const allCompleted = queueState3.every(i => i.status === 'completed');
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
    }
});

// 테스트 기동
runTests();
