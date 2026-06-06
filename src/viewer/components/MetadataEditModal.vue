<template>
  <teleport to="body">
    <transition name="modal-fade">
      <div v-if="isOpen" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-8">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="close"></div>
        
        <!-- Modal Container -->
        <div class="relative w-full max-w-xl bg-theme-surface border border-white/10 rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all duration-300 transform scale-100">
          
          <!-- Header -->
          <div class="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-black/20">
            <div class="flex items-center space-x-3 text-left">
              <div class="w-8 h-8 bg-theme-accent rounded-lg flex items-center justify-center text-sm">✏️</div>
              <h2 class="text-xl font-black tracking-tight text-theme-text uppercase italic">Edit Metadata</h2>
            </div>
            <button @click="close" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-theme-muted transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <!-- Form Area -->
          <div class="flex-1 overflow-y-auto p-8 custom-scrollbar bg-theme-surface text-left space-y-6">
            
            <!-- Series Name -->
            <div class="group">
              <p class="text-[8px] font-bold text-theme-muted uppercase mb-1.5 ml-1">Series Title</p>
              <input v-model="form.name" placeholder="Enter series title" class="setting-input">
            </div>

            <!-- Author & Status Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="group">
                <p class="text-[8px] font-bold text-theme-muted uppercase mb-1.5 ml-1">Author</p>
                <input v-model="form.author" placeholder="Author name" class="setting-input">
              </div>
              <div class="group">
                <p class="text-[8px] font-bold text-theme-muted uppercase mb-1.5 ml-1">Status</p>
                <select v-model="form.status" class="setting-select">
                  <option value="연재중">연재중 (Ongoing)</option>
                  <option value="완결">완결 (Completed)</option>
                  <option value="휴재">휴재 (Hiatus)</option>
                </select>
              </div>
            </div>

            <!-- Category -->
            <div class="group">
              <p class="text-[8px] font-bold text-theme-muted uppercase mb-1.5 ml-1">Category</p>
              <select v-model="form.category" class="setting-select">
                <option value="Webtoon">웹툰 (Webtoon)</option>
                <option value="Manga">만화 (Manga)</option>
                <option value="Novel">소설 (Novel)</option>
                <option value="Unknown">기타 (Unknown)</option>
              </select>
            </div>

            <!-- Summary -->
            <div class="group">
              <p class="text-[8px] font-bold text-theme-muted uppercase mb-1.5 ml-1">Summary / Description</p>
              <textarea v-model="form.summary" placeholder="Enter description..." rows="3" class="setting-textarea"></textarea>
            </div>

            <!-- Thumbnail Upload -->
            <div class="group">
              <p class="text-[8px] font-bold text-theme-muted uppercase mb-1.5 ml-1">Thumbnail Cover</p>
              
              <div class="flex flex-col sm:flex-row items-center gap-6 p-5 rounded-2xl bg-black/20 border border-white/5">
                <!-- Preview -->
                <div class="w-24 aspect-cover rounded-xl overflow-hidden bg-zinc-800 border border-white/10 flex-shrink-0 flex items-center justify-center text-zinc-600 text-[10px]">
                  <img v-if="previewUrl" :src="previewUrl" class="w-full h-full object-cover">
                  <span v-else>No Cover</span>
                </div>

                <!-- Upload trigger -->
                <div class="flex-1 w-full text-center sm:text-left">
                  <p class="text-xs text-theme-muted mb-3">JPG, PNG 파일만 허용됩니다. 드라이브에 직접 업로드됩니다.</p>
                  <label class="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-theme-text rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all inline-block">
                    SELECT FILE
                    <input type="file" accept="image/*" @change="onFileChange" class="hidden">
                  </label>
                </div>
              </div>
            </div>

            <!-- Save Action Button -->
            <button @click="save" :disabled="isSaving" class="w-full mt-4 bg-theme-accent hover:brightness-110 text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] shadow-lg shadow-theme-accent transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
              <span v-if="isSaving" class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
              <span v-else>💾</span> 
              <span>{{ isSaving ? 'SAVING METADATA...' : 'SAVE CHANGES' }}</span>
            </button>

          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';
import { useStore } from '../composables/useStore';

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  series: { type: Object, default: null }
});

const emit = defineEmits(['close']);

const { saveSeriesMetadata, getThumbnailUrl, NO_IMAGE_SVG } = useStore();

const isSaving = ref(false);
const previewUrl = ref('');
const base64Data = ref(null);

const form = reactive({
  name: '',
  category: 'Unknown',
  author: '',
  status: '연재중',
  summary: '',
  thumbnailId: '',
  thumbnail: ''
});

watch(() => props.series, (newVal) => {
  if (newVal) {
    form.name = newVal.name || newVal.title || '';
    form.category = newVal.category || newVal.type || 'Unknown';
    form.author = newVal.metadata?.authors?.[0] || newVal.metadata?.author || '';
    form.status = newVal.metadata?.status || '연재중';
    form.summary = newVal.metadata?.summary || '';
    form.thumbnailId = newVal.thumbnailId || '';
    form.thumbnail = newVal.thumbnail || '';
    previewUrl.value = getThumbnailUrl(newVal);
    base64Data.value = null;
  }
}, { immediate: true });

function onFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Show local preview
  previewUrl.value = URL.createObjectURL(file);

  // Convert to Base64
  const reader = new FileReader();
  reader.onload = (event) => {
    const rawBase64 = event.target.result;
    // Strip header (data:image/jpeg;base64,)
    base64Data.value = rawBase64.split(',')[1];
  };
  reader.readAsDataURL(file);
}

async function save() {
  if (!props.series?.id) return;
  isSaving.value = true;
  
  try {
    await saveSeriesMetadata(
      props.series.id,
      {
        name: form.name,
        category: form.category,
        author: form.author,
        status: form.status,
        summary: form.summary,
        thumbnailId: form.thumbnailId,
        thumbnail: form.thumbnail
      },
      base64Data.value
    );
    close();
  } catch (err) {
    console.error(err);
  } finally {
    isSaving.value = false;
  }
}

function close() {
  emit('close');
}
</script>

<style scoped>
.setting-input {
  @apply w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-sm outline-none focus:ring-1 focus:ring-theme-accent focus:border-theme-accent transition-all text-white placeholder:text-zinc-600;
}

.setting-select {
  @apply w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-sm outline-none focus:ring-1 focus:ring-theme-accent focus:border-theme-accent transition-all text-white cursor-pointer;
}

.setting-textarea {
  @apply w-full bg-black/40 border border-white/5 p-4 rounded-2xl text-sm outline-none focus:ring-1 focus:ring-theme-accent focus:border-theme-accent transition-all text-white placeholder:text-zinc-600 resize-none;
}

.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
}

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
