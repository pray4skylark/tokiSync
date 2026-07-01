import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

let passCount = 0;
let failCount = 0;

function verify(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passCount++;
    } catch (e) {
        console.log(`  ❌ ${name}: ${e.message}`);
        failCount++;
    }
}

function assertFileContains(filePath, search, desc) {
    const fullPath = path.resolve(root, filePath);
    if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
    const content = fs.readFileSync(fullPath, 'utf8');
    if (!content.includes(search)) throw new Error(`Expected "${search}" not found in ${filePath}`);
}

function assertFileNotContains(filePath, search, desc) {
    const fullPath = path.resolve(root, filePath);
    if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes(search)) throw new Error(`Unexpected "${search}" found in ${filePath}`);
}

function assertFileHasNoContent(filePath, regex, desc) {
    const fullPath = path.resolve(root, filePath);
    if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${filePath}`);
    const content = fs.readFileSync(fullPath, 'utf8');
    if (regex.test(content)) throw new Error(`${desc}: ${filePath} contains forbidden pattern`);
}

console.log('\n📋 정적 코드 검증을 시작합니다...\n');

// H9: ReaderViewV2.vue에 EpisodeListModal 중복 마운트 없음
verify('H9: ReaderViewV2.vue에 중복 EpisodeListModal 마운트가 제거됨', () => {
    assertFileNotContains('src/viewer/views/ReaderViewV2.vue',
        '<EpisodeListModal />',
        '중복 <EpisodeListModal /> 마운트');
});

// L5/L6: txt.js에 core→ui layer import 없음
verify('L5/L6: txt.js에 core→ui 레이어 위반 import 없음', () => {
    const fullPath = path.resolve(root, 'src/core/txt.js');
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes("import") && content.includes("./ui/")) {
        throw new Error('txt.js가 core→ui import를 포함함');
    }
});

// M11: style.css에 nav-zone dead CSS 없음
verify('M11: style.css에 nav-zone dead CSS가 제거됨', () => {
    assertFileNotContains('src/viewer/style.css',
        '.nav-zone',
        'nav-zone CSS');
});

// L11: SettingsPanel.vue에 "Relod" 오타 없음
verify('L11: SettingsPanel.vue에 "Relod" 오타 없음', () => {
    assertFileNotContains('src/viewer/components/SettingsPanel.vue',
        'Relod',
        '"Relod" 오타');
});

// M31: Migrate_Service.gs에 THUMB_FOLDER_NAME 로컬 선언 있음
verify('M31: Migrate_Service.gs에 THUMB_FOLDER_NAME 로컬 선언 있음', () => {
    assertFileContains('src/gas/Migrate_Service.gs',
        'THUMB_FOLDER_NAME = "_Thumbnails"',
        'THUMB_FOLDER_NAME 로컬 선언');
});

// M32: Main.gs에 JSON.parse inner try/catch 있음
verify('M32: Main.gs에 JSON.parse 보호 try/catch 있음', () => {
    const fullPath = path.resolve(root, 'src/gas/Main.gs');
    const content = fs.readFileSync(fullPath, 'utf8');
    const parseLine = content.split('\n').findIndex(l => l.includes('JSON.parse'));
    if (parseLine === -1) throw new Error('Main.gs에 JSON.parse 호출 없음');
    const nearby = content.split('\n').slice(Math.max(0, parseLine - 2), parseLine + 4).join('\n');
    if (!nearby.includes('try') || !nearby.includes('catch')) {
        throw new Error('JSON.parse 주변에 try/catch 없음');
    }
});

// H3: LogBox.js에 dead import(setQueuePaused 등) 없음
verify('H3: LogBox.js에서 setQueuePaused 등 7개 dead import가 제거됨', () => {
    const fullPath = path.resolve(root, 'src/core/ui/LogBox.js');
    const content = fs.readFileSync(fullPath, 'utf8');
    const deadImports = ['setQueuePaused', 'removeQueueItem', 'removeCompletedAndFailedItems',
        'removeCompletedItems', 'stopAllWorkers', 'runSchedulerOnce', 'clearQueue'];
    const importLine = content.split('\n').find(l => l.includes("from '../queue.js'") || l.includes('from \'../queue.js\''));
    const foundDead = deadImports.filter(name => importLine && importLine.includes(name));
    if (foundDead.length > 0) {
        throw new Error(`아직 제거되지 않은 dead import: ${foundDead.join(', ')}`);
    }
});

// M1: EventBus.js에 NOTIFY_CONFIRM 등 dead constants 없음
verify('M1: EventBus.js에 dead constants(NOTIFY_CONFIRM 등)가 제거됨', () => {
    const fullPath = path.resolve(root, 'src/core/EventBus.js');
    const content = fs.readFileSync(fullPath, 'utf8');
    const deadConsts = ['NOTIFY_CONFIRM', 'DOWNLOAD_DONE', 'VERIFY_RESULT', 'TEST_RESULT'];
    const foundDead = deadConsts.filter(name => content.includes(name));
    if (foundDead.length > 0) {
        throw new Error(`아직 제거되지 않은 dead constant: ${foundDead.join(', ')}`);
    }
});

console.log(`\n📊 정적 검증 완료: ${passCount}건 통과 / ${failCount}건 실패\n`);

if (failCount > 0) process.exit(1);
