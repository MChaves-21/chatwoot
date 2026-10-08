<script setup>
/**
 * Mapa de calor dia da semana x hora: quando os leads chegam.
 * Uma cor so (a da marca), do claro ao escuro. grid[dia][hora], dia 0 = domingo.
 */
import { computed } from 'vue';

const props = defineProps({
  grid: { type: Array, required: true },
});

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// Segunda primeiro: e como a semana de trabalho e lida.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const max = computed(() => Math.max(1, ...props.grid.flat()));

const cell = v => {
  if (!v) return { background: 'rgb(var(--slate-3))' };
  const pct = Math.round(15 + (v / max.value) * 85);
  return { background: `color-mix(in srgb, #2781F6 ${pct}%, rgb(var(--slate-3)))` };
};

const peak = computed(() => {
  let best = { d: 0, h: 0, v: -1 };
  props.grid.forEach((row, d) =>
    row.forEach((v, h) => {
      if (v > best.v) best = { d, h, v };
    })
  );
  return best.v > 0 ? best : null;
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="grid gap-[3px] grid-cols-[2.25rem_repeat(24,minmax(0,1fr))]">
      <template v-for="d in ORDER" :key="d">
        <span class="pr-1 text-[10.5px] leading-[18px] text-n-slate-10">
          {{ DAYS[d] }}
        </span>
        <span
          v-for="(v, h) in grid[d]"
          :key="h"
          class="h-[18px] rounded-[3px]"
          :style="cell(v)"
          :title="`${DAYS[d]}, ${h}h: ${v} chats`"
        />
      </template>
      <span />
      <span
        v-for="h in 24"
        :key="`h${h}`"
        class="text-[10px] text-center tabular-nums text-n-slate-10"
      >
        {{ (h - 1) % 6 === 0 ? `${h - 1}h` : '' }}
      </span>
    </div>
    <p v-if="peak" class="text-xs text-n-slate-11">
      Pico em
      <strong class="text-n-slate-12">
        {{ DAYS[peak.d] }} às {{ peak.h }}h
      </strong>
      ({{ peak.v }} chats no período).
    </p>
  </div>
</template>
