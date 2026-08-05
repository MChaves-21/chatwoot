<script setup>
import { onMounted, onBeforeUnmount } from 'vue';

defineProps({
  width: { type: String, default: 'w-[560px]' },
});

const emit = defineEmits(['close']);

const onKey = e => {
  if (e.key === 'Escape') emit('close');
};

onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div
    class="flex fixed inset-0 z-50 justify-center items-center bg-black/60"
    @click.self="emit('close')"
  >
    <div
      class="overflow-auto p-5 max-w-[94vw] max-h-[90vh] rounded-2xl border shadow-lg bg-n-background border-n-weak"
      :class="width"
    >
      <slot />
    </div>
  </div>
</template>
