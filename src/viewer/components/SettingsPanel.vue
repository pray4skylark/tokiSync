<template>
  <transition name="fade">
    <div v-if="showSettings" class="bg-[#1c1c1e] p-12 border-b border-white/5 text-white shadow-2xl">
      <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-16">
        <div class="space-y-6 text-white">
          <h3 class="text-[10px] font-black text-[#00d084] uppercase tracking-[0.4em] mb-8 text-center md:text-left">Cloud Gateway</h3>
          <div class="space-y-4">
            <input v-model="config.deploymentId" placeholder="GAS Script ID" class="w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-xs outline-none focus:ring-1 focus:ring-blue-500 transition-all text-white">
            <input v-model="config.apiKey" type="password" placeholder="Security Key" class="w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-xs outline-none focus:ring-1 focus:ring-blue-500 transition-all text-white">
            <input v-model="config.folderId" placeholder="Drive Folder ID" class="w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-xs outline-none focus:ring-1 focus:ring-blue-500 transition-all text-white">
            <button @click="saveCloudConfig" class="w-full bg-[#00d084]/20 hover:bg-[#00d084]/30 border border-[#00d084]/30 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-[#00d084] transition-all">Save Config</button>
          </div>
        </div>
        <div class="space-y-6 text-center md:text-left">
          <h3 class="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mb-8">Preference</h3>
          <div class="grid grid-cols-1 gap-4 text-xs text-zinc-400 font-bold uppercase tracking-tight">
            <label class="flex items-center space-x-4 cursor-pointer bg-black/20 p-5 rounded-2xl border border-white/5 hover:border-blue-500/50 transition-all">
              <input type="checkbox" v-model="viewerDefaults.spread" class="w-4 h-4 rounded accent-blue-600"> <span>Double Page View</span>
            </label>
            <label class="flex items-center space-x-4 cursor-pointer bg-black/20 p-5 rounded-2xl border border-white/5 hover:border-blue-500/50 transition-all">
              <input type="checkbox" v-model="viewerDefaults.rtl" class="w-4 h-4 rounded accent-blue-600"> <span>RTL Reading (Japan)</span>
            </label>
            <label class="flex items-center space-x-4 cursor-pointer bg-black/20 p-5 rounded-2xl border border-white/5 hover:border-blue-500/50 transition-all">
              <input type="checkbox" v-model="viewerDefaults.coverFirst" class="w-4 h-4 rounded accent-blue-600"> <span>Cover First</span>
            </label>
          </div>
        </div>
        <div class="space-y-6 text-center md:text-left">
          <h3 class="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em] mb-8">Data Control</h3>
          <button @click="forceCloudSync" class="w-full bg-zinc-800 hover:bg-zinc-700 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Force Push Backup</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { useStore } from '../composables/useStore';
const { showSettings, config, viewerDefaults, forceCloudSync, saveCloudConfig } = useStore();
</script>
