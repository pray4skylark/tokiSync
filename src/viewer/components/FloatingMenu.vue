<template>
  <teleport to="body">
    <div class="fixed bottom-8 right-6 md:right-8 z-40 flex flex-col-reverse items-center gap-3"
         @click.outside="expanded = false">

      <!-- Action buttons -->
      <transition-group name="fab-pop">
        <button
          v-for="action in actions" :key="action.id"
          v-show="expanded"
          @click.stop="$emit('action', action.id); expanded = false"
          class="fab-action flex items-center gap-2 group">
          <span class="text-[11px] font-black text-white bg-zinc-900/95 backdrop-blur-xl px-3 py-1.5 rounded-xl shadow-lg
                       opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200
                       whitespace-nowrap pointer-events-none">
            {{ action.label }}
          </span>
          <div class="w-11 h-11 rounded-full bg-theme-surface border border-white/10 shadow-xl
                      flex items-center justify-center
                      hover:bg-theme-accent hover:text-white hover:border-theme-accent hover:scale-110
                      active:scale-95 transition-all duration-200">
            <span v-html="action.icon" class="w-5 h-5 inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"></span>
          </div>
        </button>
      </transition-group>

      <!-- Main FAB -->
      <button
        @click.stop="expanded = !expanded"
        :class="expanded
          ? 'bg-theme-accent text-white rotate-45 shadow-lg shadow-theme-accent/30 border-theme-accent'
          : 'bg-theme-surface border border-white/10 text-theme-text shadow-xl shadow-black/20'"
        class="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all duration-300
               hover:shadow-2xl active:scale-95">
        <svg class="w-6 h-6 transition-transform duration-300" :class="expanded ? 'rotate-0' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
        </svg>
      </button>
    </div>
  </teleport>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  actions: {
    type: Array,
    required: true
    // [{ id, icon, label }]
  }
});

defineEmits(['action']);

const expanded = ref(false);
</script>

<style scoped>
.fab-pop-enter-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fab-pop-leave-active {
  transition: all 0.15s ease-in;
}
.fab-pop-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.8);
}
.fab-pop-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.7);
}
</style>
