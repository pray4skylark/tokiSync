<template>
  <main class="max-w-7xl mx-auto w-full p-10 md:p-16">
    <div class="flex flex-col md:flex-row justify-between items-end mb-16 gap-10">
      <div>
        <h2 class="text-4xl font-black tracking-tighter mb-4 italic text-white">My Collections</h2>
        <div class="flex space-x-2">
          <button v-for="tab in tabs" :key="tab.value" @click="currentTab = tab.value"
                  :class="currentTab === tab.value ? 'bg-blue-600 text-white' : 'bg-white/5 text-zinc-500'"
                  class="px-6 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest">{{ tab.label }}</button>
        </div>
      </div>
      <div class="flex items-center gap-4 w-full md:w-auto">
        <div class="relative flex-grow md:w-[400px] group">
          <input v-model="searchQuery" type="text" placeholder="Search..." class="w-full bg-white/5 border border-white/5 rounded-[24px] px-8 py-5 pl-16 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-white">
          <svg class="w-6 h-6 absolute left-6 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="3"></path></svg>
        </div>
        <button @click="refreshLibrary(true)" :disabled="isSyncing"
                class="w-14 h-14 flex-shrink-0 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-zinc-400 hover:text-white"
                :class="{ 'animate-spin': isSyncing }" title="새로고침">
          ↻
        </button>
      </div>
    </div>

    <!-- Not Configured State -->
    <div v-if="!isConfigured()" class="text-center py-32">
      <p class="text-zinc-600 text-lg mb-4">⚙️ GAS 서버 설정이 필요합니다.</p>
      <p class="text-zinc-700 text-sm">Tampermonkey 스크립트를 통해 자동 설정되거나,<br/>설정 패널에서 수동으로 입력해주세요.</p>
    </div>

    <!-- Shimmer Loading Skeleton -->
    <div v-else-if="isInitialLoading" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-10">
      <div v-for="i in 12" :key="i" class="space-y-4"><div class="aspect-cover rounded-[32px] shimmer shadow-2xl"></div></div>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredLibrary.length === 0" class="text-center py-32">
      <p class="text-zinc-600 text-lg">📚 저장된 작품이 없습니다.</p>
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-10">
      <div v-for="item in filteredLibrary" :key="item.id" @click="openSeries(item)" class="group cursor-pointer">
        <div class="relative aspect-cover rounded-[36px] overflow-hidden card-hover bg-zinc-900 shadow-2xl border border-white/5 transition-all">
          <img :src="getThumbnailUrl(item)" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
               @error="$event.target.src = NO_IMAGE_SVG">
        </div>
        <div class="mt-6 px-2 text-white">
          <h4 class="font-black text-sm truncate tracking-tighter group-hover:text-blue-400 transition-colors uppercase italic">{{ item.name || item.title }}</h4>
          <div class="flex justify-between items-center mt-2">
            <span class="text-[9px] font-black text-zinc-600 uppercase">{{ item.category || item.type || 'Unknown' }}</span>
            <span class="text-[9px] font-bold text-blue-500">{{ item.booksCount || 0 }} EPs</span>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { useStore } from '../composables/useStore';
const { currentTab, tabs, searchQuery, isInitialLoading, isSyncing, filteredLibrary, openSeries, refreshLibrary, isConfigured, getThumbnailUrl, NO_IMAGE_SVG } = useStore();
</script>
