<script setup>
/**
 * Grafico de linha em SVG puro — sem biblioteca, para o fork nao ganhar
 * dependencia nova.
 *
 * points: [{ label, value, target? }]
 *   value  linha cheia. `null` interrompe a linha (dias que ainda nao chegaram).
 *   target linha tracejada opcional (a meta).
 *
 * Um eixo so. Passar o mouse mostra o valor do ponto.
 */
import { computed, ref } from 'vue';

const props = defineProps({
  points: { type: Array, required: true },
  valueLabel: { type: String, default: '' },
  targetLabel: { type: String, default: '' },
});

const W = 600;
const H = 160;
const hover = ref(null);

const hasTarget = computed(() =>
  props.points.some(p => p.target !== undefined && p.target !== null)
);

const max = computed(() => {
  const values = props.points.flatMap(p => [p.value || 0, p.target || 0]);
  return Math.max(1, ...values);
});

const x = i =>
  props.points.length > 1 ? (i / (props.points.length - 1)) * W : W / 2;
const y = v => H - (v / max.value) * H;

function pathOf(field) {
  let d = '';
  let pen = false;
  props.points.forEach((p, i) => {
    const v = p[field];
    if (v === null || v === undefined) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    pen = true;
  });
  return d.trim();
}

const valuePath = computed(() => pathOf('value'));
const targetPath = computed(() => pathOf('target'));

const ticks = computed(() => {
  const n = props.points.length;
  if (!n) return [];
  const idx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  return idx.map(i => ({ i, label: props.points[i].label }));
});

function onMove(e) {
  const box = e.currentTarget.getBoundingClientRect();
  const ratio = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
  hover.value = Math.round(ratio * (props.points.length - 1));
}

const hovered = computed(() =>
  hover.value === null ? null : props.points[hover.value] || null
);
const fmt = n =>
  Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
</script>

<template>
  <div v-if="points.length" class="flex flex-col gap-1">
    <div
      v-if="hasTarget"
      class="flex gap-4 items-center text-[11px] text-n-slate-11"
    >
      <span class="flex gap-1.5 items-center">
        <span class="w-4 border-t-2 border-n-brand" />{{ valueLabel }}
      </span>
      <span class="flex gap-1.5 items-center">
        <span class="w-4 border-t-2 border-dashed border-n-slate-9" />
        {{ targetLabel }}
      </span>
    </div>

    <div class="flex gap-2">
      <div
        class="flex flex-col justify-between text-[10.5px] text-right tabular-nums text-n-slate-10 h-40"
      >
        <span>{{ fmt(max) }}</span>
        <span>0</span>
      </div>
      <div
        class="relative flex-1 h-40"
        @mousemove="onMove"
        @mouseleave="hover = null"
      >
        <svg
          class="w-full h-full overflow-visible"
          :viewBox="`0 0 ${W} ${H}`"
          preserveAspectRatio="none"
          role="img"
          :aria-label="valueLabel"
        >
          <line
            x1="0"
            :x2="W"
            :y1="H"
            :y2="H"
            class="text-n-slate-6"
            stroke="currentColor"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <path
            v-if="hasTarget"
            :d="targetPath"
            fill="none"
            class="text-n-slate-9"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="4 4"
            vector-effect="non-scaling-stroke"
          />
          <path
            :d="valuePath"
            fill="none"
            class="text-n-brand"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
          <line
            v-if="hover !== null"
            :x1="x(hover)"
            :x2="x(hover)"
            y1="0"
            :y2="H"
            class="text-n-slate-8"
            stroke="currentColor"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <div
          v-if="hovered"
          class="absolute top-0 z-10 px-2 py-1 text-[11px] whitespace-nowrap rounded-lg border pointer-events-none border-n-weak bg-n-solid-2 text-n-slate-12"
          :style="
            hover > points.length / 2
              ? { right: `${100 - (x(hover) / W) * 100}%`, marginRight: '8px' }
              : { left: `${(x(hover) / W) * 100}%`, marginLeft: '8px' }
          "
        >
          <span class="font-semibold">{{ hovered.label }}</span>
          <span v-if="hovered.value !== null && hovered.value !== undefined">
            · {{ valueLabel }}: {{ fmt(hovered.value) }}
          </span>
          <span v-if="hasTarget && hovered.target != null">
            · {{ targetLabel }}: {{ fmt(hovered.target) }}
          </span>
        </div>
      </div>
    </div>

    <div class="flex justify-between pl-8 text-[10.5px] text-n-slate-10">
      <span v-for="t in ticks" :key="t.i">{{ t.label }}</span>
    </div>
  </div>
</template>
