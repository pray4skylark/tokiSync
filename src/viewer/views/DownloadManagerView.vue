<template>
  <div class="downloads-container">
    <div class="header">
      <button class="back-btn" @click="currentView = 'library'">
        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <h2>Download Manager</h2>
      <div class="header-actions">
        <button class="clear-btn" @click="runGC()">Clean Cache</button>
      </div>
    </div>

    <div v-if="downloadQueue.length === 0" class="empty-state">
      <div class="icon">
        <svg viewBox="0 0 24 24" width="64" height="64"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
      </div>
      <p>현재 다운로드 중인 에피소드가 없습니다.</p>
    </div>

    <div v-else class="download-list">
      <div v-for="item in downloadQueue" :key="item.id" class="download-item" :class="item.status">
        <div class="item-info">
          <div class="title">{{ item.title }}</div>
          <div class="meta">{{ item.seriesId }} • Status: {{ item.status }}</div>
        </div>
        
        <div class="progress-section">
          <div class="progress-bar">
            <div class="progress-inner" :style="{ width: item.progress + '%' }"></div>
          </div>
          <div class="percentage">{{ item.progress }}%</div>
        </div>

        <div class="actions">
          <button v-if="item.status === 'downloading' || item.status === 'pending'" class="cancel-btn" @click="removeTask(item.id)">
            Cancel
          </button>
          <button v-else class="remove-btn" @click="removeTask(item.id)">
            Remove
          </button>
        </div>
      </div>
    </div>

    <div class="footer-info">
      <p>최대 5개의 에피소드가 IndexedDB에 자동 캐시됩니다 (LRU).</p>
      <p v-if="isGCRunning">캐시 정리 중...</p>
    </div>
  </div>
</template>

<script setup>
import { useStore } from '../composables/useStore.js';
import { useDownloadManager } from '../composables/useDownloadManager.js';

const { currentView } = useStore();
const { downloadQueue, removeTask, runGC, isGCRunning } = useDownloadManager();
</script>

<style scoped>
.downloads-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  color: var(--text-color);
  background: var(--bg-color);
  min-height: 100vh;
}

.header {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 30px;
}

.header h2 {
  flex: 1;
  margin: 0;
  font-size: 1.5rem;
}

.back-btn, .clear-btn, .cancel-btn, .remove-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: background 0.2s;
}

.back-btn:hover, .clear-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.clear-btn {
  font-size: 0.9rem;
  background: var(--accent-color, #4a90e2);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 100px 20px;
  opacity: 0.5;
}

.download-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.download-item {
  background: rgba(255, 255, 255, 0.05);
  padding: 15px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.download-item.completed {
  border-color: rgba(76, 175, 80, 0.3);
}

.download-item.failed {
  border-color: rgba(244, 67, 54, 0.3);
}

.item-info .title {
  font-weight: 600;
  font-size: 1.1rem;
  margin-bottom: 4px;
}

.item-info .meta {
  font-size: 0.85rem;
  opacity: 0.6;
}

.progress-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.progress-inner {
  height: 100%;
  background: var(--accent-color, #4a90e2);
  transition: width 0.3s ease;
}

.completed .progress-inner {
  background: #4caf50;
}

.failed .progress-inner {
  background: #f44336;
}

.percentage {
  font-size: 0.9rem;
  width: 40px;
  text-align: right;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.cancel-btn {
  background: rgba(244, 67, 54, 0.2);
  color: #ff5252;
}

.footer-info {
  margin-top: 40px;
  text-align: center;
  font-size: 0.85rem;
  opacity: 0.5;
}
</style>
