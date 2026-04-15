<template>
  <main class="fixed inset-0 z-[3000] bg-black overflow-hidden flex flex-col items-center reader-main">

    <!-- Download Progress Overlay -->
    <transition name="fade">
      <div v-if="isDownloading" class="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center text-white">
        <div class="w-16 h-16 border-4 border-zinc-800 border-t-blue-500 rounded-full animate-spin mb-8"></div>
        <p class="text-sm font-bold text-zinc-400 tracking-wider uppercase mb-8">{{ downloadProgress || '준비 중...' }}</p>
        <button @click="exitViewer" class="px-8 py-3 bg-red-500/20 hover:bg-red-500/40 text-red-500 border border-red-500/50 rounded-2xl text-sm font-black transition-all uppercase tracking-widest">
          취소하고 나가기
        </button>
      </div>
    </transition>

    <!-- Floating Header -->
    <transition name="fade">
      <div v-if="showViewerControls" class="fixed top-4 inset-x-4 md:top-8 md:inset-x-8 z-[100] glass-controls p-3 md:p-6 rounded-2xl md:rounded-[32px] flex justify-between items-center shadow-2xl reader-header-safe viewer-toolbar">
        <button @click="exitViewer" class="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 flex items-center justify-center hover:bg-white/10 rounded-full transition-all">
          <svg class="w-6 h-6 md:w-7 md:h-7 viewer-toolbar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7"></path></svg>
        </button>

        <div class="flex-1 min-w-0 px-2 md:px-4 flex items-center justify-center space-x-3 md:space-x-6">
          <!-- 이전 에피소드 -->
          <button @click.stop="goToPrevEpisode" :disabled="!hasPrevEpisode"
                  class="flex-shrink-0 p-2 hover:bg-white/10 rounded-full transition-all disabled:opacity-20" title="이전 화">
            <svg class="w-4 h-4 md:w-5 md:h-5 viewer-toolbar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7"></path></svg>
          </button>

          <div class="min-w-0 overflow-hidden text-center">
            <p class="text-[8px] md:text-[9px] font-black tracking-[0.3em] md:tracking-[0.5em] uppercase text-blue-500 mb-0.5 truncate">{{ selectedItem?.name || selectedItem?.title }}</p>
            <p class="text-xs md:text-sm font-black viewer-toolbar-title uppercase tracking-tighter truncate">{{ currentEpisode?.name || currentEpisode?.title }}</p>
          </div>

          <!-- 다음 에피소드 -->
          <button @click.stop="goToNextEpisode" :disabled="!hasNextEpisode"
                  class="flex-shrink-0 p-2 hover:bg-white/10 rounded-full transition-all disabled:opacity-20" title="다음 화">
            <svg class="w-4 h-4 md:w-5 md:h-5 viewer-toolbar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>

        <!-- 에피소드 목록 -->
        <button @click.stop="showEpisodeModal = true" class="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl md:rounded-[20px] transition-all" title="에피소드 목록">
          <svg class="w-5 h-5 md:w-6 md:h-6 viewer-toolbar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </button>
      </div>
    </transition>

    <!-- nav-zone 제거됨: useViewerInput.js가 마우스/터치 입력을 직접 처리 -->

    <!-- Engine Viewport -->
    <div id="viewer-container" class="viewer-content w-full h-full overflow-y-auto no-scrollbar flex flex-col items-center"
         :class="[viewerData.mode === 'scroll' ? 'overflow-y-auto' : 'overflow-hidden', isNovelMode ? `theme-${novelSettings.theme}` : 'bg-black']"
         @scroll.passive="onScrollUpdate"
         @wheel.passive="handleWheel">

      <!-- No Content State -->
      <div v-if="!viewerContent && !isDownloading" class="flex items-center justify-center h-full text-zinc-600">
        <p>콘텐츠를 불러오지 못했습니다.</p>
      </div>

      <!-- Image Content -->
      <template v-if="viewerContent?.type === 'images'">

        <!-- Scroll Mode -->
        <div v-if="viewerData.mode === 'scroll'" class="max-w-4xl w-full">
          <div v-for="(src, i) in viewerContent.images" :key="i" 
               class="w-full relative"
               :style="{ aspectRatio: aspectRatioMap[i] || 'auto', minHeight: aspectRatioMap[i] ? 'auto' : '800px' }"
               :ref="el => { if (el && viewerDefaults.virtualScroll) observeElement(el); }"
               :data-index="i">
            
            <!-- Render if Virtual Scroll is OFF OR if current image is visible -->
            <img v-if="!viewerDefaults.virtualScroll || isVisible(i)" :src="src"
                 @load="onImageLoaded(i, src, $event)"
                 class="w-full h-auto block select-none shadow-2xl transition-opacity duration-300">
            
            <!-- Placeholder for virtual scroll -->
            <div v-else-if="viewerDefaults.virtualScroll" class="absolute inset-0 flex items-center justify-center bg-zinc-900/10">
              <div class="w-8 h-8 border-2 border-zinc-800 border-t-zinc-600 rounded-full animate-spin"></div>
            </div>
          </div>
          <!-- End of Chapter: 다음 화 안내 인라인 섹션 -->
          <div class="next-ep-guide">
            <p class="next-ep-guide-label">End of Chapter</p>
            <div v-if="nextEpisodeData" class="next-ep-guide-content">
              <img :src="nextEpisodeData.thumbnail" class="next-ep-thumb">
              <p class="next-ep-title">{{ nextEpisodeData.name || nextEpisodeData.title }}</p>
              <div class="next-ep-actions">
                <button @click="goToNextEpisode" class="next-ep-btn-primary">다음 화 보기</button>
                <button @click="exitViewer" class="next-ep-btn-ghost">목록으로</button>
              </div>
            </div>
            <div v-else class="next-ep-guide-content">
              <p class="next-ep-last">마지막 화입니다.</p>
              <button @click="exitViewer" class="next-ep-btn-ghost">목록으로 돌아가기</button>
            </div>
          </div>
        </div>

        <!-- Page Mode -->
        <div v-else class="h-full w-full flex items-center justify-center overflow-hidden">
          <!-- [Next Episode Guide] 마지막 페이지 초과 시 전체화면 안내 -->
          <transition name="fade">
            <div v-if="showNextEpisodeGuide" class="next-ep-fullscreen">
              <p class="next-ep-guide-label">End of Chapter</p>
              <div v-if="nextEpisodeData" class="next-ep-guide-content">
                <img :src="nextEpisodeData.thumbnail" class="next-ep-thumb-lg">
                <p class="next-ep-title-lg">{{ nextEpisodeData.name || nextEpisodeData.title }}</p>
                <div class="next-ep-actions">
                  <button @click="goToNextEpisode" class="next-ep-btn-primary">다음 화 보기</button>
                  <button @click="exitViewer" class="next-ep-btn-ghost">목록으로</button>
                </div>
              </div>
              <div v-else class="next-ep-guide-content">
                <p class="next-ep-last">마지막 화입니다.</p>
                <button @click="exitViewer" class="next-ep-btn-ghost">목록으로 돌아가기</button>
              </div>
            </div>
          </transition>
          <!-- 일반 페이지 렌더링 -->
          <template v-if="!showNextEpisodeGuide">
          <div class="spread-layout">
            <template v-if="viewerDefaults.spread && currentSlotData">
              <!-- Slot-based: single (cover etc.) → 1 image -->
              <template v-if="currentSlotData.type === 'single'">
                <img :key="'s'+currentSlotIndex" :src="currentSlotData.images[0]" 
                     @load="viewerDefaults.autoCrop ? loadBounds(currentSlotData.pages[0], currentSlotData.images[0]) : null"
                     class="single-image shadow-2xl transition-all duration-500"
                     :style="(viewerDefaults.autoCrop && imageBoundsMap[currentSlotData.pages[0]]) ? { clipPath: `inset(${imageBoundsMap[currentSlotData.pages[0]].top}% ${imageBoundsMap[currentSlotData.pages[0]].right}% ${imageBoundsMap[currentSlotData.pages[0]].bottom}% ${imageBoundsMap[currentSlotData.pages[0]].left}%)` } : {}">
              </template>
              <!-- Slot-based: spread (wide image) → full width -->
              <template v-else-if="currentSlotData.type === 'spread'">
                <img :key="'s'+currentSlotIndex" :src="currentSlotData.images[0]" 
                     @load="viewerDefaults.autoCrop ? loadBounds(currentSlotData.pages[0], currentSlotData.images[0]) : null"
                     class="spread-wide-image shadow-2xl transition-all duration-500"
                     :style="(viewerDefaults.autoCrop && imageBoundsMap[currentSlotData.pages[0]]) ? { clipPath: `inset(${imageBoundsMap[currentSlotData.pages[0]].top}% ${imageBoundsMap[currentSlotData.pages[0]].right}% ${imageBoundsMap[currentSlotData.pages[0]].bottom}% ${imageBoundsMap[currentSlotData.pages[0]].left}%)` } : {}">
              </template>
              <!-- Slot-based: pair → 2 images side by side -->
              <template v-else-if="currentSlotData.type === 'pair'">
                <img :key="'s'+currentSlotIndex+'a'" :src="currentSlotData.images[0]" 
                     @load="viewerDefaults.autoCrop ? loadBounds(currentSlotData.pages[0], currentSlotData.images[0]) : null"
                     class="spread-image shadow-2xl transition-all duration-500"
                     :style="(viewerDefaults.autoCrop && imageBoundsMap[currentSlotData.pages[0]]) ? { clipPath: `inset(${imageBoundsMap[currentSlotData.pages[0]].top}% ${imageBoundsMap[currentSlotData.pages[0]].right}% ${imageBoundsMap[currentSlotData.pages[0]].bottom}% ${imageBoundsMap[currentSlotData.pages[0]].left}%)` } : {}">
                <img :key="'s'+currentSlotIndex+'b'" :src="currentSlotData.images[1]" 
                     @load="viewerDefaults.autoCrop ? loadBounds(currentSlotData.pages[1], currentSlotData.images[1]) : null"
                     class="spread-image shadow-2xl transition-all duration-500"
                     :style="(viewerDefaults.autoCrop && imageBoundsMap[currentSlotData.pages[1]]) ? { clipPath: `inset(${imageBoundsMap[currentSlotData.pages[1]].top}% ${imageBoundsMap[currentSlotData.pages[1]].right}% ${imageBoundsMap[currentSlotData.pages[1]].bottom}% ${imageBoundsMap[currentSlotData.pages[1]].left}%)` } : {}">
              </template>
            </template>
            <template v-else>
              <!-- Single page mode (no spread) -->
              <img v-if="currentImage" :key="'p'+currentPage" :src="currentImage" 
                   @load="viewerDefaults.autoCrop ? loadBounds(currentPage - 1, currentImage) : null"
                   class="single-image shadow-2xl transition-all duration-500"
                   :style="(viewerDefaults.autoCrop && imageBoundsMap[currentPage - 1]) ? { clipPath: `inset(${imageBoundsMap[currentPage - 1].top}% ${imageBoundsMap[currentPage - 1].right}% ${imageBoundsMap[currentPage - 1].bottom}% ${imageBoundsMap[currentPage - 1].left}%)` } : {}">
            </template>
          </div>
          </template>
        </div>
      </template>

      <!-- Text (Novel) Content -->
      <template v-if="viewerContent?.type === 'text'">
        <div v-if="viewerData.mode === 'scroll'" class="max-w-3xl w-full py-16 px-5 md:px-10">
          <div class="novel-scroll-content opacity-90 tracking-tight font-medium text-current"
               :style="{ fontSize: novelSettings.fontSize + 'px', lineHeight: String(novelSettings.lineHeight) }"
               v-html="viewerContent.content"></div>
          <!-- End of Chapter: 소설 스크롤 못도 다음 화 안내 -->
          <div class="next-ep-guide">
            <p class="next-ep-guide-label">End of Chapter</p>
            <div v-if="nextEpisodeData" class="next-ep-guide-content">
              <img :src="nextEpisodeData.thumbnail" class="next-ep-thumb">
              <p class="next-ep-title">{{ nextEpisodeData.name || nextEpisodeData.title }}</p>
              <div class="next-ep-actions">
                <button @click="goToNextEpisode" class="next-ep-btn-primary">다음 화 보기</button>
                <button @click="exitViewer" class="next-ep-btn-ghost">목록으로</button>
              </div>
            </div>
            <div v-else class="next-ep-guide-content">
              <p class="next-ep-last">마지막 화입니다.</p>
              <button @click="exitViewer" class="next-ep-btn-ghost">목록으로 돌아가기</button>
            </div>
          </div>
        </div>
        <!-- Page Mode: CSS Column Pagination -->
        <div v-else class="novel-page-container" :class="{ 'novel-spread': novelSettings.spread }" ref="novelContainerRef">
          <!-- [Next Episode Guide] 소설 페이지 모드에서 마지막 페이지 초과 -->
          <transition name="fade">
            <div v-if="showNextEpisodeGuide" class="next-ep-fullscreen">
              <p class="next-ep-guide-label">End of Chapter</p>
              <div v-if="nextEpisodeData" class="next-ep-guide-content">
                <img :src="nextEpisodeData.thumbnail" class="next-ep-thumb-lg">
                <p class="next-ep-title-lg">{{ nextEpisodeData.name || nextEpisodeData.title }}</p>
                <div class="next-ep-actions">
                  <button @click="goToNextEpisode" class="next-ep-btn-primary">다음 화 보기</button>
                  <button @click="exitViewer" class="next-ep-btn-ghost">목록으로</button>
                </div>
              </div>
              <div v-else class="next-ep-guide-content">
                <p class="next-ep-last">마지막 화입니다.</p>
                <button @click="exitViewer" class="next-ep-btn-ghost">목록으로 돌아가기</button>
              </div>
            </div>
          </transition>
          <div v-if="!showNextEpisodeGuide" class="novel-text-body" ref="novelBodyRef"
               :style="novelTextStyle">
            <div class="novel-inner-content"
                 :style="{ fontSize: novelSettings.fontSize + 'px', lineHeight: String(novelSettings.lineHeight) }"
                 v-html="viewerContent.content"></div>
          </div>
        </div>
      </template>
    </div>

    <!-- Floating Footer -->
    <transition name="slide-up">
      <div v-if="showViewerControls" class="fixed bottom-4 inset-x-4 md:bottom-8 md:inset-x-8 z-[100] glass-controls p-5 md:p-10 rounded-2xl md:rounded-[40px] flex flex-col space-y-4 md:space-y-10 shadow-2xl viewer-toolbar reader-footer-safe">
        <div class="flex items-center space-x-4 md:space-x-10">
          <button @click="handlePrev" class="viewer-toolbar-muted hover:viewer-toolbar-icon transition-colors text-lg md:text-2xl">◀</button>
          <input type="range" class="flex-grow accent-[#3498db] h-1 rounded-full bg-zinc-800 appearance-none cursor-pointer" v-model.number="currentPage" min="1" :max="totalPages">
          <button @click="handleNext" class="viewer-toolbar-muted hover:viewer-toolbar-icon transition-colors text-lg md:text-2xl">▶</button>
        </div>
        <div class="flex flex-wrap justify-center gap-4 md:gap-16 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.5em] viewer-toolbar-muted">
          <template v-if="!isNovelMode">
            <button @click="viewerDefaults.spread = !viewerDefaults.spread" :class="viewerDefaults.spread ? 'viewer-toolbar-active' : ''">Spread</button>
          </template>
          <button @click="setViewerMode(viewerData.mode === 'scroll' ? 'page' : 'scroll')" :class="viewerData.mode === 'scroll' ? 'viewer-toolbar-active' : ''">Scroll</button>
          <template v-if="!isNovelMode">
            <button @click="viewerDefaults.rtl = !viewerDefaults.rtl" :class="viewerDefaults.rtl ? 'viewer-toolbar-active' : ''">RTL</button>
          </template>
          <span class="text-blue-500 font-black">{{ viewerData.mode === 'scroll' ? scrollProgress + '%' : currentPage + ' / ' + totalPages }}</span>
        </div>

        <!-- Novel Settings Row -->
        <div v-if="isNovelMode" class="novel-settings-row">
          <!-- Row 1: 테마 색상 + 폰트 크기 -->
          <div class="novel-settings-subrow">
            <button class="theme-btn theme-btn-light" :class="{ active: novelSettings.theme === 'light' }" @click.stop="setNovelTheme('light')" title="Light"></button>
            <button class="theme-btn theme-btn-sepia" :class="{ active: novelSettings.theme === 'sepia' }" @click.stop="setNovelTheme('sepia')" title="Sepia"></button>
            <button class="theme-btn theme-btn-dark"  :class="{ active: novelSettings.theme === 'dark' }"  @click.stop="setNovelTheme('dark')"  title="Dark"></button>
            <span class="novel-sep"></span>
            <button class="font-btn" @click.stop="adjustFontSize(-2)">A-</button>
            <span class="font-size-label">{{ novelSettings.fontSize }}</span>
            <button class="font-btn" @click.stop="adjustFontSize(2)">A+</button>
          </div>
          <!-- Row 2: 줄 간격 + 2쪽보기 -->
          <div class="novel-settings-subrow">
            <span class="font-size-label" style="min-width:auto;">줄</span>
            <input type="range" min="1.4" max="3.0" step="0.1" :value="novelSettings.lineHeight"
                   @input="setLineHeight(parseFloat($event.target.value))"
                   class="w-28 accent-[#3498db] h-1 rounded-full bg-zinc-800 appearance-none cursor-pointer">
            <span class="novel-sep"></span>
            <button class="font-btn" @click.stop="toggleNovelSpread" :style="novelSettings.spread ? 'background:rgba(52,152,219,0.3); color:#3498db;' : ''" title="두 페이지 보기">📖</button>
          </div>
        </div>
      </div>
    </transition>
  </main>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useStore } from '../composables/useStore';
import { useViewerInput } from '../composables/useViewerInput';
import { useKeyboard } from '../composables/useKeyboard';
import { useVirtualScroll } from '../composables/useVirtualScroll';
import { useAutoCrop } from '../composables/useAutoCrop';

const {
  showViewerControls, showEpisodeModal,
  selectedItem, currentEpisode, currentPage, scrollProgress, totalPages,
  viewerDefaults, viewerData, novelSettings,
  viewerContent, downloadProgress, isDownloading,
  hasNextEpisode, hasPrevEpisode,
  nextEpisodeData, showNextEpisodeGuide,
  novelPageCount, novelCurrentPage,
  pageSlots, currentSlotIndex,
  exitViewer, goToNextEpisode, goToPrevEpisode,
  toggleViewerUI, setViewerMode,
  handleWheel, handleNext, handlePrev, onScrollUpdate,
  cleanupBlobUrls,
  setNovelTheme, adjustFontSize, setLineHeight, toggleNovelSpread,
} = useStore();

const { initObserver, observeElement, unobserveElement, isVisible, cleanup: cleanupVirtual } = useVirtualScroll();
const { getBounds } = useAutoCrop();

// Cache for image bounds [index] -> { top, right, bottom, left }
const imageBoundsMap = reactive({});
// Cache for image aspect ratio to prevent virtual scroll jumping
const aspectRatioMap = reactive({});
const imageRefs = ref([]);

async function loadBounds(index, url) {
  if (imageBoundsMap[index]) return;
  const bounds = await getBounds(selectedItem.value.id, currentEpisode.value.id, index, url);
  if (bounds) imageBoundsMap[index] = bounds;
}

function onImageLoaded(index, url, event) {
  // Capture aspect ratio on actual load
  const img = event.target;
  if (img && img.naturalWidth && img.naturalHeight) {
    aspectRatioMap[index] = `${img.naturalWidth}/${img.naturalHeight}`;
  }
  // Optional AutoCrop logic (스크롤 모드에서는 상하 연결 레이아웃 유지 목적으로 작동 안 함)
  if (viewerDefaults.autoCrop && viewerData.mode !== 'scroll') {
    loadBounds(index, url);
  }
}

const isNovelMode = computed(() => viewerContent.value?.type === 'text');

const currentImage = computed(() => {
  if (viewerContent.value?.type !== 'images') return null;
  return viewerContent.value.images[currentPage.value - 1] || null;
});

// Slot-based: current slot data for spread mode
const currentSlotData = computed(() => {
  if (!viewerDefaults.spread || pageSlots.value.length === 0) return null;
  const slot = pageSlots.value[currentSlotIndex.value];
  if (!slot) return null;
  const images = slot.pages.map(idx => viewerContent.value?.images[idx]).filter(Boolean);
  return { type: slot.type, images, pages: slot.pages };
});

// --- Novel Column Pagination ---
const novelContainerRef = ref(null);
const novelBodyRef = ref(null);

const novelTextStyle = computed(() => ({
  columnWidth: novelBodyRef.value ? novelBodyRef.value.clientWidth + 'px' : '700px',
  transform: `translateX(-${novelCurrentPage.value * 100}%)`,
}));

function recalcNovelPages() {
  const body = novelBodyRef.value;
  if (!body) return;

  // Use body's own rendered width (respects max-width)
  const bodyWidth = body.clientWidth;
  body.style.columnWidth = bodyWidth + 'px';

  nextTick(() => {
    const totalWidth = body.scrollWidth;
    const pages = Math.max(1, Math.round(totalWidth / bodyWidth));
    novelPageCount.value = pages;

    // Clamp current page
    if (novelCurrentPage.value >= pages) {
      novelCurrentPage.value = Math.max(0, pages - 1);
    }
    currentPage.value = novelCurrentPage.value + 1;
  });
}

// Watch for settings changes that affect pagination
watch(() => [novelSettings.fontSize, novelSettings.lineHeight, novelSettings.spread, viewerData.mode], () => {
  if (isNovelMode.value && viewerData.mode !== 'scroll') {
    nextTick(() => recalcNovelPages());
  }
});

// Watch for content load
watch(() => viewerContent.value, () => {
  if (isNovelMode.value && viewerData.mode !== 'scroll') {
    novelCurrentPage.value = 0;
    nextTick(() => setTimeout(recalcNovelPages, 100));
  }
  // [v1.7.0] [취약점 2 수정] 화 전환 시 가상 스크롤 옵저버 재시작
  if (viewerData.mode === 'scroll' && viewerDefaults.virtualScroll) {
    cleanupVirtual();
    nextTick(() => initObserver());
  }
});

// Watch for mode or virtual scroll setting toggle to prevent memory leak
watch(() => [viewerData.mode, viewerDefaults.virtualScroll], ([newMode, newVirtualScroll]) => {
  if (newMode === 'scroll' && newVirtualScroll) {
    cleanupVirtual();
    nextTick(() => initObserver());
  } else {
    cleanupVirtual();
  }
});

// Watch slider (currentPage) changes → sync novelCurrentPage
watch(currentPage, (newPage) => {
  if (isNovelMode.value && viewerData.mode !== 'scroll') {
    const target = Math.max(0, Math.min(newPage - 1, novelPageCount.value - 1));
    if (target !== novelCurrentPage.value) {
      novelCurrentPage.value = target;
    }
  }
});

const input = useViewerInput();
const keyboard = useKeyboard();

let resizeObserver = null;

onMounted(() => {
  input.attach();
  keyboard.attach();
  initObserver();

  // ResizeObserver for re-pagination on window resize
  resizeObserver = new ResizeObserver(() => {
    if (isNovelMode.value && viewerData.mode !== 'scroll') {
      recalcNovelPages();
    }
  });

  const mainEl = document.querySelector('.reader-main');
  if (mainEl) resizeObserver.observe(mainEl);
});

onUnmounted(() => {
  input.detach();
  keyboard.detach();
  cleanupBlobUrls();
  cleanupVirtual();
  if (resizeObserver) resizeObserver.disconnect();
});
</script>

