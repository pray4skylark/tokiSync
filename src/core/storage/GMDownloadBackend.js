/**
 * GMDownloadBackend — Tampermonkey GM_download 구현체
 */
import { DownloadBackend } from './DownloadBackend.js';
import { LogBox } from '../ui/index.js';

export class GMDownloadBackend extends DownloadBackend {
  download(blob, filename, options = {}) {
    const finalPath = filename.replace(/[<>:"|?*]/g, '_');

    return new Promise((resolve, reject) => {
      if (typeof GM_download !== 'function') {
        const err = 'GM_download 권한이 없거나 지원되지 않는 환경입니다.';
        try { LogBox.getInstance().error(`[Native] 실패: ${err}`); } catch (e) {}
        reject(new Error(err));
        return;
      }

      GM_download({
        url: URL.createObjectURL(blob),
        name: finalPath,
        saveAs: options.saveAs ?? false,
        onload: () => resolve(true),
        onerror: (err) => {
          const errMsg = err ? (err.error || err.reason || '알 수 없는 오류') : '알 수 없는 오류';
          const logger = LogBox.getInstance();
          if (err && err.error === 'not_whitelisted') {
            const ext = filename.split('.').pop() || 'txt';
            logger.critical(`[Native 방어] 다운로드 차단됨: 지원하지 않는 확장자입니다.\n👉 템퍼몽키 [설정] -> [고급] -> [Whitelisted File Extensions]에 '${ext}' 확장자를 추가해주세요.`);
          } else {
            logger.error(`[Native] 다운로드 실패: ${errMsg}`);
          }
          reject(new Error(errMsg));
        }
      });
    });
  }
}
