import { ref, reactive, computed, watch } from 'vue';
import Dexie from 'dexie';
import { useBridge } from './useBridge.js';
import { useGAS } from './useGAS.js';
import { useFetcher } from './useFetcher.js';

// --- Dexie.js (Offline-First Cache) ---
const db = new Dexie('ViewerHubDB');
db.version(1).stores({ library: '++id, title, type, fileId, progress' });

// --- Sub-Composables ---
const { isConnected, initBridge, bridgeFetch } = useBridge();
const { gasConfig, setConfig, isConfigured, getLibrary, getBooks } = useGAS();
const { downloadProgress, isDownloading, fetchAndUnzip, cleanupBlobUrls, formatSize } = useFetcher();

// --- Singleton State ---
const currentView = ref('library');
const showSettings = ref(false);
const showViewerControls = ref(false);
const isAddModalOpen = ref(false);
const showEpisodeModal = ref(false);
const isInitialLoading = ref(true);
const isSyncing = ref(false);
const notification = ref('');

const config = reactive({ deploymentId: '', apiKey: '', folderId: '' });
const viewerDefaults = reactive({ spread: true, rtl: false, coverFirst: true });
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

const libraryItems = ref([]);
const selectedItem = ref(null);
const currentEpisode = ref(null);
const currentPage = ref(1);
const scrollProgress = ref(0);
const isScrollSyncing = ref(false);
const newItem = reactive({ title: '', type: 'webtoon', fileId: '' });

// Episode list (fetched from GAS)
const episodes = ref([]);

// Viewer content (populated by useFetcher after unzip)
const viewerContent = ref(null); // { type: 'images', images: [] } or { type: 'text', content: '' }

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

const filteredLibrary = computed(() => libraryItems.value.filter(item => {
  const cat = item.category || (item.metadata ? item.metadata.category : 'Unknown');
  const matchTab = currentTab.value === 'all' || cat.toLowerCase() === currentTab.value;
  const name = item.name || item.title || '';
  return matchTab && name.toLowerCase().includes(searchQuery.value.toLowerCase());
}));

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

  const images = content.images;
  const dims = content.dimensions || [];
  const slots = [];
  let i = 0;

  // Cover First: first image always single
  if (viewerDefaults.coverFirst && images.length > 0) {
    slots.push({ type: 'single', pages: [i++] });
  }

  while (i < images.length) {
    const wideI = isWideImage(dims[i]);

    if (wideI) {
      // Wide image → spread slot (single full-width)
      slots.push({ type: 'spread', pages: [i++] });
    } else if (i + 1 < images.length) {
      const wideNext = isWideImage(dims[i + 1]);
      if (wideNext) {
        // Next is wide → current goes single, next will be spread on next iteration
        slots.push({ type: 'single', pages: [i++] });
      } else {
        // Both normal → pair
        slots.push({ type: 'pair', pages: [i, i + 1] });
        i += 2;
      }
    } else {
      // Last remaining image → single
      slots.push({ type: 'single', pages: [i++] });
    }
  }

  pageSlots.value = slots;
  // Sync currentPage to slot
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
})();

// --- Methods ---
const notify = (msg) => {
  notification.value = msg;
  setTimeout(() => notification.value = '', 3000);
};

const forceCloudSync = () => {
  isSyncing.value = true;
  setTimeout(() => isSyncing.value = false, 2000);
};

/**
 * Initialize the app: setup Bridge, load config, fetch library
 */
const initApp = async () => {
  isInitialLoading.value = true;

  // 1. Setup Bridge (Zero-Config listener)
  initBridge((url, folderId, apiKey) => {
    setConfig(url, folderId, apiKey);
    notify('⚡️ 자동 설정 완료! (Zero-Config)');
    refreshLibrary();
  });

  // 2. Check if already configured
  if (isConfigured()) {
    notify('🚀 저장된 설정으로 연결합니다...');
    await refreshLibrary();
  } else {
    // Wait a bit for potential UserScript injection
    await new Promise(r => setTimeout(r, 1000));
    if (isConfigured()) {
      notify('🚀 저장된 설정으로 연결합니다...');
      await refreshLibrary();
    } else {
      // No config found — show settings or config modal
      console.log('⚠️ GAS 설정이 필요합니다.');
    }
  }

  isInitialLoading.value = false;
};

/**
 * Refresh library from GAS
 */
const refreshLibrary = async (bypassCache = false) => {
  isSyncing.value = true;
  try {
    const seriesList = await getLibrary({ bypassCache });
    libraryItems.value = seriesList;
    notify('📚 라이브러리 업데이트 완료');
  } catch (e) {
    console.error('Library Fetch Error:', e);
    notify(`❌ 로드 실패: ${e.message}`);
  } finally {
    isSyncing.value = false;
  }
};

const openSeries = async (item) => {
  selectedItem.value = item;
  currentView.value = 'episodes';
  episodes.value = []; // Clear stale episodes immediately
  cleanupBlobUrls();   // Clear old content cache
  window.scrollTo(0, 0);

  // Fetch episodes from GAS
  try {
    const books = await getBooks(item.id);
    episodes.value = (books || []).map(book => ({
      ...book,
      seriesId: item.id,
      title: book.name,
      thumbnail: getThumbnailUrl(book),
      isRead: false, // TODO: check read history
    }));
  } catch (e) {
    console.error('Episode Fetch Error:', e);
    notify(`❌ 회차 로드 실패: ${e.message}`);
    episodes.value = [];
  }
};

const startReading = async (ep) => {
  currentEpisode.value = ep;
  currentPage.value = 1;
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

  // Fetch and unzip the file
  try {
    const result = await fetchAndUnzip(ep.id, ep.size || 0);
    viewerContent.value = result;

    // If text EPUB, switch to appropriate mode
    if (result.type === 'text') {
      viewerData.mode = novelSettings.lastMode;
    }

    // Build page slots for spread mode
    if (result.type === 'images') {
      buildPageSlots();
    }
  } catch (e) {
    console.error('Fetch Error:', e);
    notify(`❌ 콘텐츠 로드 실패: ${e.message}`);
  }
};

const goToNextEpisode = () => {
  if (hasNextEpisode.value) {
    cleanupBlobUrls();
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

const exitViewer = () => {
  cleanupBlobUrls();
  viewerContent.value = null;
  currentView.value = 'episodes';
  forceCloudSync();
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

  isScrollSyncing.value = true;
  const total = totalPages.value;
  currentPage.value = Math.max(1, Math.min(total, Math.round(pct * (total - 1)) + 1));
  Promise.resolve().then(() => { isScrollSyncing.value = false; });
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
  container.scrollTo({ top: targetScroll, behavior: 'smooth' });
});

const next = () => {
  if (viewerData.mode === 'scroll') {
    const container = document.getElementById('viewer-container');
    container.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
  } else if (viewerContent.value?.type === 'text') {
    // Novel page mode
    if (novelCurrentPage.value < novelPageCount.value - 1) {
      novelCurrentPage.value++;
      currentPage.value = novelCurrentPage.value + 1;
    } else {
      notify('마지막 페이지입니다.');
    }
  } else if (viewerDefaults.spread && pageSlots.value.length > 0) {
    // Slot-based navigation
    if (currentSlotIndex.value < pageSlots.value.length - 1) {
      currentSlotIndex.value++;
      currentPage.value = currentSlotIndex.value + 1;
    } else {
      notify('마지막 페이지입니다.');
    }
  } else {
    // Single page mode
    if (currentPage.value < totalPages.value) currentPage.value++;
    else notify('마지막 페이지입니다.');
  }
};

const prev = () => {
  if (viewerData.mode === 'scroll') {
    const container = document.getElementById('viewer-container');
    container.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
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

const handleNext = () => {
  if (viewerDefaults.rtl) { prev(); return; }
  next();
};

const handlePrev = () => {
  if (viewerDefaults.rtl) { next(); return; }
  prev();
};

const addNewItem = () => {
  isAddModalOpen.value = false;
  notify('Deployment to Cloud Successful');
};

const deleteItem = () => {
  currentView.value = 'library';
  notify('Collection Removed');
};

const reloadApp = () => window.location.reload();

// Rebuild page slots when spread/coverFirst settings change
watch(
  () => [viewerDefaults.spread, viewerDefaults.coverFirst],
  () => {
    if (viewerContent.value?.type === 'images') {
      buildPageSlots();
    }
  }
);

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
    currentView, showSettings, showViewerControls, isAddModalOpen, showEpisodeModal,
    isInitialLoading, isSyncing, notification,

    // Config & Settings
    config, gasConfig, viewerDefaults, viewerData, novelSettings,

    // Data
    searchQuery, currentTab, tabs,
    libraryItems, filteredLibrary, selectedItem,
    episodes, currentEpisode, currentEpisodeIndex,
    currentPage, scrollProgress, totalPages, newItem,

    // Viewer Content
    viewerContent, downloadProgress, isDownloading,

    // Episode Nav Computed
    hasNextEpisode, hasPrevEpisode,

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
    notify, forceCloudSync, initApp,
    openSeries, startReading, exitViewer, goBackToLibrary,
    goToNextEpisode, goToPrevEpisode,
    toggleViewerUI, setViewerMode,
    handleWheel, handleNext, handlePrev, onScrollUpdate,
    addNewItem, deleteItem, reloadApp,
  };
}
