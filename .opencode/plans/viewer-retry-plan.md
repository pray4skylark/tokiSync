# Viewer Error Retry & 먹통 해결 계획

## 문제
`startReading()` 실패 시 `isRestoring`이 영원히 `true`로 고정됨 → "Synchronizing Position" 오버레이(z-150)가 전체 화면 차단 → 유저 완전 먹통 (Escape키만 탈출 가능)

## 변경 파일 & 상세 코드

### File 1: `src/viewer/composables/useStore.js`

**1a. `episodeLoadError` ref 추가** (line 161 옆)
```js
const episodeLoadError = ref(false);
```

**1b. `startReading()` 시작 부분에 에러 상태 리셋** (line 820 위)
```js
  currentEpisode.value = ep;
  currentPage.value = 1;
  showNextEpisodeGuide.value = false;
  viewerContent.value = null;
  episodeLoadError.value = false; // ← 추가
```

**1c. `startReading()` catch 블록 수정** (lines 910-913)
```js
  } catch (e) {
    console.error('Fetch Error:', e);
    episodeLoadError.value = true;
    isRestoring.value = false;        // ← 오버레이 해제 (중요)
    isPreloadTriggered.value = false; // ← 프리로드 상태 정리
    notify(`❌ 콘텐츠 로드 실패: ${e.message}`);
  }
```

**1d. `retryLoad()` 함수 추가** (line 914, `startReading` 종료 후)
```js
const retryLoad = () => {
  if (!currentEpisode.value) return;
  episodeLoadError.value = false;
  startReading(currentEpisode.value);
};
```

**1e. export 객체에 추가** (line 1238 쯤)
```js
    goToNextEpisode, goToPrevEpisode,
    retryLoad, episodeLoadError,  // ← 추가
    toggleViewerUI, setViewerMode,
```

---

### File 2: `src/viewer/views/ReaderViewV2.vue`

**2a. `episodeLoadError`, `retryLoad` destructure 추가** (line 219 옆)
```js
  exitViewer, goToNextEpisode, goToPrevEpisode,
  retryLoad, episodeLoadError,     // ← 추가
  setViewerMode, handleWheel,
```

**2b. Restoring 오버레이에 취소 버튼 추가** (line 22 옆)
```html
    <transition name="fade">
      <div v-if="isRestoring && !isDownloading" class="fixed inset-0 z-[150] bg-black/40 backdrop-blur-2xl flex flex-col items-center justify-center text-white">
        <div class="flex flex-col items-center scale-110">
          <div class="w-10 h-10 border-[3px] border-white/5 border-t-theme-accent rounded-full animate-spin mb-5"></div>
          <p class="text-[9px] font-black tracking-[0.5em] uppercase text-theme-accent animate-pulse">Synchronizing Position</p>
+         <button @click="exitViewer"
+                 class="mt-10 px-8 py-3 bg-red-500/20 hover:bg-red-500/40 text-red-500
+                        border border-red-500/50 rounded-2xl text-sm font-black
+                        transition-all uppercase tracking-widest">
+           취소하고 나가기
+         </button>
        </div>
      </div>
    </transition>
```

**2c. 에러 상태 UI로 대체** (line 70)
기존:
```html
      <div v-else-if="!viewerContent && !isDownloading" class="text-zinc-600 py-20">콘텐츠 로드 대기 중...</div>
```
변경:
```html
      <div v-else-if="episodeLoadError"
           class="flex flex-col items-center justify-center h-full text-zinc-400 px-8">
        <p class="text-sm mb-8 text-center leading-relaxed">
          콘텐츠를 불러오지 못했습니다.<br>
          <span class="text-[10px] opacity-50">네트워크 상태를 확인하거나 다시 시도해주세요.</span>
        </p>
        <div class="flex gap-4">
          <button @click="retryLoad"
                  class="px-8 py-3 bg-theme-accent/20 hover:bg-theme-accent/40 text-theme-accent
                         border border-theme-accent/50 rounded-2xl text-sm font-black
                         transition-all uppercase tracking-widest">
            재시도
          </button>
          <button @click="exitViewer"
                  class="px-8 py-3 bg-red-500/20 hover:bg-red-500/40 text-red-500
                         border border-red-500/50 rounded-2xl text-sm font-black
                         transition-all uppercase tracking-widest">
            나가기
          </button>
        </div>
      </div>
      <div v-else-if="!viewerContent && !isDownloading" class="text-zinc-600 py-20">콘텐츠 로드 대기 중...</div>
```

---

### File 3: `src/viewer/composables/useProgressMarker.js`

**3a. `isRestoring` 안전 타임아웃 추가** (파일 하단, `resetLocator` 옆)
```js
// [v2.9.4] Safety timeout: isRestoring이 15초 이상 풀리지 않으면 강제 해제
const RESTORE_TIMEOUT = 15000;
let _restoreTimer = null;

function _startRestoreTimer() {
  _clearRestoreTimer();
  _restoreTimer = setTimeout(() => {
    if (isRestoring.value) {
      console.warn('[V2:Restore] FORCED UNLOCK — restore timed out');
      isRestoring.value = false;
    }
  }, RESTORE_TIMEOUT);
}

function _clearRestoreTimer() {
  if (_restoreTimer) {
    clearTimeout(_restoreTimer);
    _restoreTimer = null;
  }
}
```

**3b. `resetLocator()`에 타이머 클리어 추가**
```js
const resetLocator = () => {
  logicalIndex.value = 0;
  isInternalSyncing.value = false;
  _clearRestoreTimer();         // ← 추가
};
```

**3c. `restore()` 함수 시작에 타이머 시작, finally에 클리어**
```js
  const restore = async (store) => {
    const ep = ...;
    if (!ep?.id) {
      isRestoring.value = false;
      return;
    }
    
    try {
      isRestoring.value = true;
      _startRestoreTimer();     // ← 추가 (line break 이후)
      const history = await db.readHistory.get(ep.id);
```

finally 블록:
```js
    } finally {
      _clearRestoreTimer();     // ← 추가
      setTimeout(() => { 
        isInternalSyncing.value = false; 
        isRestoring.value = false;
      }, 500);
    }
```

---

## 검증
```bash
npm run build:core
npm run test
```
