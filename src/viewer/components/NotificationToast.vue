<template>
  <transition name="slide-up">
    <div v-if="notification" class="fixed bottom-16 left-1/2 -translate-x-1/2 z-[5000] bg-theme-accent text-white px-12 py-5 rounded-[32px] shadow-2xl font-black text-[10px] uppercase tracking-[0.4em] shadow-theme-accent border border-white/10">
      {{ notification }}
    </div>
  </transition>
</template>

<script setup>
import { useStore } from '../composables/useStore';
const { notification } = useStore();
</script>
