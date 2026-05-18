<template>
  <transition name="fade">
    <div v-if="showEpisodeModal" 
         class="fixed inset-0 z-[4000] flex items-center justify-center p-4 md:p-10 bg-black/80 backdrop-blur-3xl">
      <div class="bg-[#1c1c1e]/90 w-full max-w-2xl rounded-[40px] border border-white/10 shadow-2xl overflow-hidden text-white flex flex-col max-h-[85vh]">
        
        <!-- Header Section -->
        <div class="p-6 md:p-8 border-b border-white/5 flex justify-between items-start bg-white/5">
          <div>
            <h3 class="font-black text-2xl md:text-3xl tracking-tighter uppercase italic leading-none">{{ selectedItem?.title }}</h3>
            <p class="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-2">Episodes Directory</p>
          </div>
          <button @click="showEpisodeModal = false" class="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full transition-all text-2xl font-light">&times;</button>
        </div>

        <!-- Smart Action Bar: Integrated Read First / Resume -->
        <div class="p-6 md:p-8 bg-black/20 border-b border-white/5 flex items-center justify-between">
          <div class="flex-grow">
            <p v-if="lastReadEpisode" class="text-xs font-bold text-theme-accent uppercase tracking-tight mb-1">Recent Progress</p>
            <p class="text-sm font-black truncate max-w-[200px] md:max-w-xs">
              {{ lastReadEpisode ? lastReadEpisode.title : 'No history found' }}
            </p>
          </div>
          <button @click="handleSmartRead" 
                  class="bg-theme-accent hover:brightness-110 text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-tighter transition-all flex items-center shadow-lg shadow-theme-accent active:scale-95">
            <span v-if="lastReadEpisode">Continue Reading</span>
            <span v-else>Read First Episode</span>
            <svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
          </button>
        </div>

        <!-- Scrollable List Area -->
        <div class="flex-grow overflow-y-auto p-4 md:p-6 no-scrollbar space-y-3" ref="listContainer">
          <div v-for="ep in episodes" 
               :key="ep.id" 
               :ref="el => { if (ep.id === activeId) activeElement = el }"
               @click="startReading(ep)"
               class="flex items-center p-4 md:p-5 rounded-[28px] transition-all cursor-pointer group relative overflow-hidden"
               :class="[
                 currentEpisode?.id === ep.id ? 'bg-theme-accent shadow-xl shadow-theme-accent' : 'bg-white/5 hover:bg-white/10',
                 ep.isRead ? 'opacity-80' : 'opacity-100'
               ]">
            
            <!-- Read Indicator -->
            <div v-if="ep.isRead && currentEpisode?.id !== ep.id" class="absolute top-3 right-3 w-1.5 h-1.5 bg-theme-accent rounded-full"></div>

            <div class="w-20 md:w-28 aspect-video rounded-xl overflow-hidden bg-zinc-900 mr-5 md:mr-7 flex-shrink-0 border border-white/5">
              <img :src="ep.thumbnail" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="flex-grow min-w-0">
              <p class="text-sm md:text-base font-black tracking-tight truncate" :class="{'text-white': currentEpisode?.id === ep.id}">{{ ep.title }}</p>
              <div class="flex items-center mt-1 space-x-2">
                <p class="text-[9px] font-bold uppercase tracking-tight" :class="currentEpisode?.id === ep.id ? 'text-theme-accent' : 'text-zinc-500'">{{ ep.date }}</p>
                <span v-if="ep.isRead" class="text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-theme-accent/20 text-theme-accent">READ</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useStore } from '../composables/useStore';

const { showEpisodeModal, selectedItem, episodes, currentEpisode, lastReadEpisode, startReading } = useStore();

const listContainer = ref(null);
const activeElement = ref(null);

// ID to target for auto-scroll
const activeId = computed(() => currentEpisode.value?.id || lastReadEpisode.value?.id || episodes.value[0]?.id);

/**
 * Integrated Start/Resume logic
 */
function handleSmartRead() {
  if (lastReadEpisode.value) {
    startReading(lastReadEpisode.value);
  } else if (episodes.value.length > 0) {
    startReading(episodes.value[0]);
  }
}

/**
 * Auto-scroll to active episode when modal opens
 */
watch(showEpisodeModal, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    // Small delay to ensure styles/transitions are settled
    setTimeout(() => {
      if (activeElement.value) {
        activeElement.value.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }
});
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
