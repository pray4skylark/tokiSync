<template>
  <teleport to="body">
    <transition name="modal-fade">
      <div v-if="showSettings" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-8">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showSettings = false"></div>
        
        <!-- Modal Container -->
        <div class="relative w-full max-w-2xl bg-theme-surface border border-white/10 rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all duration-300 transform scale-100">
          
          <!-- Header -->
          <div class="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-black/20">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm">⚙️</div>
              <h2 class="text-xl font-black tracking-tight text-theme-text uppercase italic">Settings <span class="text-blue-500 font-normal not-italic ml-2 opacity-50 text-sm tracking-widest uppercase">v1.7.0</span></h2>
            </div>
            <button @click="showSettings = false" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-theme-muted transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <!-- Tabs Nav -->
          <div class="flex px-6 pt-4 space-x-2 bg-black/10">
            <button 
              v-for="tab in tabItems" :key="tab.id"
              @click="activeTab = tab.id"
              class="px-6 py-3 rounded-t-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center space-x-2"
              :class="activeTab === tab.id ? 'bg-theme-surface text-blue-500 border-t border-x border-white/10' : 'text-theme-muted hover:text-theme-text hover:bg-white/5'"
            >
              <span>{{ tab.icon }}</span>
              <span>{{ tab.label }}</span>
            </button>
          </div>

          <!-- Content Scroll Area -->
          <div class="flex-1 overflow-y-auto p-8 custom-scrollbar bg-theme-surface">
            
            <!-- Tab: Cloud -->
            <transition name="fade-slide" mode="out-in">
              <div v-if="activeTab === 'cloud'" class="space-y-8 py-2">
                <div class="space-y-1">
                  <p class="text-[9px] font-black text-blue-500 uppercase tracking-widest ml-1">GAS Deployment</p>
                  <p class="text-xs text-theme-muted mb-4 ml-1">Google Apps Script의 ID와 드라이브 폴더 ID를 설정합니다.</p>
                  <div class="space-y-4">
                    <div class="group">
                      <p class="text-[8px] font-bold text-theme-muted uppercase mb-1.5 ml-1">Deployment ID</p>
                      <input v-model="config.deploymentId" placeholder="AKfycbz..." class="setting-input">
                    </div>
                    <div class="group">
                      <p class="text-[8px] font-bold text-theme-muted uppercase mb-1.5 ml-1">API Key (Security)</p>
                      <input v-model="config.apiKey" type="password" placeholder="Your secret key" class="setting-input">
                    </div>
                    <div class="group">
                      <p class="text-[8px] font-bold text-theme-muted uppercase mb-1.5 ml-1">Drive Folder ID</p>
                      <input v-model="config.folderId" placeholder="Root Folder ID" class="setting-input">
                    </div>
                    <button @click="saveCloudConfig" class="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center space-x-2">
                      <span>💾</span> <span>SAVE CONFIGURATION</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Tab: Viewer -->
              <div v-else-if="activeTab === 'viewer'" class="space-y-8 py-2">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="col-span-1 md:col-span-2 text-[9px] font-black text-blue-500 uppercase tracking-widest ml-1 mb-2">Display & Layout</div>
                  
                  <label class="setting-toggle">
                    <div class="flex flex-col">
                      <span class="text-[11px] font-black text-theme-text uppercase">Double Page</span>
                      <span class="text-[9px] text-theme-muted uppercase">2쪽 보기 활성화 (Manga)</span>
                    </div>
                    <input type="checkbox" v-model="viewerDefaults.spread" class="setting-checkbox">
                  </label>

                  <label class="setting-toggle">
                    <div class="flex flex-col">
                      <span class="text-[11px] font-black text-theme-text uppercase">RTL Reading</span>
                      <span class="text-[9px] text-theme-muted uppercase">오른쪽에서 왼쪽으로 읽기</span>
                    </div>
                    <input type="checkbox" v-model="viewerDefaults.rtl" class="setting-checkbox">
                  </label>

                  <label class="setting-toggle">
                    <div class="flex flex-col">
                      <span class="text-[11px] font-black text-theme-text uppercase">Cover First</span>
                      <span class="text-[9px] text-theme-muted uppercase">첫 장은 항상 1쪽으로 표시</span>
                    </div>
                    <input type="checkbox" v-model="viewerDefaults.coverFirst" class="setting-checkbox">
                  </label>

                  <div class="col-span-1 md:col-span-2 border-t border-white/5 my-2"></div>
                  <div class="col-span-1 md:col-span-2 text-[9px] font-black text-theme-accent uppercase tracking-widest ml-1 mb-2">v1.7.0 Turbo Engine</div>

                  <label class="setting-toggle border-theme-accent/20 hover:border-theme-accent/50">
                    <div class="flex flex-col">
                      <span class="text-[11px] font-black text-theme-accent uppercase tracking-tighter">Auto-Crop Margin</span>
                      <span class="text-[9px] text-theme-muted uppercase opacity-70">여백 자동 감지 및 제거</span>
                    </div>
                    <input type="checkbox" v-model="viewerDefaults.autoCrop" class="setting-checkbox accent-theme-accent">
                  </label>

                  <label class="setting-toggle border-theme-accent/20 hover:border-theme-accent/50">
                    <div class="flex flex-col">
                      <span class="text-[11px] font-black text-theme-accent uppercase tracking-tighter">Virtual Scroll</span>
                      <span class="text-[9px] text-theme-muted uppercase opacity-70">대용량 이미지 렌더링 최적화</span>
                    </div>
                    <input type="checkbox" v-model="viewerDefaults.virtualScroll" class="setting-checkbox accent-theme-accent">
                  </label>
                </div>
              </div>

              <!-- Tab: Data -->
              <div v-else-if="activeTab === 'data'" class="space-y-8 py-2">
                <div class="space-y-4">
                  <div class="text-[9px] font-black text-red-500 uppercase tracking-widest ml-1 mb-2">Maintenance</div>
                  <button @click="forceCloudSync" class="w-full bg-theme-surface-hover border border-white/5 hover:border-blue-500/30 p-6 rounded-[24px] text-left transition-all flex items-center justify-between group">
                    <div class="flex flex-col">
                      <span class="text-sm font-black text-theme-text uppercase">Force Cloud Sync</span>
                      <span class="text-[10px] text-theme-muted uppercase">강제 데이터 백업 및 동기화</span>
                    </div>
                    <span class="text-xl group-hover:translate-x-1 transition-transform">🔄</span>
                  </button>
                  <button @click="reloadApp" class="w-full bg-theme-surface-hover border border-white/5 hover:border-theme-accent/30 p-6 rounded-[24px] text-left transition-all flex items-center justify-between group">
                    <div class="flex flex-col">
                      <span class="text-sm font-black text-theme-text uppercase">Relod Application</span>
                      <span class="text-[10px] text-theme-muted uppercase">앱 강제 새로고침</span>
                    </div>
                    <span class="text-xl group-hover:rotate-180 transition-transform duration-500">♻️</span>
                  </button>
                </div>
              </div>
            </transition>
          </div>

          <!-- Footer Info -->
          <div class="px-8 py-5 border-t border-white/5 bg-black/20 flex justify-between items-center">
            <p class="text-[8px] font-black text-theme-muted uppercase tracking-[0.3em]">Built for Advanced Readers</p>
            <p class="text-[8px] font-black text-theme-muted uppercase tracking-[0.3em]">TokiSync Stable</p>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref } from 'vue';
import { useStore } from '../composables/useStore';

const { showSettings, config, viewerDefaults, forceCloudSync, saveCloudConfig, reloadApp } = useStore();

const activeTab = ref('cloud');
const tabItems = [
  { id: 'cloud', label: 'Cloud', icon: '☁️' },
  { id: 'viewer', label: 'Viewer', icon: '📖' },
  { id: 'data', label: 'Data', icon: '🛠️' },
];
</script>

<style scoped>
.setting-input {
  @apply w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-sm outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/30 transition-all text-white placeholder:text-zinc-600;
}

.setting-toggle {
  @apply flex items-center justify-between p-5 rounded-[24px] bg-black/20 border border-white/5 hover:border-blue-500/30 transition-all cursor-pointer;
}

.setting-checkbox {
  @apply w-5 h-5 rounded-lg accent-blue-600 cursor-pointer;
}

.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
}
.modal-fade-enter-active .scale-100 {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-fade-enter-from .scale-100 {
  transform: scale(0.9);
}

.fade-slide-enter-active, .fade-slide-leave-active {
  transition: all 0.2s ease-out;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  @apply bg-transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  @apply bg-white/10 rounded-full hover:bg-white/20;
}
</style>
