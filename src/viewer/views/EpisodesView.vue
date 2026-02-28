<template>
  <main class="w-full min-h-screen ep-view transition-colors duration-300">
    <div class="w-full max-w-7xl mx-auto min-h-screen px-4 md:px-12 py-10">
      <div class="flex flex-col lg:flex-row gap-12">

        <!-- ── 좌측 패널: 커버 + 메타정보 (sticky) ── -->
        <aside class="w-full lg:w-1/3 space-y-8 lg:sticky lg:top-28 h-fit">

          <!-- 커버 이미지: ring + shadow (레퍼런스 스타일) -->
          <div class="w-64 mx-auto lg:mx-0 shadow-2xl rounded-2xl overflow-hidden aspect-cover ep-cover-ring transition-all">
            <img
              :src="getThumbnailUrl(selectedItem)"
              class="w-full h-full object-cover"
              @error="$event.target.src = NO_IMAGE_SVG"
            >
          </div>

          <!-- 시리즈 정보 -->
          <div class="text-center lg:text-left space-y-5">
            <div>
              <h2 class="text-3xl font-black tracking-tight leading-tight uppercase ep-text drop-shadow-sm">
                {{ selectedItem?.name || selectedItem?.title }}
              </h2>
              <p class="text-xs ep-text-sub font-medium mt-2">
                Personal Cloud Collection<br>
                {{ selectedItem?.category || selectedItem?.type || 'Unknown' }} · 전체 {{ episodes.length }}화
              </p>
            </div>

            <!-- 첫 화 보기 버튼 -->
            <button
              v-if="episodes.length > 0"
              @click="startReading(sortedEpisodes[0])"
              class="w-full py-5 ep-btn-action rounded-xl text-lg font-black shadow-xl active:scale-95 transition-all uppercase tracking-tighter"
            >
              첫 화 보기
            </button>

            <!-- 이어보기 버튼 -->
            <button
              v-if="lastReadEpisode"
              @click="startReading(lastReadEpisode)"
              class="w-full py-4 ep-btn-continue rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span class="truncate">이어보기: {{ lastReadEpisode.name || lastReadEpisode.title }}</span>
            </button>

            <!-- 새로고침 -->
            <button
              @click="refreshEpisodes"
              :disabled="isSyncing"
              class="w-full py-3 ep-btn-ghost rounded-xl text-xs font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2"
              :class="{ 'opacity-40 cursor-not-allowed': isSyncing }"
            >
              <svg class="w-4 h-4" :class="{ 'animate-spin': isSyncing }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              새로고침
            </button>
          </div>
        </aside>

        <!-- ── 우측 패널: 에피소드 리스트 카드 ── -->
        <!-- 레퍼런스: rounded-[32px] shadow-2xl theme-card border -->
        <div class="flex-1 ep-card rounded-[32px] shadow-2xl overflow-hidden ep-border transition-all">

          <!-- 카드 헤더: 레퍼런스 bg-black/5 dark:bg-white/10 -->
          <div class="px-8 py-6 flex justify-between items-center ep-border-b ep-list-header">
            <span class="text-xs font-black uppercase tracking-widest ep-text">
              전체 <span class="ep-text-accent">{{ episodes.length }}</span>화
            </span>
            <!-- 정렬 버튼: 레퍼런스 underline 스타일 -->
            <div class="flex space-x-5 text-[10px] font-black ep-text-sub uppercase tracking-widest">
              <button
                @click="sortOrder = 'asc'"
                class="transition-colors hover:ep-text-accent"
                :class="sortOrder === 'asc' ? 'ep-sort-underline ep-text' : ''"
              >목록순</button>
              <button
                @click="sortOrder = 'desc'"
                class="transition-colors hover:ep-text-accent"
                :class="sortOrder === 'desc' ? 'ep-sort-underline ep-text' : ''"
              >최신순</button>
            </div>
          </div>

          <!-- 로딩 스켈레톤 -->
          <div v-if="episodes.length === 0 && isSyncing">
            <div v-for="i in 5" :key="i" class="p-6 flex items-center ep-border-b">
              <div class="w-20 aspect-cover rounded-xl flex-shrink-0 shimmer mr-6"></div>
              <div class="flex-1 space-y-3">
                <div class="h-4 rounded-full shimmer w-3/4"></div>
                <div class="h-3 rounded-full shimmer w-1/3"></div>
              </div>
            </div>
          </div>

          <!-- 빈 상태 -->
          <div v-else-if="episodes.length === 0" class="flex items-center justify-center py-32">
            <p class="ep-text-muted text-sm font-bold">표시할 회차가 없습니다.</p>
          </div>

          <!-- 에피소드 목록 -->
          <!-- 레퍼런스: divide-y, p-6 flex items-center, hover:bg-black/5 -->
          <div v-else class="ep-divide-y no-scrollbar">
            <div
              v-for="ep in sortedEpisodes"
              :key="ep.id"
              @click="startReading(ep)"
              class="ep-episode-row p-6 flex items-center cursor-pointer transition-all group"
            >
              <!-- 썸네일: 레퍼런스의 aspect-[1/1.45] 세로 비율 + hover scale -->
              <div class="w-20 md:w-24 aspect-cover rounded-xl overflow-hidden ep-thumb-bg flex-shrink-0 shadow-md ep-border">
                <img
                  v-if="ep.thumbnail && ep.thumbnail !== NO_IMAGE_SVG"
                  :src="ep.thumbnail"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  @error="$event.target.style.display = 'none'"
                >
                <div v-else class="w-full h-full flex items-center justify-center text-2xl">
                  {{ getFileIcon(ep) }}
                </div>
              </div>

              <!-- 텍스트 정보 -->
              <!-- 레퍼런스: ml-6, tracking-tighter, group-hover:text-blue-600 -->
              <div class="ml-6 flex-grow overflow-hidden">
                <h5 class="font-bold text-sm md:text-base ep-text group-hover:ep-text-accent transition-colors truncate tracking-tighter">
                  {{ ep.name || ep.title }}
                </h5>
                <div class="flex items-center space-x-2 mt-1.5 ep-text-sub">
                  <p class="text-[11px] font-medium">
                    {{ formatDate(ep.createdTime) }}
                    <span v-if="ep.size"> · {{ formatSize(ep.size) }}</span>
                  </p>
                </div>
              </div>

              <!-- 읽음 체크: 레퍼런스 opacity-80 스타일 -->
              <div v-if="ep.isRead" class="ml-4 ep-text-accent opacity-80 flex-shrink-0">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293l-4 4a1 1 0 01-1.414 0l-2-2a1 1 0 111.414-1.414L9 10.586l3.293-3.293a1 1 0 111.414 1.414z"/>
                </svg>
              </div>
              <div v-else class="w-5 h-5 flex-shrink-0 ml-4"></div>
            </div>
          </div>

          <!-- End of Collection 마커 (레퍼런스 스타일) -->
          <div class="p-10 text-center ep-border-t ep-text-sub">
            <span class="font-black text-[10px] uppercase tracking-[0.3em]">End of Collection</span>
          </div>
        </div>

      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useStore } from '../composables/useStore';

const {
  selectedItem, episodes, isSyncing,
  startReading, refreshEpisodes,
  getThumbnailUrl, formatSize, NO_IMAGE_SVG,
  lastReadEpisode,
} = useStore();

// 정렬 상태 (localStorage 연동)
const sortOrder = ref(localStorage.getItem('TOKI_EP_SORT') || 'asc');
watch(sortOrder, (v) => localStorage.setItem('TOKI_EP_SORT', v));

// 정렬된 에피소드 목록
const sortedEpisodes = computed(() => {
  const arr = [...episodes.value];
  return sortOrder.value === 'asc' ? arr : arr.reverse();
});

function getFileIcon(ep) {
  const name = (ep.name || '').toLowerCase();
  if (name.endsWith('.cbz') || name.endsWith('.zip')) return '📖';
  if (name.endsWith('.epub')) return '📘';
  if (ep.media && ep.media.mediaType && !ep.media.mediaType.includes('folder')) return '📦';
  return '📁';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}.${mm}.${dd}`;
  } catch { return ''; }
}
</script>

<style scoped>
/* ──────────────────────────────────────
   전역 --t-* CSS 변수 기반 (레퍼런스 스타일)
────────────────────────────────────── */
.ep-view        { background-color: var(--t-bg); }
.ep-text        { color: var(--t-text); }
.ep-text-sub    { color: var(--t-text-sub); }
.ep-text-muted  { color: var(--t-text-muted); }
.ep-text-accent { color: var(--t-accent); }
.ep-thumb-bg    { background-color: var(--t-thumb-bg); }

/* 카드 컨테이너: 레퍼런스 theme-card 스타일 */
.ep-card        { background-color: var(--t-surface); color: var(--t-text); }
.ep-border      { border: 1px solid var(--t-border); }
.ep-border-b    { border-bottom: 1px solid var(--t-border); }
.ep-border-t    { border-top: 1px solid var(--t-border); }
.ep-divide-y > * + * { border-top: 1px solid var(--t-border); }

/* 커버: 레퍼런스 ring-8 ring-white/10 */
.ep-cover-ring {
  outline: 8px solid rgba(255, 255, 255, 0.08);
  outline-offset: -1px;
}

/* 리스트 헤더 배경: 레퍼런스 bg-black/5 dark:bg-white/10 */
.ep-list-header { background-color: var(--t-list-header-bg); }

/* 정렬 버튼: 레퍼런스 underline decoration-blue 스타일 */
.ep-sort-underline {
  text-decoration: underline;
  text-decoration-color: var(--t-accent);
  text-underline-offset: 4px;
  font-weight: 900;
}

/* 버튼 스타일 */
/* 첫 화 보기: 노란색 강조 버튼 */
.ep-btn-action {
  background-color: var(--t-btn-primary-bg);
  color: var(--t-btn-primary-text);
}
.ep-btn-action:hover { filter: brightness(0.96); }

/* 이어보기 */
.ep-btn-continue {
  background-color: var(--t-btn-continue-bg);
  color: var(--t-btn-continue-text);
  border: 1px solid var(--t-border);
}
.ep-btn-continue:hover { filter: brightness(1.05); }

/* 새로고침 */
.ep-btn-ghost {
  background-color: var(--t-btn-ghost-bg);
  color: var(--t-btn-ghost-text);
  border: 1px solid var(--t-border);
}
.ep-btn-ghost:hover { background-color: var(--t-surface-hover); }

/* 에피소드 행 호버: 레퍼런스 hover:bg-black/5 dark:hover:bg-white/10 */
.ep-episode-row:hover { background-color: var(--t-surface-hover); }
.ep-episode-row:hover .ep-text { color: var(--t-accent); }

/* no-scrollbar */
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
