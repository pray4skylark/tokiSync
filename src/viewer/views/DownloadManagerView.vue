<template>
  <transition name="slide-up">
    <div v-if="showDownloadManager" class="fixed inset-0 z-[4000] flex items-end justify-center sm:items-center p-0 sm:p-6 overflow-hidden">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="showDownloadManager = false"></div>

      <!-- Modal Content -->
      <div class="relative w-full max-w-2xl bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-[32px] sm:rounded-[32px] flex flex-col shadow-2xl max-h-[90vh] overflow-hidden">
        
        <!-- Header -->
        <div class="p-8 flex items-center justify-between border-b border-white/5">
          <div class="flex items-center space-x-6">
            <button @click="showDownloadManager = false" class="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-2xl transition-all group">
              <svg class="w-6 h-6 text-zinc-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div>
              <h2 class="text-2xl font-black text-white uppercase tracking-tighter">Download Manager</h2>
              <p class="text-[10px] font-black ep-text-accent uppercase tracking-[0.2em]">Background Queue Management</p>
            </div>
          </div>
          
          <div class="flex items-center space-x-3">
            <button 
              @click="runGC()" 
              :disabled="isGCRunning"
              class="px-5 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-black transition-all hover:scale-105 disabled:opacity-50"
            >
              <span v-if="isGCRunning" class="flex items-center">
                <svg class="w-3 h-3 animate-spin mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                CLEANING...
              </span>
              <span v-else>CLEAN CACHE</span>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto no-scrollbar p-8">
          <div v-if="downloadQueue.length === 0" class="flex flex-col items-center justify-center py-20 text-center opacity-40">
            <div class="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            </div>
            <p class="text-sm font-bold text-zinc-400 tracking-wider">현재 다운로드 중인 에피소드가 없습니다.</p>
          </div>

          <div v-else class="space-y-4">
            <div 
              v-for="item in downloadQueue" 
              :key="item.id" 
              class="p-6 bg-white/[0.03] border border-white/5 rounded-[24px] flex flex-col space-y-4 transition-all hover:bg-white/[0.05]"
            >
              <div class="flex justify-between items-start">
                <div class="min-w-0 pr-4">
                  <p class="text-[9px] font-black ep-text-accent uppercase tracking-widest mb-1">{{ item.seriesId }}</p>
                  <h3 class="text-base font-black text-white truncate">{{ item.title }}</h3>
                </div>
                <div class="flex-shrink-0">
                  <span 
                    class="px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter"
                    :class="{
                      'bg-blue-500/20 text-blue-400': item.status === 'downloading',
                      'bg-green-500/20 text-green-400': item.status === 'completed',
                      'bg-red-500/20 text-red-400': item.status === 'failed',
                      'bg-zinc-500/20 text-zinc-400': item.status === 'pending',
                    }"
                  >
                    {{ item.status }}
                  </span>
                </div>
              </div>

              <!-- Progress -->
              <div class="space-y-2">
                <div class="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  <span>Progress</span>
                  <span class="text-zinc-300">{{ item.progress }}%</span>
                </div>
                <div class="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div 
                    class="h-full bg-blue-500 transition-all duration-300 ease-out"
                    :class="{'bg-green-500': item.status === 'completed', 'bg-red-500': item.status === 'failed'}"
                    :style="{ width: item.progress + '%' }"
                  ></div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex justify-end pt-2">
                <button 
                  @click="removeTask(item.id)" 
                  class="text-[10px] font-black ep-text-accent hover:text-white transition-colors uppercase tracking-widest px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg"
                >
                  {{ item.status === 'downloading' || item.status === 'pending' ? 'CANCEL' : 'REMOVE' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-8 bg-black/20 border-t border-white/5">
          <p class="text-[10px] font-medium text-zinc-500 text-center leading-relaxed">
            최대 5개의 에피소드가 IndexedDB에 자동 캐시됩니다 (LRU).<br>
            캐시된 에피소드는 오프라인 상태에서도 시청이 가능합니다.
          </p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useStore } from '../composables/useStore.js';
import { useDownloadManager } from '../composables/useDownloadManager.js';

const { showDownloadManager } = useStore();
const { downloadQueue, removeTask, runGC, isGCRunning } = useDownloadManager();

// ESC 키로 닫기 지원
const handleEsc = (e) => {
  if (e.key === 'Escape' && showDownloadManager.value) {
    showDownloadManager.value = false;
  }
};

onMounted(() => window.addEventListener('keydown', handleEsc));
onUnmounted(() => window.removeEventListener('keydown', handleEsc));
</script>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from, .slide-up-leave-to {
  opacity: 0;
  transform: translateY(100px);
}

/* Glass effect for modal */
.bg-zinc-900 {
  background-color: rgba(24, 24, 27, 0.95);
  backdrop-filter: blur(20px);
}

.ep-text-accent {
  color: #4a90e2;
}
</style>
