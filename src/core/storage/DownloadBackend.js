/**
 * DownloadBackend — 추상 인터페이스
 * GM_download / Cloud fetch 등 다운로드 구현체는 이 클래스를 상속
 */
export class DownloadBackend {
  download(blob, filename, options = {}) {
    throw new Error('DownloadBackend.download() must be implemented');
  }
}
