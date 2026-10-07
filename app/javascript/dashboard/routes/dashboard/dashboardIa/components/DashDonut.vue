<script setup>
/**
 * Rosca com o total no centro e legenda ao lado.
 * segments: [{ key, title, value, color, icon? }]
 */
import { computed } from 'vue';
import { donutArcs, tint } from '../chart';

const props = defineProps({
  segments: { type: Array, required: true },
  centerValue: { type: String, required: true },
  centerLabel: { type: String, default: '' },
});

const R = 42;
const arcs = computed(() => donutArcs(props.segments, R));
const total = computed(() => props.segments.reduce((a, s) => a + s.value, 0));

const int = n => Number(n).toLocaleString('pt-BR');
const pct = n =>
  `${(total.value ? (n / total.value) * 100 : 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
</script>

<template>
  <div class="flex flex-wrap gap-6 items-center">
    <div class="relative flex-shrink-0 size-36">
      <svg class="-rotate-90 size-full" viewBox="0 0 100 100" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          :r="R"
          fill="none"
          class="text-n-slate-4"
          stroke="currentColor"
          stroke-width="11"
        />
        <template v-for="(s, i) in segments" :key="s.key">
          <circle
            v-if="arcs[i].visible"
            cx="50"
            cy="50"
            :r="R"
            fill="none"
            :stroke="s.color"
            stroke-width="11"
            :stroke-dasharray="arcs[i].dash"
            :stroke-dashoffset="arcs[i].offset"
          >
            <title>{{ s.title }}: {{ int(s.value) }} ({{ pct(s.value) }})</title>
          </circle>
        </template>
      </svg>
      <div
        class="flex absolute inset-0 flex-col justify-center items-center pointer-events-none"
      >
        <span class="text-xl font-bold tabular-nums text-n-slate-12">
          {{ centerValue }}
        </span>
        <span class="text-[11px] text-n-slate-11">{{ centerLabel }}</span>
      </div>
    </div>

    <ul class="flex flex-col flex-1 gap-2 min-w-[180px]">
      <li
        v-for="s in segments"
        :key="s.key"
        class="flex gap-2 items-center text-sm"
      >
        <span
          v-if="s.icon"
          class="flex flex-shrink-0 justify-center items-center rounded-lg size-7"
          :style="{ background: tint(s.color, 16), color: s.color }"
        >
          <span class="size-3.5" :class="s.icon" />
        </span>
        <span
          v-else
          class="flex-shrink-0 rounded-full size-2.5"
          :style="{ background: s.color }"
        />
        <span class="flex-1 truncate text-n-slate-12">{{ s.title }}</span>
        <span class="font-semibold tabular-nums text-n-slate-12">
          {{ int(s.value) }}
        </span>
        <span class="w-12 text-xs text-right tabular-nums text-n-slate-10">
          {{ pct(s.value) }}
        </span>
      </li>
    </ul>
  </div>
</template>
