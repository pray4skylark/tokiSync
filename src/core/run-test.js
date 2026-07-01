import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uiJsPath = path.resolve(__dirname, 'ui', 'LogBox.js');
const backupPath = path.resolve(__dirname, 'ui', 'LogBox.js.bak');

let originalContent = '';
let modified = false;

// ── 1. Node.js 테스트 수트 가동 (CSS import 임시 우회) ────────────────
try {
    console.log('🔄 [Test Runner] CSS import 우회를 위한 ui/LogBox.js 임시 가공 시작...');
    originalContent = fs.readFileSync(uiJsPath, 'utf8');
    fs.writeFileSync(backupPath, originalContent, 'utf8');

    // import styles from './ui.css'; 라인을 const styles = ''; 로 임시 치환
    const modifiedContent = originalContent.replace(
        /import styles from '\.\/ui\.css';/g,
        "const styles = '';"
    );

    fs.writeFileSync(uiJsPath, modifiedContent, 'utf8');
    modified = true;
    console.log('✅ [Test Runner] ui/LogBox.js 임시 가공 성공 (backup 생성완료)');

    console.log('🧪 [Test Runner] 테스트 수트(test-eventbus.js)를 기동합니다...');
    execSync('node src/core/test-eventbus.js', { stdio: 'inherit' });

    console.log('🧪 [Test Runner] 실환경 시나리오 모사 테스트(test-real-env.js)를 기동합니다...');
    execSync('node src/core/test-real-env.js', { stdio: 'inherit' });

    console.log('📋 [Test Runner] 정적 코드 검증(test/static-verify.mjs)을 수행합니다...');
    execSync('node test/static-verify.mjs', { stdio: 'inherit' });

} catch (err) {
    console.error('❌ [Test Runner] 테스트 실행 중 에러 발생:', err.message);
    process.exitCode = 1;
} finally {
    // ── 2. 빌드 컴파일을 위해 원본 소스 복원 ─────────────────────────
    if (modified) {
        try {
            fs.writeFileSync(uiJsPath, originalContent, 'utf8');
            if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath);
            }
            modified = false;
            console.log('🔄 [Test Runner] ui/LogBox.js 원본 복구 완료 (빌드 및 감사 모드 진입)');
        } catch (restoreErr) {
            console.error('❌ [Test Runner] 원본 복구 실패! 수동 복구가 필요할 수 있습니다:', restoreErr.message);
            process.exitCode = 1;
        }
    }
}

// ── 3. 정식 Webpack 컴파일 빌드 검증 및 번들 CSS 누락 스캔 감사 ────────
if (process.exitCode !== 1) {
    try {
        console.log('📦 [Test Runner] 빌드 번들 유효성 검증을 위해 Webpack 컴파일을 기동합니다...');
        execSync('npx webpack --config webpack.core.config.cjs', { stdio: 'inherit' });

        console.log('🔍 [Test Runner] 빌드 번들 내 CSS 누락 여부를 스캔합니다...');
        const bundlePath = path.resolve(__dirname, '../../dist/tokiSync.user.js');
        if (fs.existsSync(bundlePath)) {
            const bundleContent = fs.readFileSync(bundlePath, 'utf8');
            
            // css-loader / asset/source를 거쳐 문자열로 온전히 로드 및 주입되었는지 검증
            const hasLogboxStyle = bundleContent.includes('#toki-logbox');
            const hasModalStyle = bundleContent.includes('.toki-modal-overlay');
            
            if (hasLogboxStyle && hasModalStyle) {
                console.log('✅ [Test Runner] CSS 번들링 유효성 감사 완료 (필수 스타일 클래스 확인)');
            } else {
                throw new Error('번들링된 파일에 CSS 스타일이 누락되었습니다. (#toki-logbox 또는 .toki-modal-overlay 클래스 미검출)');
            }
        } else {
            throw new Error('빌드 번들 파일(dist/tokiSync.user.js)을 찾을 수 없습니다.');
        }

        console.log('🎉 [Test Runner] 모든 실환경/유닛 테스트 및 번들 검증 완료');

    } catch (err) {
        console.error('❌ [Test Runner] 빌드 검증 중 에러 발생:', err.message);
        process.exitCode = 1;
    }
}
