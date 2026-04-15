import Dexie from 'dexie';

// --- Dexie.js (Offline-First Cache) ---
export const db = new Dexie('ViewerHubDB');

db.version(1).stores({ library: '++id, title, type, fileId, progress' });
db.version(2).stores({
  library: '++id, title, type, fileId, progress',
  readHistory: 'episodeId, seriesId, lastReadAt',
});
db.version(3).stores({
  library: '++id, title, type, fileId, progress',
  readHistory: 'episodeId, seriesId, lastReadAt',
  libraryCache: 'id',            // { id:'default', data:[], cachedAt }
  episodeCache: '[seriesId+id], seriesId, cachedAt', 
});
db.version(4).stores({
  imageMeta: '[seriesId+episodeId+index], bounds' // [v1.7.0] 
});

db.version(5).stores({
  library: '++id, title, type, fileId, progress',
  readHistory: 'episodeId, seriesId, lastReadAt',
  libraryCache: 'id',
  episodeCache: '[seriesId+id], seriesId, cachedAt', 
  imageMeta: '[seriesId+episodeId+index], bounds',
  episodeData: 'fileId, cachedAt' // [v1.7.4] Persistent Content Cache
});

db.version(6).stores({
  library: '++id, title, type, fileId, progress',
  readHistory: 'episodeId, seriesId, lastReadAt',
  libraryCache: 'id',
  episodeCache: '[seriesId+id], seriesId, id, cachedAt', 
  imageMeta: '[seriesId+episodeId+index], bounds',
  episodeData: 'fileId, seriesId, cachedAt'
});
