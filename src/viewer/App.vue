<template>
  <div class="min-h-screen flex flex-col">
    <!-- Header & Settings (hidden in reader) -->
    <NavHeader v-if="currentView !== 'viewer'" />
    <SettingsPanel />

    <!-- View Router -->
    <transition name="fade" mode="out-in">
      <LibraryView v-if="currentView === 'library'" key="library" />
      <EpisodesView v-else-if="currentView === 'episodes'" key="episodes" />
      <ReaderView v-else-if="currentView === 'viewer'" key="viewer" />
    </transition>

    <!-- Global Modals -->
    <EpisodeListModal />
    <AddModal />
    <NotificationToast />
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useStore } from './composables/useStore';

// Components
import NavHeader from './components/NavHeader.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import EpisodeListModal from './components/EpisodeListModal.vue';
import AddModal from './components/AddModal.vue';
import NotificationToast from './components/NotificationToast.vue';

// Views
import LibraryView from './views/LibraryView.vue';
import EpisodesView from './views/EpisodesView.vue';
import ReaderView from './views/ReaderView.vue';

const { currentView, initApp } = useStore();

onMounted(initApp);
</script>
