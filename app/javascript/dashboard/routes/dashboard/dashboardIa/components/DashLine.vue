<script setup>
/**
 * Grafico de linhas em SVG, um eixo so.
 *
 * points: [{ label, <chave>: numero | null, ... }]
 * series: [{ key, label, color, kind }]
 *   kind 'area'   linha cheia com a area embaixo preenchida (a principal)
 *   kind 'line'   linha cheia
 *   kind 'dashed' linha tracejada (meta, media movel)
 * Valor `null` interrompe a linha (dias que ainda nao chegaram).
 *
 * Passar o mouse mostra o valor de cada serie naquele ponto.
 */
import { computed, ref, useId } from 'vue';
import { areaPath, smoothPath } from '../chart';

const props = defineProps({
  points: { type: Array, required: true },
  series: { type: Array, required: true },
});

const W = 800;
const H = 220;
const id = useId();
const hover = ref(null);

const max = computed(() => {
  const all = props.points.flatMap(p =>
    props.series.map(s => Number(p[s.key]) || 0)
  );
  return Math.max(1, ...all);
});

const x = i =>
  props.points.length > 1 ? (i / (props.points.length - 1)) * W : W / 2;
const y = v => H - (v / max.value) * (H - 8);

const drawn = computed(() =>
  props.series.map(s => {
    // Trechos continuos: um valor null quebra a linha em dois trechos.
    const runs = [];
    let run = [];
    props.points.forEach((p, i) => {
      const v = p[s.key];
      if (v === null || v === undefined) {
        if (run.length) runs.push(run);
        run = [];
      } else {
        run.push([x(i), y(v)]);
      }
    });
    if (run.length) runs.push(run);
    return {
      ...s,
      paths: runs.map(r => {
        const line = smoothPath(r);
        return { line, area: s.kind === 'area' ? areaPath(line, r, H) : '' };
      }),
    };
  })
);

const ticks = computed(() => {
  const n = props.points.length;
  if (!n) return [];
  const want = Math.min(7, n);
  const idx = new Set();
  for (let k = 0; k < want; k += 1)
    idx.add(Math.round((k / (want - 1 || 1)) * (n - 1)));
  return [...idx].map(i => ({ i, label: props.points[i].label }));
});

const gridValues = computed(() => [max.value, max.value / 2, 0]);

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
  <div v-if="points.length" class="flex flex-col gap-2">
    <ul
      v-if="series.length > 1"
      class="flex flex-wrap gap-4 justify-end text-xs text-n-slate-11"
    >
      <li v-for="s in series" :key="s.key" class="flex gap-1.5 items-center">
        <span
          class="w-4 border-t-2"
          :class="s.kind === 'dashed' ? 'border-dashed' : ''"
          :style="{ borderColor: s.color }"
        />
        {{ s.label }}
      </li>
    </ul>

    <div class="flex gap-2">
      <div
        class="flex flex-col justify-between w-7 text-right h-56 text-[10.5px] tabular-nums text-n-slate-10"
      >
        <span v-for="g in gridValues" :key="g">{{ fmt(g) }}</span>
      </div>
      <div
        class="relative flex-1 h-56"
        @mousemove="onMove"
        @mouseleave="hover = null"
      >
        <svg
          class="overflow-visible size-full"
          :viewBox="`0 0 ${W} ${H}`"
          preserveAspectRatio="none"
          role="img"
          :aria-label="series.map(s => s.label).join(', ')"
        >
          <defs>
            <linearGradient
              v-for="s in series"
              :id="`${id}-${s.key}`"
              :key="s.key"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0" :stop-color="s.color" stop-opacity="0.3" />
              <stop offset="1" :stop-color="s.color" stop-opacity="0.02" />
            </linearGradient>
          </defs>
          <line
            v-for="g in gridValues"
            :key="g"
            x1="0"
            :x2="W"
            :y1="y(g)"
            :y2="y(g)"
            class="text-n-slate-4"
            stroke="currentColor"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <template v-for="s in drawn" :key="s.key">
            <template v-for="(p, i) in s.paths" :key="i">
              <path v-if="p.area" :d="p.area" :fill="`url(#${id}-${s.key})`" />
              <path
                :d="p.line"
                fill="none"
                :stroke="s.color"
                :stroke-width="s.kind === 'dashed' ? 1.5 : 2.25"
                :stroke-dasharray="s.kind === 'dashed' ? '5 5' : null"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
            </template>
          </template>
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
          class="absolute top-1 z-10 px-2.5 py-1.5 text-xs whitespace-nowrap rounded-lg border shadow-md pointer-events-none border-n-weak bg-n-solid-1 text-n-slate-12"
          :style="
            hover > points.length / 2
              ? { right: `${100 - (x(hover) / W) * 100}%`, marginRight: '10px' }
              : { left: `${(x(hover) / W) * 100}%`, marginLeft: '10px' }
          "
        >
          <div class="font-semibold">{{ hovered.label }}</div>
          <template v-for="s in series" :key="s.key">
            <div
              v-if="hovered[s.key] !== null && hovered[s.key] !== undefined"
              class="flex gap-1.5 items-center"
            >
              <span
                class="rounded-full size-2"
                :style="{ background: s.color }"
              />
              <span class="text-n-slate-11">{{ s.label }}</span>
              <span class="ml-auto font-semibold tabular-nums">
                {{ fmt(hovered[s.key]) }}
              </span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div
      class="flex justify-between ml-9 text-[10.5px] tabular-nums text-n-slate-10"
    >
      <span v-for="t in ticks" :key="t.i">{{ t.label }}</span>
    </div>
  </div>
</template>
