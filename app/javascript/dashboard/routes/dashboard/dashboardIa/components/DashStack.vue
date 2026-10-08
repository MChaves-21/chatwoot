<script setup>
/**
 * Barra unica 100% empilhada, com legenda embaixo.
 * segments: [{ key, title, value, color }]
 */
import { computed } from 'vue';

const props = defineProps({
  segments: { type: Array, required: true },
});

const total = computed(() =>
  props.segments.reduce((a, s) => a + s.value, 0)
);
const pctOf = v => (total.value ? (v / total.value) * 100 : 0);
const fmt = v =>
  `${pctOf(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex overflow-hidden gap-0.5 h-3 rounded-full">
      <span
        v-for="s in segments"
        v-show="s.value"
        :key="s.key"
        class="block h-full"
        :style="{ width: `${pctOf(s.value)}%`, background: s.color }"
        :title="`${s.title}: ${s.value} (${fmt(s.value)})`"
      />
    </div>
    <ul class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
      <li v-for="s in segments" :key="s.key" class="flex gap-2 items-center">
        <span class="rounded-sm size-2.5" :style="{ background: s.color }" />
        <span class="flex-1 text-n-slate-11">{{ s.title }}</span>
        <span class="font-semibold tabular-nums text-n-slate-12">
          {{ s.value.toLocaleString('pt-BR') }}
        </span>
        <span class="w-11 text-right tabular-nums text-n-slate-10">
          {{ fmt(s.value) }}
        </span>
      </li>
    </ul>
  </div>
</template>
