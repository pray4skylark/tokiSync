import { ref, reactive, computed, watch, toRaw } from 'vue';
import { db } from './db.js';
import { useProgressMarker } from './useProgressMarker.js';

import { useBridge } from './useBridge.js';
import { useGAS } from './useGAS.js';
import { useFetcher } from './useFetcher.js';
import { useSpread } from './useSpread.js';

// Removed local Dexie setup (now in db.js)

// --- Cache TTL (ms) ---
const LIBRARY_TTL = 60 * 60 * 1000;   // 1시간
const EPISODE_TTL = 30 * 60 * 1000;   // 30분

/** TTL 초과 여부 확인 */
function isStale(cachedAt, ttl) {
  return !cachedAt || Date.now() - cachedAt > ttl;
}

// --- Sub-Composables ---
const { isConnected, initBridge, bridgeFetch } = useBridge();
const { gasConfig, setConfig, isConfigured, getLibrary, getBooks, getReadHistory, saveReadHistory, updateMetadata, uploadThumbnail, request } = useGAS();
const { 
  downloadProgress, isDownloading, isPreloading, 
  fetchAndUnzip, preloadEpisode, cleanupBlobUrls, formatSize, cancelViewerDownload 
} = useFetcher();

// --- Singleton State ---
const currentView = ref('library');
const showSettings = ref(false);
const showDownloadManager = ref(false);
const showViewerControls = ref(false);
const isAddModalOpen = ref(false);

const showEpisodeModal = ref(false);
const isInitialLoading = ref(true);
const isSyncing = ref(false);
const notification = ref('');
let notifyTimerId = null;
const needsServerUpdate = ref(false); // [v1.8.0] 서버 업데이트 안내용
const RECOMMENDED_SERVER_VERSION = '1.26.4';

const config = reactive({ deploymentId: '', apiKey: '', folderId: '' });
const viewerDefaults = reactive({ 
  spread: true, 
  rtl: false, 
  coverFirst: true,
  autoCrop: false,      
  virtualScroll: true,
  preloadNext: true,
  downloadThreads: 2, // [v1.7.4] Default parallelism
  viewerVersion: 2, // [v2.1] 1: Legacy, 2: Progress Locator System (기본값 2로 강제 전환 설정)
  touchMapping: {
    top: 'prev',
    bottom: 'next',
    left: 'prev',
    right: 'next',
    center: 'toggle'
  }
});

// [v2.1] Progress Marker Engine Initialization
const { 
  logicalIndex, 
  isRestoring,
  updateLocator,
  resetLocator, 
  saveToDB: saveMarkerToDB, 
  flushSaveToDB,
  restore: restoreMarker 
} = useProgressMarker();


// [v1.7.0] [오류 2 수정] viewerDefaults 영속화
(function loadViewerDefaults() {
  const saved = localStorage.getItem('TOKI_VIEWER_DEFAULTS');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (!parsed.touchMapping) {
        parsed.touchMapping = {
          top: 'prev',
          bottom: 'next',
          left: 'prev',
          right: 'next',
          center: 'toggle'
        };
      }
      Object.assign(viewerDefaults, parsed);
    } catch (e) {
      console.warn('[Store] Failed to load viewerDefaults:', e);
    }
  }
})();

watch(viewerDefaults, (val) => {
  localStorage.setItem('TOKI_VIEWER_DEFAULTS', JSON.stringify(toRaw(val)));
}, { deep: true });

const viewerData = reactive({ mode: 'page' });
const novelSettings = reactive({ theme: 'dark', fontSize: 26, lineHeight: 2.0, spread: false, lastMode: 'scroll' });
const novelPageCount = ref(1);
const novelCurrentPage = ref(0);

// --- Smart Page Grouping (Slot System) ---
const pageSlots = ref([]);
const currentSlotIndex = ref(0);

const searchQuery = ref('');
const currentTab = ref('all');
const tabs = [
  { label: 'TOTAL', value: 'all' },
  { label: 'Webtoon', value: 'webtoon' },
  { label: 'Manga', value: 'manga' },
  { label: 'Novel', value: 'novel' },
];

// --- Global App Theme ---
const _savedTheme = localStorage.getItem('TOKI_APP_THEME') || 'dark';
const appTheme = ref(_savedTheme);
document.documentElement.setAttribute('data-theme', _savedTheme);
const toggleTheme = () => {
  appTheme.value = appTheme.value === 'dark' ? 'light' : 'dark';
  localStorage.setItem('TOKI_APP_THEME', appTheme.value);
  document.documentElement.setAttribute('data-theme', appTheme.value);
};

const libraryItems = ref([]);
const librarySortMode = ref(localStorage.getItem('TOKI_LIBRARY_SORT_MODE') || 'recent');
const seriesLastReadMap = ref({});
const cachedEpisodesList = ref([]);
const cachedTotalSize = ref(0);

watch(librarySortMode, (val) => {
  localStorage.setItem('TOKI_LIBRARY_SORT_MODE', val);
});

async function updateSeriesLastReadMap() {
  try {
    const histories = await db.readHistory.toArray();
    const map = {};
    histories.forEach(h => {
      if (!h.seriesId) return;
      if (!map[h.seriesId] || h.lastReadAt > map[h.seriesId]) {
        map[h.seriesId] = h.lastReadAt;
      }
    });
    seriesLastReadMap.value = map;
    console.log('[Store] Updated series last read map:', map);
  } catch (e) {
    console.warn('[Store] Failed to update seriesLastReadMap:', e);
  }
}

const selectedItem = ref(null);
const currentEpisode = ref(null);
const currentPage = ref(1);
const scrollProgress = ref(0);
const isScrollSyncing = ref(false);
const isPreloadTriggered = ref(false); // [v1.7.5-fix] 프리로드 제어용

// Episode list (fetched from GAS)
const episodes = ref([]);

// Viewer content (populated by useFetcher after unzip)
const viewerContent = ref(null); // { type: 'images', images: [] } or { type: 'text', content: '', paragraphs: [] }

// --- Thumbnail Helpers ---
const NO_IMAGE_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%20viewBox%3D%220%200%20100%20100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%22%20y%3D%2250%22%20font-family%3D%22Arial%22%20font-size%3D%2212%22%20fill%3D%22%23666%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E";

function getThumbnailUrl(series) {
  if (series.thumbnail && series.thumbnail.startsWith('data:image')) return series.thumbnail;
  if (series.thumbnailId) return `https://lh3.googleusercontent.com/d/${series.thumbnailId}=s400`;
  if (series.thumbnail && series.thumbnail.startsWith('http')) return series.thumbnail;
  return NO_IMAGE_SVG;
}

// --- Computed ---
const currentEpisodeIndex = computed(() => {
  return episodes.value.findIndex(ep => ep.id === currentEpisode.value?.id);
});
const hasNextEpisode = computed(() => currentEpisodeIndex.value < episodes.value.length - 1);
const hasPrevEpisode = computed(() => currentEpisodeIndex.value > 0);

// 다음 화 안내 화면 상태
const showNextEpisodeGuide = ref(false);
// 다음 화 정보 (썸네일/제목 표시용)
const nextEpisodeData = computed(() =>
  hasNextEpisode.value ? episodes.value[currentEpisodeIndex.value + 1] : null
);

// 현재 시리즈에서 가장 최근에 읽은 에피소드 (readHistory의 lastReadAt 기준)
const lastReadEpisode = ref(null);

async function refreshLastReadEpisode() {
  if (!selectedItem.value) { lastReadEpisode.value = null; return; }
  try {
    const history = await db.readHistory
      .where('seriesId').equals(selectedItem.value.id)
      .toArray();
    if (!history.length) { lastReadEpisode.value = null; return; }
    // 가장 최근 읽은 episodeId 찾기
    const latest = history.sort((a, b) => b.lastReadAt.localeCompare(a.lastReadAt))[0];
    const ep = episodes.value.find(e => e.id === latest.episodeId);
    lastReadEpisode.value = ep || null;
  } catch (e) {
    lastReadEpisode.value = null;
  }
}

// episodes가 로드될 때마다 lastReadEpisode 갱신
watch(episodes, () => refreshLastReadEpisode(), { immediate: true });

/**
 * [v1.7.4] Persistent Cache Garbage Collection
 * Keeps only the last 5 episodes in IndexedDB to manage storage space.
 */
async function cleanupEpisodeData() {
  try {
    const all = await db.episodeData.orderBy('cachedAt').reverse().toArray();
    if (all.length > 5) {
      const toDelete = all.slice(5);
      const ids = toDelete.map(item => item.fileId);
      await db.episodeData.bulkDelete(ids);
      console.log(`[Cache:GC] Removed ${ids.length} old episodes from persistent storage.`);
    }
  } catch (err) {
    console.warn('[Cache:GC] Failed to cleanup episode data:', err);
  }
}

async function loadOfflineCacheInfo() {
  try {
    const dataRecords = await db.episodeData.toArray();
    let total = 0;
    const list = [];

    const epCaches = await db.episodeCache.toArray();
    const epCacheMap = new Map(epCaches.map(e => [e.id, e]));

    const libCache = await db.libraryCache.get('default');
    const seriesMap = new Map(libCache?.data?.map(s => [s.id, s]) || []);

    for (const record of dataRecords) {
      const size = record.bytes ? record.bytes.length : 0;
      total += size;

      const epMeta = epCacheMap.get(record.fileId);
      const seriesMeta = seriesMap.get(record.seriesId);

      list.push({
        fileId: record.fileId,
        seriesId: record.seriesId,
        seriesTitle: seriesMeta?.title || seriesMeta?.name || 'Unknown Series',
        episodeTitle: epMeta?.name || epMeta?.title || record.fileId,
        size: size,
        cachedAt: record.cachedAt
      });
    }

    cachedEpisodesList.value = list.sort((a, b) => b.cachedAt - a.cachedAt);
    cachedTotalSize.value = total;
    console.log(`[Store] Offline Cache Loaded. Total size: ${total} bytes, count: ${list.length}`);
  } catch (e) {
    console.warn('[Store] Failed to load offline cache info:', e);
  }
}

async function deleteEpisodeCache(fileId) {
  try {
    await db.episodeData.delete(fileId);
    notify('🗑️ 캐시를 성공적으로 삭제했습니다.');
    await loadOfflineCacheInfo();
  } catch (e) {
    console.warn('[Store] Failed to delete episode cache:', e);
    notify('❌ 캐시 삭제 실패');
  }
}

async function clearAllEpisodeCaches() {
  try {
    await db.episodeData.clear();
    notify('🗑️ 전체 오프라인 캐시를 삭제했습니다.');
    await loadOfflineCacheInfo();
  } catch (e) {
    console.warn('[Store] Failed to clear all caches:', e);
    notify('❌ 캐시 전체 삭제 실패');
  }
}

const filteredLibrary = computed(() => {
  const list = libraryItems.value.filter(item => {
    const cat = item.category || (item.metadata ? item.metadata.category : 'Unknown');
    const matchTab = currentTab.value === 'all' || cat.toLowerCase() === currentTab.value;
    const name = item.name || item.title || '';
    return matchTab && !name.startsWith('_') && name.toLowerCase().includes(searchQuery.value.toLowerCase());
  });

  if (librarySortMode.value === 'recent') {
    return list.slice().sort((a, b) => {
      const timeA = seriesLastReadMap.value[a.id] || '';
      const timeB = seriesLastReadMap.value[b.id] || '';
      if (timeA && timeB) return timeB.localeCompare(timeA);
      if (timeA) return -1;
      if (timeB) return 1;
      // Default to alphabetical if neither read
      const nameA = a.name || a.title || '';
      const nameB = b.name || b.title || '';
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
  } else if (librarySortMode.value === 'update') {
    return list.slice().sort((a, b) => {
      const timeA = a.lastUpdated || a.created || a.modifiedTime || '';
      const timeB = b.lastUpdated || b.created || b.modifiedTime || '';
      if (timeA && timeB) return timeB.localeCompare(timeA);
      if (timeA) return -1;
      if (timeB) return 1;
      const nameA = a.name || a.title || '';
      const nameB = b.name || b.title || '';
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
  } else {
    // alphabetical
    return list.slice().sort((a, b) => {
      const nameA = a.name || a.title || '';
      const nameB = b.name || b.title || '';
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }
});

const totalPages = computed(() => {
  if (!viewerContent.value) return 1;
  if (viewerContent.value.type === 'images') {
    // In spread mode, use slot count
    if (viewerDefaults.spread && pageSlots.value.length > 0) {
      return pageSlots.value.length;
    }
    return viewerContent.value.images.length;
  }
  if (viewerContent.value.type === 'text') return novelPageCount.value;
  return 1;
});

// --- Build Page Slots ---
function isWideImage(dim) {
  return dim && dim.w > 0 && dim.h > 0 && dim.w > dim.h * 1.2;
}

function buildPageSlots() {
  const content = viewerContent.value;
  if (!content || content.type !== 'images') {
    pageSlots.value = [];
    return;
  }

  const { calculateSlots } = useSpread();
  const imagesWithDims = content.images.map((url, i) => ({
    url,
    width: content.dimensions?.[i]?.w || 0,
    height: content.dimensions?.[i]?.h || 0,
    originalIndex: i // [오류 6 수정] index 역추적을 위해 보존
  }));

  const slots = calculateSlots(imagesWithDims, {
    spread: viewerDefaults.spread,
    rtl: viewerDefaults.rtl,
    coverFirst: viewerDefaults.coverFirst
  });

  // Map to the internal slot structure { type, pages: [indices] }
  pageSlots.value = slots.map(slot => {
    let type = 'single';
    if (slot.length > 1) type = 'pair';
    else if (slot[0].width > slot[0].height * 1.15) type = 'spread';
    
    // [오류 6 수정] indexOf 대신 originalIndex 사용
    const indices = slot.map(s => s.originalIndex);
    return { type, pages: indices };
  });

  currentSlotIndex.value = 0;
  currentPage.value = 1;
}

// --- Novel Content (from EPUB text) ---
const fullNovelContent = computed(() => {
  if (viewerContent.value && viewerContent.value.type === 'text') return viewerContent.value.content;
  return '';
});

// --- Novel Settings Methods ---
const setNovelTheme = (theme) => {
  novelSettings.theme = theme;
  localStorage.setItem('TOKI_NOVEL_THEME', theme);
};

const adjustFontSize = (delta) => {
  const next = novelSettings.fontSize + delta;
  if (next >= 16 && next <= 40) {
    novelSettings.fontSize = next;
    localStorage.setItem('TOKI_NOVEL_FONT_SIZE', String(next));
  }
};

const setLineHeight = (value) => {
  novelSettings.lineHeight = value;
  localStorage.setItem('TOKI_NOVEL_LINE_HEIGHT', String(value));
};

const toggleNovelSpread = () => {
  novelSettings.spread = !novelSettings.spread;
  localStorage.setItem('TOKI_NOVEL_SPREAD', novelSettings.spread ? '1' : '0');
};

// Load persisted novel settings
(function loadNovelSettings() {
  const t = localStorage.getItem('TOKI_NOVEL_THEME');
  if (t) novelSettings.theme = t;
  const f = localStorage.getItem('TOKI_NOVEL_FONT_SIZE');
  if (f) novelSettings.fontSize = parseInt(f, 10);
  const l = localStorage.getItem('TOKI_NOVEL_LINE_HEIGHT');
  if (l) novelSettings.lineHeight = parseFloat(l);
  const s = localStorage.getItem('TOKI_NOVEL_SPREAD');
  if (s) novelSettings.spread = s === '1';
  const m = localStorage.getItem('TOKI_NOVEL_LAST_MODE');
  if (m) novelSettings.lastMode = m;
})();

// --- Methods ---
const notify = (msg) => {
    if (notifyTimerId) clearTimeout(notifyTimerId);
    notification.value = msg;
    notifyTimerId = setTimeout(() => {
        notification.value = '';
        notifyTimerId = null;
    }, 3000);
};

const forceCloudSync = () => {
  isSyncing.value = true;
  setTimeout(() => isSyncing.value = false, 2000);
};

/**
 * Save cloud config from SettingsPanel (Standalone mode)
 * Syncs local config reactive to gasConfig via setConfig
 */
const saveCloudConfig = () => {
  const url = config.deploymentId.trim();
  const folderId = config.folderId.trim();
  const apiKey = config.apiKey.trim();
  if (!url || !folderId) {
    notify('⚠️ GAS URL과 Drive Folder ID는 필수입니다.');
    return;
  }
  setConfig(url, folderId, apiKey);
  notify('✅ 설정이 저장되었습니다. 라이브러리를 새로고침합니다...');
  refreshLibrary();
};

/**
 * [v1.21.0] 시리즈 폴더의 메타데이터를 저장 및 업데이트하고 로컬 캐시를 즉시 갱신합니다.
 */
const saveSeriesMetadata = async (seriesId, metadata, thumbnailBase64 = null) => {
  isSyncing.value = true;
  try {
    let finalThumbnailId = metadata.thumbnailId || '';
    
    // 1. 썸네일 파일 업로드가 있는 경우
    if (thumbnailBase64) {
      notify('📤 썸네일 업로드 중...');
      const uploadRes = await uploadThumbnail(seriesId, thumbnailBase64);
      if (uploadRes && uploadRes.thumbnailId) {
        finalThumbnailId = uploadRes.thumbnailId;
      }
    }
    
    // 2. 메타데이터 업데이트 API 전송
    notify('💾 메타데이터 저장 중...');
    const updatedMeta = await updateMetadata(seriesId, {
      ...metadata,
      thumbnailId: finalThumbnailId
    });
    
    if (updatedMeta) {
      // 3. 로컬 Dexie libraryCache 데이터 즉각 갱신
      const cached = await db.libraryCache.get('default');
      if (cached && Array.isArray(cached.data)) {
        const idx = cached.data.findIndex(s => s.id === seriesId);
        if (idx !== -1) {
          cached.data[idx] = {
            ...cached.data[idx],
            name: updatedMeta.name,
            category: updatedMeta.category,
            thumbnailId: updatedMeta.thumbnailId,
            thumbnail: updatedMeta.thumbnail,
            lastModified: updatedMeta.lastUpdated,
            metadata: {
              ...cached.data[idx].metadata,
              category: updatedMeta.category,
              status: updatedMeta.status,
              authors: updatedMeta.author ? [updatedMeta.author] : [],
              summary: updatedMeta.summary
            }
          };
          await db.libraryCache.put(cached);
          libraryItems.value = cached.data;
        }
      }
      
      // selectedItem이 일치하면 이것도 업데이트
      if (selectedItem.value && selectedItem.value.id === seriesId) {
        selectedItem.value = {
          ...selectedItem.value,
          name: updatedMeta.name,
          title: updatedMeta.name,
          category: updatedMeta.category,
          thumbnailId: updatedMeta.thumbnailId,
          thumbnail: updatedMeta.thumbnail
        };
      }
      
      notify('✅ 메타데이터 저장이 완료되었습니다.');
    }
  } catch (e) {
    console.error('[Store] Failed to save metadata:', e);
    notify(`❌ 저장 실패: ${e.message}`);
  } finally {
    isSyncing.value = false;
  }
};

/**
 * Initialize the app: setup Bridge, load config, fetch library
 */
// --- Read History Helpers ---

/**
 * 로컬(Dexie)과 원격(Drive) 이력을 merge
 * 동일 episodeId는 lastReadAt이 최신인 것을 채택
 */
function mergeHistory(local, remote) {
  const map = new Map();
  for (const entry of remote) map.set(entry.episodeId, entry);
  for (const entry of local) {
    const existing = map.get(entry.episodeId);
    if (!existing || entry.lastReadAt > existing.lastReadAt) {
      map.set(entry.episodeId, entry);
    }
  }
  return [...map.values()];
}

/** Drive에서 이력 pull → 로컬과 merge → Dexie 저장 */
async function syncHistoryFromDrive() {
  if (!isConfigured()) return;
  try {
    const remote = await getReadHistory();
    if (!Array.isArray(remote)) {
      await updateSeriesLastReadMap();
      return;
    }
    const local = await db.readHistory.toArray();
    const merged = mergeHistory(local, remote);
    await db.readHistory.bulkPut(merged);
    await saveReadHistory(merged);
    console.log(`[History] Drive sync 완료: ${merged.length}개`);
  } catch (e) {
    console.warn('[History] Drive pull 실패 (로컬 이력 사용):', e);
  } finally {
    await updateSeriesLastReadMap();
  }
}

/** 
 * Dexie 이력 전체를 Drive에 push하기 전,
 * 다른 기기/브라우저에서의 변경사항을 덮어쓰는 동기화 소실을 막고자
 * 항상 서버 상태를 먼저 Pull & Merge 한 뒤 업로드합니다.
 */
async function pushHistoryToDrive() {
  if (!isConfigured()) return;
  // 기존의 맹목적인 로컬 전체 덮어쓰기를 선 병합(Merge) 루틴으로 리다이렉트
  await syncHistoryFromDrive();
}

const initApp = async () => {
  isInitialLoading.value = true;

  // 0. Sync gasConfig (loaded from localStorage) → config reactive so SettingsPanel shows saved values
  config.deploymentId = gasConfig.gasId;
  config.folderId = gasConfig.folderId;
  config.apiKey = gasConfig.apiKey;

  // 1. Setup Bridge (Zero-Config listener)
  initBridge((url, folderId, apiKey) => {
    // Sync config reactive so SettingsPanel reflects the injected values
    config.deploymentId = url;
    config.folderId = folderId;
    config.apiKey = apiKey;
    setConfig(url, folderId, apiKey);
    notify('⚡️ 자동 설정 완료! (Zero-Config)');
    refreshLibrary();
  });

  // 2. Check if already configured
  if (isConfigured()) {
    notify('🚀 저장된 설정으로 연결합니다...');
    await refreshLibrary();
    
    // [v1.8.0] 구형 GAS 서버 감지 및 안내 (백그라운드 체크)
    (async () => {
      try {
        const info = await request('get_server_info', {});
        console.log('[Store:ServerInfo]', info);
        if (info && info.version) {
          const verStr = info.version.replace(/^v/, ''); // 'v1.8.0' -> '1.8.0'
          const [svMajor, svMinor, svPatch] = verStr.split('.').map(Number);
          const [rcMajor, rcMinor, rcPatch] = RECOMMENDED_SERVER_VERSION.split('.').map(Number);
          
          if (svMajor < rcMajor || (svMajor === rcMajor && svMinor < rcMinor)) {
            needsServerUpdate.value = true;
          }
        } else {
          // get_server_info가 없거나 응답이 이상한 경우 (매우 구형)
          needsServerUpdate.value = true;
        }
      } catch (e) {
        console.warn('[Store:VersionCheck] Failed:', e);
        // Unknown type 에러 등이 발생하면 구형 서버로 판단
        if (e.message?.includes('Unknown type') || e.message?.includes('not found')) {
          needsServerUpdate.value = true;
        }
      }
    })();

    // 3. 이력 Drive sync (백그라운드, 실패해도 무시)
    syncHistoryFromDrive().catch(e => console.warn('[History] 초기 sync 실패:', e));
  } else {
    // Wait a bit for potential UserScript injection
    await new Promise(r => setTimeout(r, 1000));
    if (isConfigured()) {
      notify('🚀 저장된 설정으로 연결합니다...');
      await refreshLibrary();
      syncHistoryFromDrive().catch(e => console.warn('[History] 초기 sync 실패:', e));
    } else {
      // No config found — show settings or config modal
      console.log('⚠️ GAS 설정이 필요합니다.');
    }
  }
  await updateSeriesLastReadMap();

  isInitialLoading.value = false;
};

/**
 * Refresh library from GAS
 */
const refreshLibrary = async (bypassCache = false) => {
  isSyncing.value = true;
  try {
    // 1. Dexie 캐시 확인
    if (!bypassCache) {
      const cached = await db.libraryCache.get('default');
      if (cached && !isStale(cached.cachedAt, LIBRARY_TTL)) {
        libraryItems.value = cached.data;
        console.log(`[Cache] 라이브러리 캐시 히트 (${cached.data.length}개)`);
        isSyncing.value = false;
        return;
      }
    }
    // 2. GAS에서 불러오기 + Dexie에 저장
    const seriesList = await getLibrary({ bypassCache });
    libraryItems.value = seriesList;
    await db.libraryCache.put({ id: 'default', data: seriesList, cachedAt: Date.now() });
    notify('📚 라이브러리 업데이트 완료');
  } catch (e) {
    console.error('Library Fetch Error:', e);
    // GAS 실패 시 만료된 캐시라도 사용
    const staleCache = await db.libraryCache.get('default').catch(() => null);
    if (staleCache?.data?.length) {
      libraryItems.value = staleCache.data;
      notify('⚠️ 오프라인: 캐시된 라이브러리 표시 중');
    } else {
      notify(`❌ 로드 실패: ${e.message}`);
    }
  } finally {
    isSyncing.value = false;
  }
};

const openSeries = async (item, bypassCache = false) => {
  selectedItem.value = item;
  currentView.value = 'episodes';
  episodes.value = []; // Clear stale episodes immediately
  cleanupBlobUrls();   // Clear old content cache
  window.scrollTo(0, 0);

  // 에피소드 목록 불러오기 (Dexie 캐시 우선)
  try {
    const localHistory = await db.readHistory.where('seriesId').equals(item.id).toArray();
    const readSet = new Set(localHistory.map(h => h.episodeId));

    const attachMeta = (book) => ({
      ...book,
      seriesId: item.id,
      title: book.name,
      thumbnail: getThumbnailUrl(book),
      isRead: readSet.has(book.id),
    });

    // 에피소드 정렬 (GAS View_BookService와 동일한 기준)
    const sortEpisodes = (arr) => arr.slice().sort((a, b) => {
      const numA = a.number || 0;
      const numB = b.number || 0;
      if (numA === numB) return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      return numA - numB;
    });

    // 1. Dexie 캐시 확인
    const cachedEps = await db.episodeCache.where('seriesId').equals(item.id).toArray();
    if (!bypassCache && cachedEps.length > 0 && !isStale(cachedEps[0].cachedAt, EPISODE_TTL)) {
      console.log(`[Cache] 에피소드 캐시 히트 (${cachedEps.length}개)`);
      episodes.value = sortEpisodes(cachedEps).map(attachMeta);
      return;
    }

    // 2. GAS에서 불러오기 + Dexie에 저장 (GAS가 이미 정렬해서 줌)
    const books = await getBooks(item.id, bypassCache);
    const now = Date.now();
    
    // v1.7.4: 새로고침(bypassCache) 시 기존 로컬 캐시를 먼저 삭제하여 삭제된 파일이 남지 않게 함
    if (bypassCache) {
      await db.episodeCache.where('seriesId').equals(item.id).delete();
    }
    
    await db.episodeCache.bulkPut(
      (books || []).map(b => ({ ...b, seriesId: item.id, cachedAt: now }))
    );
    episodes.value = (books || []).map(attachMeta);

    // [v1.8.1] History Garbage Collection (유령 히스토리 청소)
    try {
      const validEpisodeIds = new Set((books || []).map(b => b.id));
      const ghostHistories = localHistory.filter(h => !validEpisodeIds.has(h.episodeId));
      
      if (ghostHistories.length > 0 && validEpisodeIds.size > 0) { // 방어 로직: 정상적인 에피소드가 1개 이상일 때만 청소 수행
        const ghostIds = ghostHistories.map(h => h.episodeId);
        await db.readHistory.bulkDelete(ghostIds);
        console.log(`🧹 [History:GC] 유령 에피소드 ${ghostIds.length}개 청소 완료 (로컬)`);
        
        // 원격 동기화 파일에서도 유령 데이터 제거
        const remote = await getReadHistory().catch(() => []);
        if (Array.isArray(remote)) {
          const cleanedRemote = remote.filter(r => r.seriesId !== item.id || validEpisodeIds.has(r.episodeId));
          const local = await db.readHistory.toArray();
          const merged = mergeHistory(local, cleanedRemote);
          await db.readHistory.bulkPut(merged);
          saveReadHistory(merged).catch(e => console.warn('[History:GC] 원격 저장 실패', e));
        }
      }
    } catch (gcErr) {
      console.warn('[History:GC] 청소 중 오류 발생:', gcErr);
    }
  } catch (e) {
    console.error('Episode Fetch Error:', e);
    // GAS 실패 시 만료 캐시 사용
    const staleEps = await db.episodeCache.where('seriesId').equals(item.id).toArray().catch(() => []);
    if (staleEps.length > 0) {
      episodes.value = staleEps.map(b => ({ ...b, title: b.name, thumbnail: getThumbnailUrl(b) }));
      notify('⚠️ 오프라인: 캐시된 회차 목록 표시 중');
    } else {
      notify(`❌ 회차 로드 실패: ${e.message}`);
      episodes.value = [];
    }
  }
};

const refreshEpisodes = async () => {
  if (selectedItem.value) {
    isSyncing.value = true;
    try {
      // 1. 구글 드라이브(GAS) 저장소에서 최신 읽음 이력 가져와 로컬 캐시(Dexie)와 병합
      await syncHistoryFromDrive();
      // 2. 병합된 이력을 바탕으로 에피소드 목록 다시 계산하여 그리기 (bypassCache = true)
      await openSeries(selectedItem.value, true);
      notify('✅ 동기화 완료: 이력 및 목록이 갱신되었습니다.');
    } catch (e) {
      console.warn('[History] Manual sync failed:', e);
      notify('❌ 동기화 중 오류가 발생했습니다.');
    } finally {
      isSyncing.value = false;
    }
  }
};

const startReading = async (ep) => {
  // [v2.9.2] 에피소드를 넘기기 전, 기존 에피소드의 진도를 즉시 DB에 강제 저장(Flush)
  if (currentEpisode.value && currentEpisode.value.id !== ep.id) {
    await flushSaveToDB(currentEpisode.value.id);
  }

  resetLocator(); // [v2.9.1] 새 에피소드 열 때 이전 진도(마커) 초기화
  cleanupBlobUrls(); // 이전 에피소드 Blob URL 즉시 해제 (메모리 누수 방지)
  cleanupEpisodeData(); // [v1.7.4] 저장소 용량 관리 가동

  currentEpisode.value = ep;
  currentPage.value = 1;
  showNextEpisodeGuide.value = false; // 안내 화면 초기화
  viewerContent.value = null;

  // Determine viewer mode from category/type
  const type = selectedItem.value?.category || selectedItem.value?.type || '';
  const typeLower = type.toLowerCase();
  if (typeLower === 'webtoon') viewerData.mode = 'scroll';
  else if (typeLower === 'manga') viewerData.mode = 'page';
  else viewerData.mode = novelSettings.lastMode;

  currentView.value = 'viewer';
  showViewerControls.value = false;
  showEpisodeModal.value = false;
  window.scrollTo(0, 0);

  // 열람 이력 기록 (Dexie)
  try {
    const existingHistory = await db.readHistory.get(ep.id);
    if (existingHistory) {
      // Preserve markerIndex and progress, just update timestamp
      await db.readHistory.update(ep.id, {
        lastReadAt: new Date().toISOString()
      });
    } else {
      await db.readHistory.put({
        episodeId: ep.id,
        seriesId: ep.seriesId || selectedItem.value?.id || '',
        lastReadAt: new Date().toISOString(),
        progress: 0,
      });
    }
    // 에피소드 목록에서 isRead 즉시 반영
    const target = episodes.value.find(e => e.id === ep.id);
    if (target) target.isRead = true;
    await refreshLastReadEpisode();
    await updateSeriesLastReadMap();
  } catch (e) {
    console.warn('[History] 로컬 이력 기록 실패:', e);
  }

  // Fetch and unzip the file
  try {
    const result = await fetchAndUnzip(
      ep.id, 
      ep.size || 0, 
      viewerDefaults.downloadThreads, 
      selectedItem.value?.id || ''
    );
    if (!result) return; // Cancelled
    viewerContent.value = result;

    // [v2.2] Novel Text Preparation (Sanitized Array)
    if (result.type === 'text' && typeof result.content === 'string') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(result.content, 'text/html');
      
      // Extract block-level elements
      const rawBlocks = Array.from(doc.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6'));
      
      // Filter out containers that have nested blocks to avoid duplicated text
      // (e.g., if we have <div><p>Text</p></div>, we only want the <p>)
      const leafBlocks = rawBlocks.filter(b => !b.querySelector('p, div, li'));
      
      if (leafBlocks.length > 0) {
        result.paragraphs = leafBlocks
          .map(el => el.textContent.trim())
          .filter(p => p.length > 0);
      } else {
        // Fallback for plain text or very simple HTML
        result.paragraphs = result.content
          .split(/\r?\n/)
          .map(p => p.trim())
          .filter(p => p.length > 0);
      }
      
      console.log(`[V2:Parser] Parsed ${result.paragraphs.length} paragraphs (Leaf-block mode)`);
    }

    // Build page slots for spread mode
    if (result.type === 'images') {
      buildPageSlots();
    }

    // [v2.9-fix] Restore is now handled exclusively by ReaderViewV2's onRendererReady
    // to ensure layout is ready and prevent race conditions.

    // [v1.7.5-fix] 즉시 프리로드 제거 (사용자가 50% 읽었을 때로 지연)
    isPreloadTriggered.value = false;
  } catch (e) {
    console.error('Fetch Error:', e);
    notify(`❌ 콘텐츠 로드 실패: ${e.message}`);
  }
};

const goToNextEpisode = () => {
  if (hasNextEpisode.value) {
    cleanupBlobUrls();
    showNextEpisodeGuide.value = false;
    const nextEp = episodes.value[currentEpisodeIndex.value + 1];
    startReading(nextEp);
    notify(`⏩ ${nextEp.title || nextEp.name}`);
  }
};

const goToPrevEpisode = () => {
  if (hasPrevEpisode.value) {
    cleanupBlobUrls();
    const prevEp = episodes.value[currentEpisodeIndex.value - 1];
    startReading(prevEp);
    notify(`⏪ ${prevEp.title || prevEp.name}`);
  }
};

const exitViewer = async () => {
  // [v2.9.2] 뷰어 종료 시 마지막 위치 즉시 저장
  if (currentEpisode.value) {
    await flushSaveToDB(currentEpisode.value.id);
  }
  await updateSeriesLastReadMap();
  cancelViewerDownload(); // [v1.7.5] 시청 종료 시 뷰어 다운로드 + 프리로드 즉시 중단
  cleanupBlobUrls();
  viewerContent.value = null;
  currentView.value = 'episodes';
  forceCloudSync();
  // Drive에 이력 push (비동기, 실패해도 무시)
  pushHistoryToDrive().catch(e => console.warn('[History] Drive push 실패:', e));
};

const goBackToLibrary = () => {
  currentView.value = 'library';
  forceCloudSync();
};

const toggleViewerUI = () => {
  showViewerControls.value = !showViewerControls.value;
};

const setViewerMode = (mode) => {
  viewerData.mode = mode;
  if (selectedItem.value?.type === 'novel' || selectedItem.value?.category?.toLowerCase() === 'novel') {
    novelSettings.lastMode = mode;
    localStorage.setItem('TOKI_NOVEL_LAST_MODE', mode);
  }
};

const handleWheel = (e) => {
  if (viewerData.mode === 'scroll') {
    const container = document.getElementById('viewer-container');
    if (container) container.scrollTop += e.deltaY;
  }
};

// 스크롤 이벤트 → currentPage 동기화
const onScrollUpdate = () => {
  const container = document.getElementById('viewer-container');
  if (!container) return;
  const { scrollTop, scrollHeight, clientHeight } = container;
  const maxScroll = scrollHeight - clientHeight;
  if (maxScroll <= 0) return;
  const pct = Math.min(scrollTop / maxScroll, 1);
  scrollProgress.value = Math.round(pct * 100);

  // [v2.1] V2 Progress Bridge
  if (viewerDefaults.viewerVersion === 2) {
    // Find locator element near the top (80px offset)
    const elements = document.querySelectorAll('[data-locator]');
    let closestIndex = 0;
    for (const el of elements) {
      if (el.offsetTop >= scrollTop + 70) { // 70-80px range
        closestIndex = parseInt(el.getAttribute('data-locator'), 10);
        break;
      }
    }
    updateLocator(closestIndex);
    saveMarkerToDB(currentEpisode.value?.id);
    // V2에서는 기존 % 기록 로직은 건너뜀
  } else {
    isScrollSyncing.value = true;
    const total = totalPages.value;
    currentPage.value = Math.max(1, Math.min(total, Math.round(pct * (total - 1)) + 1));
  }

  
  // [v1.7.5-fix] 스마트 프리로드: 50% 이상 읽었을 때 딱 한 번만 다음 화 가져오기
  if (pct >= 0.5 && !isPreloadTriggered.value && viewerDefaults.preloadNext && hasNextEpisode.value) {
    const nextEp = episodes.value[currentEpisodeIndex.value + 1];
    if (nextEp) {
      isPreloadTriggered.value = true;
      console.log(`%c[Preload] Triggered at ${Math.round(pct*100)}%`, 'color: #8b5cf6; font-weight: bold;');
      preloadEpisode(
        nextEp.id, nextEp.size || 0, 
        viewerDefaults.downloadThreads, 
        selectedItem.value?.id || ''
      ).catch(err => console.warn("[Preload] Failed:", err));
    }
  }

  // 약간의 지연 후 잠금 해제하여 브라우저 스크롤 안정화
  setTimeout(() => { isScrollSyncing.value = false; }, 100);
};

// 슬라이더(currentPage) 변경 → 스크롤 위치 동기화
watch(currentPage, (newPage) => {
  if (viewerData.mode !== 'scroll') return;
  if (isScrollSyncing.value) return;
  const container = document.getElementById('viewer-container');
  if (!container) return;
  const maxScroll = container.scrollHeight - container.clientHeight;
  if (maxScroll <= 0) return;
  const total = totalPages.value;
  const targetScroll = ((newPage - 1) / Math.max(1, total - 1)) * maxScroll;
  
  // [v1.7.5-fix] 위치 가드: 이미 해당 위치 근처라면 스크롤 건너뛰기 (무한 루프 방지)
  if (Math.abs(container.scrollTop - targetScroll) < 20) return;

  container.scrollTo({ top: targetScroll, behavior: 'auto' });
});

const next = (immediate = false) => {
  if (viewerData.mode === 'scroll') {
    const container = document.getElementById('viewer-container');
    container.scrollBy({ top: window.innerHeight * 0.8, behavior: immediate ? 'auto' : 'smooth' });
  } else if (viewerContent.value?.type === 'text') {
    // Novel page mode
    if (novelCurrentPage.value < novelPageCount.value - 1) {
      novelCurrentPage.value++;
      currentPage.value = novelCurrentPage.value + 1;
    } else {
      // 소설도 마지막 페이지에서 안내 화면 표시
      showNextEpisodeGuide.value = true;
    }
  } else if (viewerDefaults.spread && pageSlots.value.length > 0) {
    // Slot-based navigation
    if (currentSlotIndex.value < pageSlots.value.length - 1) {
      currentSlotIndex.value++;
      currentPage.value = currentSlotIndex.value + 1;
    } else {
      showNextEpisodeGuide.value = true;
    }
  } else {
    // Single page mode
    if (currentPage.value < totalPages.value) currentPage.value++;
    else showNextEpisodeGuide.value = true;
  }
};

const prev = (immediate = false) => {
  // 안내 화면에서 뒤로가면 마지막 페이지로 복귀
  if (showNextEpisodeGuide.value) {
    showNextEpisodeGuide.value = false;
    return;
  }
  if (viewerData.mode === 'scroll') {
    const container = document.getElementById('viewer-container');
    container.scrollBy({ top: -window.innerHeight * 0.8, behavior: immediate ? 'auto' : 'smooth' });
  } else if (viewerContent.value?.type === 'text') {
    // Novel page mode
    if (novelCurrentPage.value > 0) {
      novelCurrentPage.value--;
      currentPage.value = novelCurrentPage.value + 1;
    } else {
      notify('첫 페이지입니다.');
    }
  } else if (viewerDefaults.spread && pageSlots.value.length > 0) {
    // Slot-based navigation
    if (currentSlotIndex.value > 0) {
      currentSlotIndex.value--;
      currentPage.value = currentSlotIndex.value + 1;
    } else {
      notify('첫 페이지입니다.');
    }
  } else {
    // Single page mode
    if (currentPage.value > 1) currentPage.value--;
    else notify('첫 페이지입니다.');
  }
};

const handleNext = (immediate = false) => {
  next(immediate);
};

const handlePrev = (immediate = false) => {
  prev(immediate);
};


const deleteItem = () => {
  currentView.value = 'library';
  notify('Collection Removed');
};

const reloadApp = () => window.location.reload();

// Rebuild page slots when spread/coverFirst settings change
watch(
  () => [viewerDefaults.spread, viewerDefaults.coverFirst, viewerDefaults.rtl],
  () => {
    if (viewerContent.value?.type === 'images') {
      buildPageSlots();
    }
  }
);

// [v2.7] Page Mode Progress Bridge
// Whenever slot, novel page, or single page changes, update the locator
watch([currentSlotIndex, novelCurrentPage, currentPage], () => {
  if (viewerDefaults.viewerVersion !== 2) return;
  if (viewerData.mode === 'scroll') return;
  if (isRestoring.value) return; // [v2.9-fix] 복구 중에는 UI 초기값에 의한 덮어쓰기 방지

  // For images
  if (viewerContent.value?.type === 'images') {
    if (viewerDefaults.spread && pageSlots.value[currentSlotIndex.value]) {
      const firstImgInSlot = pageSlots.value[currentSlotIndex.value].pages[0];
      updateLocator(firstImgInSlot);
    } else if (!viewerDefaults.spread) {
      updateLocator(currentPage.value - 1);
    }
  } 
  // For novel text, precise paragraph mapping based on current page
  else if (viewerContent.value?.type === 'text') {
    // [v2.9] DOM 기반 정확한 저장 로직: 현재 화면(Column)에 들어와 있는 첫 번째 문단 찾기
    const container = document.querySelector('.v2-text-renderer.page');
    let foundIndex = -1;
    
    if (container && container.clientWidth > 0) {
      const targetOffsetLeft = novelCurrentPage.value * container.clientWidth;
      const elements = container.querySelectorAll('[data-locator]');
      for (const el of elements) {
        // 요소의 가로 위치가 현재 페이지의 시작점보다 크거나 같으면, 그 요소가 페이지의 첫 요소임
        if (el.offsetLeft >= targetOffsetLeft) {
          foundIndex = parseInt(el.getAttribute('data-locator'), 10);
          break;
        }
      }
    }
    
    if (foundIndex !== -1) {
      updateLocator(foundIndex);
    } else {
      // DOM을 못 찾은 경우 Fallback (Heuristic)
      const totalParas = viewerContent.value.paragraphs?.length || 0;
      const totalPages = novelPageCount.value || 1;
      if (totalParas > 0 && totalPages > 0) {
        const approxPara = Math.floor((novelCurrentPage.value / totalPages) * totalParas);
        updateLocator(approxPara);
      }
    }
  }
  
  saveMarkerToDB(currentEpisode.value?.id);
});

// Sync slider → slot index (when user drags slider in spread mode)
watch(currentPage, (newPage) => {
  if (viewerDefaults.spread && pageSlots.value.length > 0 && viewerContent.value?.type === 'images') {
    const idx = Math.max(0, Math.min(newPage - 1, pageSlots.value.length - 1));
    if (idx !== currentSlotIndex.value) {
      currentSlotIndex.value = idx;
    }
  }
});

// --- Composable Export ---
export function useStore() {
  return {
    // UI State
    currentView, showSettings, showViewerControls, showEpisodeModal,
    showDownloadManager, isAddModalOpen,
    isInitialLoading, isSyncing, notification, needsServerUpdate,

    // Config & Settings
    config, gasConfig, viewerDefaults, viewerData, novelSettings, librarySortMode,

    // Global Theme
    appTheme, toggleTheme,

    // Data
    searchQuery, currentTab, tabs,
    libraryItems, filteredLibrary, selectedItem,
    episodes, currentEpisode, currentEpisodeIndex,
    currentPage, scrollProgress, totalPages,
    lastReadEpisode,

    // Viewer Content
    viewerContent, downloadProgress, isDownloading,

    // Episode Nav Computed
    hasNextEpisode, hasPrevEpisode,
    nextEpisodeData, showNextEpisodeGuide,

    // Novel Content & Pagination
    fullNovelContent,
    novelPageCount, novelCurrentPage,
    setNovelTheme, adjustFontSize, setLineHeight, toggleNovelSpread,

    // Smart Page Grouping
    pageSlots, currentSlotIndex, buildPageSlots,

    // Bridge
    isConnected, bridgeFetch,

    // GAS
    isConfigured, setConfig, refreshLibrary,

    // Thumbnail
    getThumbnailUrl, NO_IMAGE_SVG,

    // Fetcher
    cleanupBlobUrls, formatSize,

    // Methods
    notify, forceCloudSync, saveCloudConfig, initApp,
    cachedEpisodesList, cachedTotalSize, loadOfflineCacheInfo, deleteEpisodeCache, clearAllEpisodeCaches, saveSeriesMetadata,
    openSeries, refreshEpisodes, startReading, exitViewer, goBackToLibrary,
    goToNextEpisode, goToPrevEpisode,
    toggleViewerUI, setViewerMode,
    handleWheel, handleNext, handlePrev, next, prev, onScrollUpdate,
    deleteItem, reloadApp, cancelViewerDownload,
  };
}
