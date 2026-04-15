<template>
  <nav class="sticky top-0 z-50 glass-header px-8 py-5 flex justify-between items-center text-theme-text transition-colors">
    <div class="flex items-center space-x-10">
      <button v-if="currentView === 'episodes'" @click="goBackToLibrary" class="p-2 hover:bg-theme-surface-hover rounded-full transition-all">
        <svg class="w-6 h-6 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"></path></svg>
      </button>
      <div v-if="currentView === 'library'" class="flex items-center space-x-3 cursor-pointer group" @click="reloadApp">
        <div class="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg">TS</div>
        <h1 class="text-2xl font-black tracking-tighter uppercase group-hover:text-theme-accent transition-colors italic text-theme-text">TokiSync <span class="text-yellow-400">⚡️</span></h1>
      </div>
    </div>
    <div class="flex items-center space-x-3">
      <div v-if="isSyncing" class="flex items-center text-[10px] font-black text-theme-accent uppercase tracking-[0.3em] mr-3">
        <svg class="w-3.5 h-3.5 animate-spin mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
        Syncing
      </div>
      <!-- 테마 토글: 항상 표시 -->
      <button
        @click="toggleTheme"
        class="w-9 h-9 flex items-center justify-center rounded-full transition-all hover:bg-theme-surface-hover text-theme-text"
        :title="appTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'"
      >
        <span class="text-base leading-none">{{ appTheme === 'dark' ? '☀️' : '🌙' }}</span>
      </button>
      <button 
        @click="currentView = 'downloads'" 
        class="w-9 h-9 flex items-center justify-center text-theme-sub hover:text-theme-text transition-colors rounded-full hover:bg-theme-surface-hover"
        :class="{'text-theme-text': currentView === 'downloads'}"
        title="다운로드 관리자"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
      </button>
      <button @click="showSettings = !showSettings" class="w-9 h-9 flex items-center justify-center text-theme-sub hover:text-theme-text transition-colors rounded-full hover:bg-theme-surface-hover" :class="{'text-theme-text': showSettings}">⚙️</button>

    </div>
  </nav>
</template>

<script setup>
import { useStore } from '../composables/useStore';
const { currentView, showSettings, isAddModalOpen, isSyncing, goBackToLibrary, reloadApp, appTheme, toggleTheme } = useStore();
</script>
