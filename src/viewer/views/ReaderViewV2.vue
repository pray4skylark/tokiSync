<template>
  <main class="fixed inset-0 z-[3000] bg-black overflow-hidden flex flex-col items-center reader-main"
        :class="[isNovelMode ? `theme-${novelSettings.theme}` : 'bg-black']">

    <!-- Download Progress Overlay -->
    <transition name="fade">
      <div v-if="isDownloading" class="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center text-white">
        <div class="w-16 h-16 border-4 border-zinc-800 border-t-theme-accent rounded-full animate-spin mb-8"></div>
        <p class="text-sm font-bold text-zinc-400 tracking-wider uppercase mb-8">{{ downloadProgress || '준비 중...' }}</p>
        <button @click="exitViewer" class="px-8 py-3 bg-red-500/20 hover:bg-red-500/40 text-red-500 border border-red-500/50 rounded-2xl text-sm font-black transition-all uppercase tracking-widest">
          취소하고 나가기
        </button>
      </div>
    </transition>

    <!-- [v2.9] Restoration Overlay: Premium backdrop-blur -->
    <transition name="fade">
      <div v-if="isRestoring && !isDownloading" class="fixed inset-0 z-[150] bg-black/40 backdrop-blur-2xl flex flex-col items-center justify-center text-white">
        <div class="flex flex-col items-center scale-110">
          <div class="w-10 h-10 border-[3px] border-white/5 border-t-theme-accent rounded-full animate-spin mb-5"></div>
          <p class="text-[9px] font-black tracking-[0.5em] uppercase text-theme-accent animate-pulse">Synchronizing Position</p>
        </div>
      </div>
    </transition>

    <!-- Floating Header: Glassmorphism refined -->
    <transition name="fade">
      <div v-if="showViewerControls" class="fixed top-4 inset-x-4 md:top-8 md:inset-x-8 z-[100] bg-zinc-900/40 backdrop-blur-xl border border-white/10 p-3 md:p-5 rounded-[24px] md:rounded-[40px] flex justify-between items-center shadow-2xl viewer-toolbar reader-header-safe">
        <button @click="exitViewer" class="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 flex items-center justify-center hover:bg-white/10 rounded-full transition-all">
          <svg class="w-6 h-6 md:w-7 md:h-7 viewer-toolbar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7"></path></svg>
        </button>

        <div class="flex-1 min-w-0 px-2 md:px-4 flex items-center justify-center space-x-3 md:space-x-6">
          <button @click.stop="goToPrevEpisode" :disabled="!hasPrevEpisode" class="flex-shrink-0 p-2 hover:bg-white/10 rounded-full disabled:opacity-20">
            <svg class="w-4 h-4 md:w-5 md:h-5 viewer-toolbar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7"></path></svg>
          </button>
          <div class="min-w-0 text-center">
            <p class="text-[8px] md:text-[9px] font-black tracking-[0.3em] uppercase text-theme-accent mb-0.5 truncate">{{ selectedItem?.title }}</p>
            <p class="text-xs md:text-sm font-black uppercase tracking-tighter truncate">{{ currentEpisode?.title }} <span class="text-[10px] opacity-30 italic">v2.3</span></p>
          </div>
          <button @click.stop="goToNextEpisode" :disabled="!hasNextEpisode" class="flex-shrink-0 p-2 hover:bg-white/10 rounded-full disabled:opacity-20">
            <svg class="w-4 h-4 md:w-5 md:h-5 viewer-toolbar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"></path></svg>
          </button>
        </div>

        <button @click.stop="showEpisodeModal = true" class="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-all">
          <svg class="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </button>
      </div>
    </transition>

    <!-- [Layer 1] Mode Layer Choice -->
    <ScrollLayer v-if="viewerData.mode === 'scroll'" :onScrollUpdate="onScrollUpdate">
      <!-- [Layer 2] Content Renderer Choice -->
      <ImageRenderer v-if="viewerContent?.type === 'images'" 
                     :images="viewerContent.images" 
                     :markerIndex="logicalIndex"
                     :virtualScroll="viewerDefaults.virtualScroll"
                     @ready="onRendererReady"
                     @heuristic-ready="onHeuristicReady" />
      
      <TextRenderer v-else-if="viewerContent?.type === 'text'" 
                    :paragraphs="viewerContent.paragraphs"
                    :mode="viewerData.mode"
                    :fontSize="novelSettings.fontSize"
                    :lineHeight="String(novelSettings.lineHeight)"
                    :settings="novelSettings"
                    @ready="onRendererReady" />
      
      <div v-else-if="!viewerContent && !isDownloading" class="text-zinc-600 py-20">콘텐츠 로드 대기 중...</div>

      <!-- End of Chapter: 다음 화 안내 인라인 섹션 (Scroll Mode) -->
      <div v-if="viewerContent" class="next-ep-guide">
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
    </ScrollLayer>

    <PageLayer v-else>
      <template #overlay>
        <div v-if="showNextEpisodeGuide" class="next-ep-fullscreen">
          <p class="next-ep-guide-label">End of Chapter</p>
          <div v-if="nextEpisodeData" class="next-ep-guide-content">
            <img :src="nextEpisodeData.thumbnail" class="next-ep-thumb-lg">
            <p class="next-ep-title-lg">{{ nextEpisodeData.title }}</p>
            <div class="next-ep-actions">
              <button @click="goToNextEpisode" class="next-ep-btn-primary">다음 화 보기</button>
              <button @click="exitViewer" class="next-ep-btn-ghost">목록으로</button>
            </div>
          </div>
        </div>
      </template>

      <!-- Page Content Layout -->
      <template v-if="!showNextEpisodeGuide">
        <div class="spread-layout">
          <template v-if="viewerDefaults.spread && currentSlotData">
            <template v-if="currentSlotData.type === 'pair'">
              <img v-for="(img, idx) in currentSlotData.images" :key="idx" 
                   :src="img" :data-locator="currentSlotData.pages[idx]"
                   @load="onRendererReady"
                   class="spread-image shadow-2xl transition-all duration-500">
            </template>
            <template v-else>
              <img :src="currentSlotData.images[0]" :data-locator="currentSlotData.pages[0]"
                   @load="onRendererReady"
                   class="single-image shadow-2xl transition-all duration-500">
            </template>
          </template>
          <template v-else-if="viewerContent?.type === 'images'">
            <img v-if="currentImage" :src="currentImage" :data-locator="currentPage - 1"
                 @load="onRendererReady"
                 class="single-image shadow-2xl transition-all duration-500">
          </template>

          <template v-else-if="viewerContent?.type === 'text'">
            <div class="novel-page-viewport w-full h-full overflow-hidden">
              <TextRenderer :paragraphs="viewerContent.paragraphs"
                            :mode="viewerData.mode"
                            :fontSize="novelSettings.fontSize"
                            :lineHeight="String(novelSettings.lineHeight)"
                            :settings="novelSettings"
                            :currentPage="novelCurrentPage"
                            @ready="onRendererReady"
                            @paginate="onNovelPaginate" />
            </div>
          </template>
        </div>
      </template>
    </PageLayer>

    <!-- Floating Footer: Glassmorphism refined -->
    <transition name="slide-up">
      <div v-if="showViewerControls" class="fixed bottom-4 inset-x-4 md:bottom-8 md:inset-x-8 z-[100] bg-zinc-900/40 backdrop-blur-xl border border-white/10 p-5 md:p-8 rounded-[32px] md:rounded-[48px] flex flex-col space-y-4 shadow-2xl viewer-toolbar reader-footer-safe">
        <div class="flex items-center space-x-10">
          <button @click="handlePrev" class="viewer-toolbar-muted hover:text-white transition-colors">◀</button>
          <input type="range" class="flex-grow accent-theme-accent h-1 rounded-full bg-zinc-800" v-model.number="currentPage" min="1" :max="totalPages">
          <button @click="handleNext" class="viewer-toolbar-muted hover:text-white transition-colors">▶</button>
        </div>
        <div class="flex justify-center gap-10 text-[10px] font-black uppercase tracking-[0.2em] viewer-toolbar-muted">
          <button v-if="!isNovelMode" @click="viewerDefaults.spread = !viewerDefaults.spread" :class="viewerDefaults.spread ? 'text-theme-accent' : ''">Spread</button>
          <button @click="setViewerMode(viewerData.mode === 'scroll' ? 'page' : 'scroll')" :class="viewerData.mode === 'scroll' ? 'text-theme-accent' : ''">Scroll</button>
          <span class="text-theme-accent">{{ viewerData.mode === 'scroll' ? scrollProgress + '%' : currentPage + ' / ' + totalPages }}</span>
        </div>

        <!-- Novel Settings Row -->
        <div v-if="isNovelMode" class="flex flex-col space-y-4 pt-4 border-t border-white/10 mt-4">
          <!-- Row 1: 테마 색상 + 폰트 크기 -->
          <div class="flex items-center justify-between text-white">
            <div class="flex space-x-3">
              <button class="w-8 h-8 rounded-full border-2 transition-all bg-white border-zinc-200" :class="{ 'ring-2 ring-theme-accent border-transparent': novelSettings.theme === 'light' }" @click.stop="setNovelTheme('light')" title="Light"></button>
              <button class="w-8 h-8 rounded-full border-2 transition-all bg-[#f4ecd8] border-[#d4c5b0]" :class="{ 'ring-2 ring-theme-accent border-transparent': novelSettings.theme === 'sepia' }" @click.stop="setNovelTheme('sepia')" title="Sepia"></button>
              <button class="w-8 h-8 rounded-full border-2 transition-all bg-black border-zinc-700"  :class="{ 'ring-2 ring-theme-accent border-transparent': novelSettings.theme === 'dark' }"  @click.stop="setNovelTheme('dark')"  title="Dark"></button>
            </div>
            <div class="flex items-center space-x-4 bg-white/5 rounded-2xl px-4 py-1 border border-white/5">
              <button class="text-lg font-bold text-zinc-400 hover:text-white transition-colors px-2" @click.stop="adjustFontSize(-2)">A-</button>
              <span class="text-sm font-black w-6 text-center text-theme-accent">{{ novelSettings.fontSize }}</span>
              <button class="text-lg font-bold text-zinc-400 hover:text-white transition-colors px-2" @click.stop="adjustFontSize(2)">A+</button>
            </div>
          </div>
          <!-- Row 2: 줄 간격 + 2쪽보기 -->
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4 flex-grow mr-6">
              <span class="text-[10px] font-black uppercase tracking-widest text-zinc-500">줄 간격</span>
              <input type="range" min="1.4" max="3.0" step="0.1" :value="novelSettings.lineHeight"
                     @input="setLineHeight(parseFloat($event.target.value))"
                     class="flex-grow accent-theme-accent h-1 rounded-full bg-zinc-800 appearance-none cursor-pointer">
            </div>
            <button class="p-2 rounded-xl transition-all border"
                    :class="novelSettings.spread ? 'bg-theme-accent border-theme-accent text-theme-accent' : 'bg-white/5 border-transparent text-zinc-500 hover:text-white hover:bg-white/10'" 
                    @click.stop="toggleNovelSpread" title="두 페이지 보기">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </transition>

  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useStore } from '../composables/useStore';
import { useViewerInput } from '../composables/useViewerInput';
import { useKeyboard } from '../composables/useKeyboard';
import { useProgressMarker } from '../composables/useProgressMarker';

// Components
import ScrollLayer from '../components/v2/ScrollLayer.vue';
import PageLayer from '../components/v2/PageLayer.vue';
import ImageRenderer from '../components/v2/ImageRenderer.vue';
import TextRenderer from '../components/v2/TextRenderer.vue';

const store = useStore();
const {
  showViewerControls, showEpisodeModal,
  selectedItem, currentEpisode, currentPage, scrollProgress, totalPages,
  viewerDefaults, viewerData, novelSettings,
  viewerContent, downloadProgress, isDownloading,
  hasNextEpisode, hasPrevEpisode,
  nextEpisodeData, showNextEpisodeGuide,
  pageSlots, currentSlotIndex,
  novelCurrentPage, novelPageCount,
  exitViewer, goToNextEpisode, goToPrevEpisode,
  setViewerMode, handleWheel, handleNext, handlePrev, onScrollUpdate,
  cleanupBlobUrls,
  setNovelTheme, adjustFontSize, setLineHeight, toggleNovelSpread
} = store;

const { restore, heuristicJump, isRestoring, logicalIndex, getStrategy } = useProgressMarker();

/**
 * [v2.9] Novel Paginate: Receive calculated page count from renderer
 */
function onNovelPaginate(count) {
  console.log(`[V2:Viewer] Received Novel Page Count: ${count}`);
  novelPageCount.value = count;
  
  // 폰트 크기/줄 간격 변경 후에도 현재 읽던 문단(logicalIndex)을 화면에 유지하기 위해 페이지 보정
  if (isNovelMode.value && viewerData.mode !== 'scroll') {
    const strategy = getStrategy('text');
    if (strategy) {
      const targetPageIdx = strategy.getPageFromLocator(logicalIndex.value, store);
      if (targetPageIdx !== -1 && novelCurrentPage.value !== targetPageIdx) {
        console.log(`[V2:Viewer] Resync progress for index ${logicalIndex.value} -> Page ${targetPageIdx + 1}`);
        novelCurrentPage.value = targetPageIdx;
        currentPage.value = targetPageIdx + 1;
      }
    }
  }
}
const input = useViewerInput();
const keyboard = useKeyboard();

// [v2.9-fix] Guard against redundant restore calls during page navigation
let hasRestoredForThisEpisode = false;

// [v2.9.3] 에피소드 전환 시 복구 플래그 초기화
watch(currentEpisode, () => {
  hasRestoredForThisEpisode = false;
  isRestoring.value = true;
});

const isNovelMode = computed(() => viewerContent.value?.type === 'text');
const currentImage = computed(() => viewerContent.value?.images?.[currentPage.value - 1] || null);
const currentSlotData = computed(() => {
  if (!viewerDefaults.spread || pageSlots.value.length === 0) return null;
  const slot = pageSlots.value[currentSlotIndex.value];
  if (!slot) return null;
  return { ...slot, images: slot.pages.map(idx => viewerContent.value?.images[idx]).filter(Boolean) };
});

/**
 * [v2.8] Heuristic Event: Top-3 Average Height Ready
 * Triggered by ImageRenderer when first 3 images load
 */
function onHeuristicReady(avgHeight) {
  console.log(`[V2:Shell] Heuristic Signal: ${avgHeight}px`);
  heuristicJump(avgHeight, store);
}

/**
 * Event: Internal Renderer is ready with DOM
 */
async function onRendererReady() {
  // Only restore once per episode mount or when explicitly locked
  if (!isRestoring.value || hasRestoredForThisEpisode) return;
  
  console.log('[V2:Viewer] Renderer Ready. Triggering position restore.');
  
  // Wait for DOM
  await nextTick();
  
  // Only mark as done if viewerContent is actually loaded
  // If content is null, restore() will exit early → we allow retry
  if (!viewerContent.value) {
    console.warn('[V2:Viewer] viewerContent is null at renderer ready. Waiting for content watcher to retry.');
    await restore(store); // will unlock the isRestoring if ep has no history
    // Don't mark hasRestoredForThisEpisode — let the content watcher try again
    return;
  }
  
  await restore(store);
  hasRestoredForThisEpisode = true;
}

// [v2.9-fix] Safety net: if viewerContent loads AFTER the renderer was ready,
// retry restore exactly once.
watch(viewerContent, async (newContent) => {
  if (!newContent || hasRestoredForThisEpisode) return;
  if (!isRestoring.value) return; // Already unlocked (no history to restore)
  
  console.log('[V2:Viewer] viewerContent loaded late — retrying restore.');
  await nextTick();
  await restore(store);
  hasRestoredForThisEpisode = true;
}, { immediate: false });


onMounted(() => {
  input.attach();
  keyboard.attach();
});

onUnmounted(() => {
  input.detach();
  keyboard.detach();
  cleanupBlobUrls();
  isRestoring.value = true; // [v2.9-fix] 나갈 때 다음 번을 위해 잠금 상태로 복구
  hasRestoredForThisEpisode = false;
});
</script>

<style scoped>
.reader-main {
  user-select: none;
}

/* [v2.9] Novel Page Mode Styles */
.novel-page-viewport {
  position: relative;
  width: 100vw;
  height: 80vh;
  display: flex;
  align-items: center;
}

.theme-dark {
  background-color: #000;
  color: #ccc;
}
.theme-light {
  background-color: #fff;
  color: #333;
}
.theme-sepia {
  background-color: #f4ecd8;
  color: #5b4636;
}

/* Transitions */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(40px);
  opacity: 0;
}
</style>
