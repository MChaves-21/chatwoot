<script setup>
import { computed } from 'vue';
import { TONE_CLASS } from '../constants';

const props = defineProps({
  status: { type: String, default: '' },
  map: { type: Object, required: true },
});

const info = computed(
  () => props.map[props.status] || { label: props.status || '—', tone: 'slate' }
);
</script>

<template>
  <span
    class="inline-flex items-center px-2 h-5 text-[11px] font-medium rounded-full whitespace-nowrap"
    :class="TONE_CLASS[info.tone]"
  >
    {{ info.label }}
  </span>
</template>
