<script setup>
/**
 * Curva pequena com area preenchida (rodape dos indicadores).
 * So desenha — quem diz o que os pontos significam e o cartao que a usa.
 */
import { computed, useId } from 'vue';
import { areaPath, smoothPath } from '../chart';

const props = defineProps({
  values: { type: Array, required: true },
  color: { type: String, required: true },
});

const W = 200;
const H = 48;
const id = useId();

const pts = computed(() => {
  const v = props.values;
  if (v.length < 2) return [];
  const max = Math.max(...v);
  const min = Math.min(...v);
  const span = max - min || 1;
  // 6px de folga em cima para a linha nao encostar na borda do cartao.
  return v.map((n, i) => [
    (i / (v.length - 1)) * W,
    H - 4 - ((n - min) / span) * (H - 10),
  ]);
});

const line = computed(() => smoothPath(pts.value));
const area = computed(() => areaPath(line.value, pts.value, H));
</script>

<template>
  <svg
    v-if="pts.length"
    class="block w-full h-12"
    :viewBox="`0 0 ${W} ${H}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="id" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="color" stop-opacity="0.28" />
        <stop offset="1" :stop-color="color" stop-opacity="0.02" />
      </linearGradient>
    </defs>
    <path :d="area" :fill="`url(#${id})`" />
    <path
      :d="line"
      fill="none"
      :stroke="color"
      stroke-width="1.75"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
