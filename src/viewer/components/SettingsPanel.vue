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
              <div class="w-8 h-8 bg-theme-accent rounded-lg flex items-center justify-center text-sm">⚙️</div>
              <h2 class="text-xl font-black tracking-tight text-theme-text uppercase italic">Settings <span class="text-theme-accent font-normal not-italic ml-2 opacity-50 text-sm tracking-widest uppercase">v{{ appVersion }}</span></h2>
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
              :class="activeTab === tab.id ? 'bg-theme-surface text-theme-accent border-t border-x border-white/10' : 'text-theme-muted hover:text-theme-text hover:bg-white/5'"
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
                  <p class="text-[9px] font-black text-theme-accent uppercase tracking-widest ml-1">GAS Deployment</p>
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
                    <button @click="saveCloudConfig" class="w-full mt-4 bg-theme-accent hover:brightness-110 text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] shadow-lg shadow-theme-accent transition-all flex items-center justify-center space-x-2">
                      <span>💾</span> <span>SAVE CONFIGURATION</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Tab: Viewer -->
              <div v-else-if="activeTab === 'viewer'" class="space-y-8 py-2">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="col-span-1 md:col-span-2 text-[9px] font-black text-theme-accent uppercase tracking-widest ml-1 mb-2">Display & Layout</div>
                  
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
                  <div class="col-span-1 md:col-span-2 text-[9px] font-black text-theme-accent uppercase tracking-widest ml-1 mb-2">v{{ appVersion }} Turbo Engine</div>

                  <label class="setting-toggle border-theme-accent hover:border-theme-accent">
                    <div class="flex flex-col">
                      <span class="text-[11px] font-black text-theme-accent uppercase tracking-tighter">Auto-Crop Margin</span>
                      <span class="text-[9px] text-theme-muted uppercase opacity-70">여백 자동 감지 및 제거</span>
                    </div>
                    <input type="checkbox" v-model="viewerDefaults.autoCrop" class="setting-checkbox accent-theme-accent">
                  </label>

                  <label class="setting-toggle border-theme-accent hover:border-theme-accent">
                    <div class="flex flex-col">
                      <span class="text-[11px] font-black text-theme-accent uppercase tracking-tighter">Virtual Scroll</span>
                      <span class="text-[9px] text-theme-muted uppercase opacity-70">대용량 이미지 렌더링 최적화</span>
                    </div>
                    <input type="checkbox" v-model="viewerDefaults.virtualScroll" class="setting-checkbox accent-theme-accent">
                  </label>

                  <label class="setting-toggle border-theme-accent hover:border-theme-accent">
                    <div class="flex flex-col">
                      <span class="text-[11px] font-black text-theme-accent uppercase tracking-tighter">Background Preload</span>
                      <span class="text-[9px] text-theme-muted uppercase opacity-70">다음 화 백그라운드 사전 다운로드</span>
                    </div>
                    <input type="checkbox" v-model="viewerDefaults.preloadNext" class="setting-checkbox accent-theme-accent">
                  </label>

                  <!-- [v1.7.4] Download Threads Selection -->
                  <div class="col-span-1 md:col-span-2 p-5 rounded-[24px] bg-black/20 border border-theme-accent flex items-center justify-between">
                    <div class="flex flex-col">
                      <span class="text-[11px] font-black text-theme-accent uppercase tracking-tighter">Download Threads</span>
                      <span class="text-[9px] text-theme-muted uppercase opacity-70">동시 다운로드 스레드 (4G: 2 추천)</span>
                    </div>
                    <select v-model.number="viewerDefaults.downloadThreads" class="bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-theme-accent outline-none focus:border-theme-accent transition-all uppercase italic tracking-widest">
                      <option :value="1">1 Thread</option>
                      <option :value="2">2 Threads</option>
                      <option :value="3">3 Threads</option>
                    </select>
                  </div>

                  <!-- [v2.1] Viewer Engine Version Selection -->
                  <div class="col-span-1 md:col-span-2 p-5 rounded-[24px] bg-black/20 border border-theme-accent flex items-center justify-between">
                    <div class="flex flex-col">
                      <span class="text-[11px] font-black text-theme-accent uppercase tracking-tighter">Viewer Engine</span>
                      <span class="text-[9px] text-theme-muted uppercase opacity-70">V1: Legacy / V2: Progress Tracking (BETA)</span>
                    </div>
                    <select v-model.number="viewerDefaults.viewerVersion" class="bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-theme-accent outline-none focus:border-theme-accent transition-all uppercase italic tracking-widest">
                      <option :value="1">V1 Standard</option>
                      <option :value="2">V2 Progress</option>
                    </select>
                  </div>

                  <div class="col-span-1 md:col-span-2 border-t border-white/5 my-2"></div>
                  <div class="col-span-1 md:col-span-2 text-[9px] font-black text-theme-accent uppercase tracking-widest ml-1 mb-2">Touch Navigation Controls</div>

                  <!-- 5방향 터치 매핑 조작 섹션 -->
                  <div class="col-span-1 md:col-span-2 p-5 rounded-[24px] bg-black/20 border border-white/5 flex flex-col space-y-4">
                    <div class="flex flex-col">
                      <span class="text-[11px] font-black text-theme-text uppercase">Touch Area Actions</span>
                      <span class="text-[9px] text-theme-muted uppercase">화면 터치 영역별 동작을 커스터마이징합니다.</span>
                    </div>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div class="flex items-center justify-between bg-black/30 p-3 rounded-xl border border-white/5">
                        <span class="text-[10px] font-bold text-zinc-400 uppercase">상단 (Top)</span>
                        <select v-model="viewerDefaults.touchMapping.top" class="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-black text-theme-accent outline-none">
                          <option value="prev">이전 (Prev)</option>
                          <option value="next">다음 (Next)</option>
                          <option value="toggle">메뉴 (Toggle)</option>
                          <option value="none">없음 (None)</option>
                        </select>
                      </div>
                      
                      <div class="flex items-center justify-between bg-black/30 p-3 rounded-xl border border-white/5">
                        <span class="text-[10px] font-bold text-zinc-400 uppercase">하단 (Bottom)</span>
                        <select v-model="viewerDefaults.touchMapping.bottom" class="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-black text-theme-accent outline-none">
                          <option value="prev">이전 (Prev)</option>
                          <option value="next">다음 (Next)</option>
                          <option value="toggle">메뉴 (Toggle)</option>
                          <option value="none">없음 (None)</option>
                        </select>
                      </div>
                      
                      <div class="flex items-center justify-between bg-black/30 p-3 rounded-xl border border-white/5">
                        <span class="text-[10px] font-bold text-zinc-400 uppercase">좌측 (Left)</span>
                        <select v-model="viewerDefaults.touchMapping.left" class="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-black text-theme-accent outline-none">
                          <option value="prev">이전 (Prev)</option>
                          <option value="next">다음 (Next)</option>
                          <option value="toggle">메뉴 (Toggle)</option>
                          <option value="none">없음 (None)</option>
                        </select>
                      </div>
                      
                      <div class="flex items-center justify-between bg-black/30 p-3 rounded-xl border border-white/5">
                        <span class="text-[10px] font-bold text-zinc-400 uppercase">우측 (Right)</span>
                        <select v-model="viewerDefaults.touchMapping.right" class="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-black text-theme-accent outline-none">
                          <option value="prev">이전 (Prev)</option>
                          <option value="next">다음 (Next)</option>
                          <option value="toggle">메뉴 (Toggle)</option>
                          <option value="none">없음 (None)</option>
                        </select>
                      </div>
                      
                      <div class="col-span-1 sm:col-span-2 flex items-center justify-between bg-black/30 p-3 rounded-xl border border-white/5">
                        <span class="text-[10px] font-bold text-zinc-400 uppercase">중앙 (Center)</span>
                        <select v-model="viewerDefaults.touchMapping.center" class="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-black text-theme-accent outline-none">
                          <option value="prev">이전 (Prev)</option>
                          <option value="next">다음 (Next)</option>
                          <option value="toggle">메뉴 (Toggle)</option>
                          <option value="none">없음 (None)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              <!-- Tab: Data -->
              <div v-else-if="activeTab === 'data'" class="space-y-8 py-2">
                
                <!-- 용량 정보 & 일괄 비우기 -->
                <div class="p-6 rounded-[24px] bg-black/20 border border-white/5 space-y-4">
                  <div class="flex justify-between items-center">
                    <div class="flex flex-col text-left">
                      <span class="text-[11px] font-black text-theme-accent uppercase tracking-widest">Offline Storage</span>
                      <span class="text-[9px] text-theme-muted uppercase mt-1">다운로드된 오프라인 캐시 용량입니다.</span>
                    </div>
                    <span class="text-sm font-black text-white bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
                      {{ formatSize(cachedTotalSize) }}
                    </span>
                  </div>
                  
                  <div v-if="cachedEpisodesList.length > 0">
                    <button @click="clearAllEpisodeCaches" class="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all">
                      🗑️ Clear All Caches (전체 삭제)
                    </button>
                  </div>
                </div>

                <!-- 캐시된 리스트 목록 -->
                <div class="space-y-3 text-left">
                  <span class="text-[9px] font-black text-theme-accent uppercase tracking-widest ml-1">Cached Episodes ({{ cachedEpisodesList.length }}개)</span>
                  
                  <div v-if="cachedEpisodesList.length === 0" class="text-center py-8 bg-black/10 rounded-[24px] border border-white/5 text-theme-muted text-xs uppercase">
                    캐시된 데이터가 없습니다.
                  </div>
                  
                  <div v-else class="max-h-[250px] overflow-y-auto space-y-2 custom-scrollbar pr-2">
                    <div v-for="ep in cachedEpisodesList" :key="ep.fileId" class="flex items-center justify-between p-4 rounded-xl bg-black/30 border border-white/5 hover:border-white/10 transition-all">
                      <div class="min-w-0 pr-4">
                        <p class="text-[8px] font-black text-theme-accent uppercase tracking-wider truncate">{{ ep.seriesTitle }}</p>
                        <p class="text-xs font-bold text-white truncate mt-0.5">{{ ep.episodeTitle }}</p>
                        <p class="text-[8px] text-zinc-500 mt-1 uppercase">{{ new Date(ep.cachedAt).toLocaleString() }}</p>
                      </div>
                      <div class="flex items-center space-x-3 flex-shrink-0">
                        <span class="text-[10px] font-bold text-zinc-400">{{ formatSize(ep.size) }}</span>
                        <button @click="deleteEpisodeCache(ep.fileId)" class="p-2 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-lg transition-all" title="삭제">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="col-span-1 md:col-span-2 border-t border-white/5 my-2"></div>

                <div class="space-y-4">
                  <div class="text-[9px] font-black text-red-500 uppercase tracking-widest ml-1 mb-2 text-left">Maintenance</div>
                  <button @click="forceCloudSync" class="w-full bg-theme-surface-hover border border-white/5 hover:border-theme-accent p-6 rounded-[24px] text-left transition-all flex items-center justify-between group">
                    <div class="flex flex-col">
                      <span class="text-sm font-black text-theme-text uppercase">Force Cloud Sync</span>
                      <span class="text-[10px] text-theme-muted uppercase">강제 데이터 백업 및 동기화</span>
                    </div>
                    <span class="text-xl group-hover:translate-x-1 transition-transform">🔄</span>
                  </button>
                  <button @click="reloadApp" class="w-full bg-theme-surface-hover border border-white/5 hover:border-theme-accent p-6 rounded-[24px] text-left transition-all flex items-center justify-between group">
                    <div class="flex flex-col">
                      <span class="text-sm font-black text-theme-text uppercase">Reload Application</span>
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
import { ref, watch } from 'vue';
import { useStore } from '../composables/useStore';

const { 
  showSettings, config, viewerDefaults, forceCloudSync, saveCloudConfig, reloadApp,
  formatSize, cachedEpisodesList, cachedTotalSize, loadOfflineCacheInfo, deleteEpisodeCache, clearAllEpisodeCaches
} = useStore();

const appVersion = typeof __VIEWER_VERSION__ !== 'undefined' ? __VIEWER_VERSION__ : '1.26.4';

const activeTab = ref('cloud');
const tabItems = [
  { id: 'cloud', label: 'Cloud', icon: '☁️' },
  { id: 'viewer', label: 'Viewer', icon: '📖' },
  { id: 'data', label: 'Data', icon: '🛠️' },
];

watch(activeTab, (tab) => {
  if (tab === 'data') {
    loadOfflineCacheInfo();
  }
});
</script>

<style scoped>
.setting-input {
  @apply w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-sm outline-none focus:ring-1 focus:ring-theme-accent focus:border-theme-accent transition-all text-white placeholder:text-zinc-600;
}

.setting-toggle {
  @apply flex items-center justify-between p-5 rounded-[24px] bg-black/20 border border-white/5 hover:border-theme-accent transition-all cursor-pointer;
}

.setting-checkbox {
  @apply w-5 h-5 rounded-lg accent-theme-accent cursor-pointer;
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
