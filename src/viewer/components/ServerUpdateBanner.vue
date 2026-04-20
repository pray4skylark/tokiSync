<template>
  <transition name="slide-down">
    <div v-if="needsServerUpdate" class="w-full bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-10 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 flex-shrink-0 bg-red-500/20 rounded-full flex items-center justify-center text-red-500">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        </div>
        <div>
          <p class="text-sm font-black text-red-400 uppercase tracking-tighter">Backend Update Required</p>
          <p class="text-xs text-zinc-400 font-medium tracking-tight mt-1">
            구형 GAS 서버가 감지되었습니다 (v1.8.0 권장). 정상 작동 및 최신 기능 지원을 위해 배포 가이드를 참고하여 서버를 업데이트 해주세요.
          </p>
        </div>
      </div>
      <a href="https://github.com/pray4skylark/tokiSync/blob/main/INSTALL_GUIDE.md" target="_blank"
         class="px-6 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-red-500/30">
        설치 가이드 보기
      </a>
    </div>
  </transition>
</template>

<script setup>
import { useStore } from '../composables/useStore';
const { needsServerUpdate } = useStore();
</script>

<style scoped>
.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-down-enter-from, .slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
