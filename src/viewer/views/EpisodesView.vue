<template>
  <main class="w-full min-h-screen bg-[#0f0f10]">
    <!-- Hero Section -->
    <div class="relative w-full h-[550px] md:h-[750px] overflow-hidden">
      <img :src="getThumbnailUrl(selectedItem)" class="absolute inset-0 w-full h-full object-cover blur-[100px] opacity-20 scale-150">
      <div class="absolute inset-0 bg-gradient-to-b from-transparent via-black/60 to-[#0f0f10]"></div>
      <div class="relative max-w-6xl mx-auto h-full flex flex-col md:flex-row items-end p-12 md:p-24 gap-20 text-white">
        <div class="hidden md:block w-80 shadow-2xl rounded-[50px] overflow-hidden aspect-cover border border-white/10 ring-[25px] ring-white/5 transform -rotate-3">
          <img :src="getThumbnailUrl(selectedItem)" class="w-full h-full object-cover">
        </div>
        <div class="pb-12 flex-grow text-white">
          <h2 class="text-7xl md:text-9xl font-black mb-12 tracking-tighter leading-[0.85] uppercase italic">{{ selectedItem?.name || selectedItem?.title }}</h2>
          <div class="flex gap-8">
            <button v-if="episodes.length > 0" @click="startReading(episodes[0])" class="bg-white text-black px-20 py-6 rounded-[32px] font-black shadow-2xl transition-all hover:bg-blue-500 hover:text-white hover:scale-105 active:scale-95 tracking-[0.2em] text-sm uppercase">Read Now</button>
            <button @click="goBackToLibrary" class="bg-white/5 text-zinc-600 px-12 py-6 rounded-[32px] font-black border border-white/5 transition-all hover:bg-white/10 hover:text-white tracking-widest text-xs uppercase">Back</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Episode List -->
    <div class="max-w-6xl mx-auto p-12 md:p-24 pt-0">
      <!-- Loading -->
      <div v-if="episodes.length === 0 && isSyncing" class="text-center py-20">
        <p class="text-zinc-600 text-lg">회차 목록 로딩 중...</p>
      </div>

      <!-- Empty -->
      <div v-else-if="episodes.length === 0" class="text-center py-20">
        <p class="text-zinc-600 text-lg">표시할 회차가 없습니다.</p>
      </div>

      <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div v-for="ep in episodes" :key="ep.id" @click="startReading(ep)" class="flex items-center p-8 rounded-[40px] bg-white/5 hover:bg-white/10 border border-white/5 hover:border-blue-500/50 transition-all cursor-pointer group">
          <div class="w-16 h-16 md:w-20 md:h-20 rounded-[16px] overflow-hidden bg-zinc-900 relative shadow-2xl flex-shrink-0 flex items-center justify-center">
            <span class="text-2xl">{{ getFileIcon(ep) }}</span>
            <div v-if="ep.isRead" class="absolute inset-0 bg-blue-900/40 flex items-center justify-center text-[9px] font-black tracking-[0.3em] text-white uppercase backdrop-blur-[2px]">Read</div>
          </div>
          <div class="ml-10 flex-grow overflow-hidden text-white">
            <h5 class="font-black text-lg md:text-2xl group-hover:text-blue-400 transition-colors uppercase italic truncate tracking-tighter">{{ ep.name || ep.title }}</h5>
            <p class="text-[10px] text-zinc-600 font-black uppercase tracking-[0.3em] mt-3">{{ formatSize(ep.size) }}</p>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { useStore } from '../composables/useStore';
const { selectedItem, episodes, isSyncing, startReading, goBackToLibrary, getThumbnailUrl, formatSize } = useStore();

function getFileIcon(ep) {
  const name = (ep.name || '').toLowerCase();
  if (name.endsWith('.cbz') || name.endsWith('.zip')) return '📖';
  if (name.endsWith('.epub')) return '📘';
  if (ep.media && ep.media.mediaType && !ep.media.mediaType.includes('folder')) return '📦';
  return '📁';
}
</script>
