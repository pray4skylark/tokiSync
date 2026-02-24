<template>
  <main class="fixed inset-0 z-[3000] bg-black overflow-hidden flex flex-col items-center reader-main">

    <!-- Download Progress Overlay -->
    <transition name="fade">
      <div v-if="isDownloading" class="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center text-white">
        <div class="w-16 h-16 border-4 border-zinc-800 border-t-blue-500 rounded-full animate-spin mb-8"></div>
        <p class="text-sm font-bold text-zinc-400 tracking-wider uppercase">{{ downloadProgress || '준비 중...' }}</p>
      </div>
    </transition>

    <!-- Floating Header -->
    <transition name="fade">
      <div v-if="showViewerControls" class="fixed top-4 inset-x-4 md:top-8 md:inset-x-8 z-[100] glass-controls p-3 md:p-6 rounded-2xl md:rounded-[32px] flex justify-between items-center text-white shadow-2xl reader-header-safe">
        <button @click="exitViewer" class="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 flex items-center justify-center hover:bg-white/10 rounded-full transition-all">
          <svg class="w-6 h-6 md:w-7 md:h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7"></path></svg>
        </button>

        <div class="flex-1 min-w-0 px-2 md:px-4 flex items-center justify-center space-x-3 md:space-x-6">
          <!-- 이전 에피소드 -->
          <button @click.stop="goToPrevEpisode" :disabled="!hasPrevEpisode"
                  class="flex-shrink-0 p-2 hover:bg-white/10 rounded-full transition-all disabled:opacity-20" title="이전 화">
            <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7"></path></svg>
          </button>

          <div class="min-w-0 overflow-hidden text-center">
            <p class="text-[8px] md:text-[9px] font-black tracking-[0.3em] md:tracking-[0.5em] uppercase text-blue-500 mb-0.5 truncate">{{ selectedItem?.name || selectedItem?.title }}</p>
            <p class="text-xs md:text-sm font-black text-zinc-200 uppercase tracking-tighter truncate">{{ currentEpisode?.name || currentEpisode?.title }}</p>
          </div>

          <!-- 다음 에피소드 -->
          <button @click.stop="goToNextEpisode" :disabled="!hasNextEpisode"
                  class="flex-shrink-0 p-2 hover:bg-white/10 rounded-full transition-all disabled:opacity-20" title="다음 화">
            <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>

        <!-- 에피소드 목록 -->
        <button @click.stop="showEpisodeModal = true" class="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl md:rounded-[20px] transition-all" title="에피소드 목록">
          <svg class="w-5 h-5 md:w-6 md:h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </button>
      </div>
    </transition>

    <!-- Navigation Interaction Zones (Page 모드 또는 소설 Scroll 모드) -->
    <div v-if="viewerData.mode !== 'scroll' || isNovelMode" class="fixed inset-0 z-40 pointer-events-none" @wheel.passive="handleWheel">
      <div v-if="viewerData.mode !== 'scroll'" @click="handlePrev" class="nav-zone nav-left pointer-events-auto"></div>
      <div @click="toggleViewerUI" class="nav-zone nav-center" :class="viewerData.mode === 'scroll' ? 'pointer-events-none' : 'pointer-events-auto'"></div>
      <div v-if="viewerData.mode !== 'scroll'" @click="handleNext" class="nav-zone nav-right pointer-events-auto"></div>
    </div>

    <!-- Engine Viewport -->
    <div id="viewer-container" class="viewer-content w-full h-full overflow-y-auto no-scrollbar flex flex-col items-center"
         :class="[viewerData.mode === 'scroll' ? 'overflow-y-auto' : 'overflow-hidden', isNovelMode ? `theme-${novelSettings.theme}` : 'bg-black']"
         @scroll.passive="onScrollUpdate">

      <!-- No Content State -->
      <div v-if="!viewerContent && !isDownloading" class="flex items-center justify-center h-full text-zinc-600">
        <p>콘텐츠를 불러오지 못했습니다.</p>
      </div>

      <!-- Image Content -->
      <template v-if="viewerContent?.type === 'images'">

        <!-- Scroll Mode -->
        <div v-if="viewerData.mode === 'scroll'" class="max-w-4xl w-full">
          <img v-for="(src, i) in viewerContent.images" :key="i" :src="src"
               class="w-full h-auto block select-none shadow-2xl border-b border-white/5" loading="lazy">
        </div>

        <!-- Page Mode -->
        <div v-else class="h-full w-full flex items-center justify-center overflow-hidden">
          <div class="spread-layout" :dir="viewerDefaults.rtl ? 'rtl' : 'ltr'">
            <template v-if="viewerDefaults.spread && currentSlotData">
              <!-- Slot-based: single (cover etc.) → 1 image -->
              <template v-if="currentSlotData.type === 'single'">
                <img :key="'s'+currentSlotIndex" :src="currentSlotData.images[0]" class="single-image shadow-2xl">
              </template>
              <!-- Slot-based: spread (wide image) → full width -->
              <template v-else-if="currentSlotData.type === 'spread'">
                <img :key="'s'+currentSlotIndex" :src="currentSlotData.images[0]" class="spread-wide-image shadow-2xl">
              </template>
              <!-- Slot-based: pair → 2 images side by side -->
              <template v-else-if="currentSlotData.type === 'pair'">
                <img :key="'s'+currentSlotIndex+'a'" :src="currentSlotData.images[0]" class="spread-image shadow-2xl">
                <img :key="'s'+currentSlotIndex+'b'" :src="currentSlotData.images[1]" class="spread-image shadow-2xl">
              </template>
            </template>
            <template v-else>
              <!-- Single page mode (no spread) -->
              <img v-if="currentImage" :key="'p'+currentPage" :src="currentImage" class="single-image shadow-2xl">
            </template>
          </div>
        </div>
      </template>

      <!-- Text (Novel) Content -->
      <template v-if="viewerContent?.type === 'text'">
        <div v-if="viewerData.mode === 'scroll'" class="max-w-3xl w-full py-16 px-5 md:px-10">
          <div class="novel-scroll-content opacity-90 tracking-tight font-medium text-current"
               :style="{ fontSize: novelSettings.fontSize + 'px', lineHeight: String(novelSettings.lineHeight) }"
               v-html="viewerContent.content"></div>
        </div>
        <!-- Page Mode: CSS Column Pagination -->
        <div v-else class="novel-page-container" :class="{ 'novel-spread': novelSettings.spread }" ref="novelContainerRef">
          <div class="novel-text-body" ref="novelBodyRef"
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
      <div v-if="showViewerControls" class="fixed bottom-4 inset-x-4 md:bottom-8 md:inset-x-8 z-[100] glass-controls p-5 md:p-10 rounded-2xl md:rounded-[40px] flex flex-col space-y-4 md:space-y-10 shadow-2xl text-white reader-footer-safe">
        <div class="flex items-center space-x-4 md:space-x-10 text-white">
          <button @click="handlePrev" class="text-zinc-600 hover:text-white transition-colors text-lg md:text-2xl">◀</button>
          <input type="range" class="flex-grow accent-[#3498db] h-1 rounded-full bg-zinc-800 appearance-none cursor-pointer" v-model.number="currentPage" min="1" :max="totalPages">
          <button @click="handleNext" class="text-zinc-600 hover:text-white transition-colors text-lg md:text-2xl">▶</button>
        </div>
        <div class="flex flex-wrap justify-center gap-4 md:gap-16 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.5em] text-zinc-600">
          <template v-if="!isNovelMode">
            <button @click="viewerDefaults.spread = !viewerDefaults.spread" :class="{'text-white underline decoration-blue-600 underline-offset-4 md:underline-offset-8': viewerDefaults.spread}">Spread</button>
          </template>
          <button @click="setViewerMode(viewerData.mode === 'scroll' ? 'page' : 'scroll')" :class="{'text-white underline decoration-blue-600 underline-offset-4 md:underline-offset-8': viewerData.mode === 'scroll'}">Scroll</button>
          <template v-if="!isNovelMode">
            <button @click="viewerDefaults.rtl = !viewerDefaults.rtl" :class="{'text-white underline decoration-blue-600 underline-offset-4 md:underline-offset-8': viewerDefaults.rtl}">RTL</button>
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
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useStore } from '../composables/useStore';
import { useTouch } from '../composables/useTouch';
import { useKeyboard } from '../composables/useKeyboard';

const {
  showViewerControls, showEpisodeModal,
  selectedItem, currentEpisode, currentPage, scrollProgress, totalPages,
  viewerDefaults, viewerData, novelSettings,
  viewerContent, downloadProgress, isDownloading,
  hasNextEpisode, hasPrevEpisode,
  novelPageCount, novelCurrentPage,
  pageSlots, currentSlotIndex,
  exitViewer, goToNextEpisode, goToPrevEpisode,
  toggleViewerUI, setViewerMode,
  handleWheel, handleNext, handlePrev, onScrollUpdate,
  cleanupBlobUrls,
  setNovelTheme, adjustFontSize, setLineHeight, toggleNovelSpread,
} = useStore();

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
  return { type: slot.type, images };
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

const touch = useTouch();
const keyboard = useKeyboard();

let resizeObserver = null;

onMounted(() => {
  touch.attach();
  keyboard.attach();

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
  touch.detach();
  keyboard.detach();
  cleanupBlobUrls();
  if (resizeObserver) resizeObserver.disconnect();
});
</script>

