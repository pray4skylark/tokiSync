/**
 * StorageBackend — 추상 인터페이스
 * GM_setValue / Puter KV / Cloud API 등 저장소 구현체는 이 클래스를 상속
 */
export class StorageBackend {
  get(key, defaultValue) {
    throw new Error(`StorageBackend.get(${key}) must be implemented`);
  }
  set(key, value) {
    throw new Error(`StorageBackend.set(${key}) must be implemented`);
  }
  delete(key) {
    throw new Error(`StorageBackend.delete(${key}) must be implemented`);
  }
  addChangeListener(key, callback) {
    throw new Error(`StorageBackend.addChangeListener(${key}) must be implemented`);
  }
}
