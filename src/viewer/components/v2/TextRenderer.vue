<template>
  <!-- [v2.9-A] Self-Paginated Renderer: Integrated V1 Logic -->
  <div class="v2-text-renderer" 
       :class="mode" 
       :style="rendererStyle"
       ref="rendererRef">
    
    <p v-for="(para, idx) in paragraphs" 
       :key="idx" 
       :data-locator="idx"
       class="v2-segment v2-text-segment"
       :style="segmentStyle">
      {{ para }}
    </p>

    <slot></slot>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch, computed } from 'vue';

const props = defineProps({
  paragraphs: { type: Array, required: true },
  mode: { type: String, default: 'scroll' }, // 'scroll' or 'page'
  settings: { type: Object, default: () => ({}) },
  currentPage: { type: Number, default: 0 }
});

const emit = defineEmits(['ready', 'paginate']);
const rendererRef = ref(null);
const internalColumnWidth = ref('auto');

/**
 * [v1.7.5-logic] Exact Column Pagination
 * Sets column-width in px to match clientWidth exactly, preventing sub-pixel gaps.
 */
function recalcNovelPages() {
  if (props.mode !== 'page' || !rendererRef.value) {
    internalColumnWidth.value = 'auto';
    nextTick(() => {
      emit('ready');
    });
    return;
  }

  const body = rendererRef.value;
  // Step 1: Measure current container width (which respects max-width/padding)
  const bodyWidth = body.clientWidth;
  if (bodyWidth === 0) return;

  // Step 2: Lock column width to exact pixels
  internalColumnWidth.value = bodyWidth + 'px';

  // Step 3: Measure total width and calculate page count
  nextTick(() => {
    const totalWidth = body.scrollWidth;
    const pageCount = Math.max(1, Math.round(totalWidth / bodyWidth));
    console.log(`[V2:TextRenderer] V1-Logic Recalc: ${totalWidth}px / ${bodyWidth}px = ${pageCount} pages`);
    emit('paginate', pageCount);
    emit('ready'); // Notify that layout is stable
  });
}

const rendererStyle = computed(() => {
  if (props.mode !== 'page') return {};
  return {
    columnWidth: internalColumnWidth.value,
    transform: `translateX(-${props.currentPage * 100}%)`
  };
});

const segmentStyle = computed(() => {
  return {
    lineHeight: props.settings.lineHeight || 1.8,
    fontSize: props.settings.fontSize + 'px'
  };
});

onMounted(() => {
  nextTick(() => {
    recalcNovelPages();
  });
});

// Watch for any changes that affect geometry
watch(() => [props.paragraphs, props.mode, props.settings.fontSize, props.settings.lineHeight], () => {
  nextTick(() => recalcNovelPages());
}, { deep: true });
</script>

<style scoped>
.v2-text-renderer {
  width: 100%;
  max-width: 720px; /* 일반적인 소설책 가로폭 기준 */
  margin: 0 auto;
  transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1);
  will-change: transform;
  box-sizing: border-box;
}

/* Scroll mode layout padding (Matches V1 py-16 px-5 md:px-10 exactly) */
.v2-text-renderer.scroll {
  padding: 4rem 1.25rem 6rem;
}

@media (min-width: 768px) {
  .v2-text-renderer.scroll {
    padding: 4rem 2.5rem 6rem;
  }
}

.v2-text-segment {
  display: block;
  margin-bottom: 1.2rem;
  word-break: break-word;
  text-align: justify;
  text-indent: 1.5em;
  white-space: pre-wrap;
}

/* Page mode layout shell (Horizontal multi-column) */
.v2-text-renderer.page {
  max-width: none;
  width: 100%;
  height: 80vh;
  column-gap: 0;
  column-fill: auto;
  margin: 0;
  padding: 0; /* Horizontal padding moved to segments */
  box-sizing: border-box;
  overflow: visible; /* Allow transform to work without clipping container */
}

/* Move horizontal padding to segments to avoid column width offset */
.v2-text-renderer.page .v2-segment {
  /* 최대 720px의 텍스트 영역을 보장하면서, 화면이 좁을 때는 최소 20px의 패딩을 유지 */
  padding: 0 calc(max(20px, 50vw - 360px));
  margin-bottom: 2.5rem;
  box-sizing: border-box;
}
</style>
