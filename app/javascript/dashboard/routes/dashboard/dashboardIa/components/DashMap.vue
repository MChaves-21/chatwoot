<script setup>
/**
 * Mapa do Brasil por estado: quanto mais escuro, maior o valor.
 *
 * Uma cor so, do claro ao escuro (magnitude, nao categoria). A intensidade
 * usa raiz quadrada do valor: com escala linear, um estado muito a frente (o
 * Ceara, aqui) deixaria todos os outros praticamente brancos. Por isso a
 * legenda diz so "menos / mais" — o numero exato esta no balao e nas barras.
 *
 * values: { UF: numero }
 */
import { computed, ref } from 'vue';
import { BRAZIL_STATES, BRAZIL_VIEWBOX } from '../brazilMap';

const props = defineProps({
  values: { type: Object, required: true },
  color: { type: String, default: '#22c55e' },
  unit: { type: String, default: 'leads' },
});

const hover = ref(null);
const tip = ref({ x: 0, y: 0 });

const max = computed(() => Math.max(1, ...Object.values(props.values)));
const total = computed(() =>
  Object.values(props.values).reduce((a, b) => a + b, 0)
);

// Estado sem nenhum valor fica no cinza neutro do tema (claro ou escuro).
const EMPTY = 'rgb(var(--slate-4))';
const shade = percent =>
  `color-mix(in srgb, ${props.color} ${percent}%, ${EMPTY})`;

const fillOf = uf => {
  const v = props.values[uf] || 0;
  if (!v) return EMPTY;
  return shade(Math.round(14 + Math.sqrt(v / max.value) * 86));
};

const LEGEND = [14, 35, 57, 78, 100];

const int = n => Number(n).toLocaleString('pt-BR');
const share = v =>
  `${(total.value ? (v / total.value) * 100 : 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;

function onMove(e, state) {
  const box = e.currentTarget.closest('.relative').getBoundingClientRect();
  tip.value = { x: e.clientX - box.left, y: e.clientY - box.top };
  hover.value = state;
}
</script>

<template>
  <div class="flex flex-col gap-2 items-center">
    <div class="relative w-full max-w-[420px]">
      <svg
        class="block w-full h-auto"
        :viewBox="BRAZIL_VIEWBOX"
        role="img"
        :aria-label="`Mapa do Brasil: ${unit} por estado`"
      >
        <path
          v-for="s in BRAZIL_STATES"
          :key="s.uf"
          :d="s.path"
          :fill="fillOf(s.uf)"
          class="transition-opacity text-n-solid-1"
          :class="hover && hover.uf !== s.uf ? 'opacity-70' : ''"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
          @mousemove="onMove($event, s)"
          @mouseleave="hover = null"
        />
      </svg>
      <div
        v-if="hover"
        class="absolute z-10 px-2.5 py-1.5 text-xs whitespace-nowrap rounded-lg border shadow-md pointer-events-none border-n-weak bg-n-solid-1 text-n-slate-12"
        :style="{ left: `${tip.x + 12}px`, top: `${tip.y + 12}px` }"
      >
        <div class="font-semibold">{{ hover.name }} ({{ hover.uf }})</div>
        <div class="text-n-slate-11">
          <span class="font-semibold tabular-nums text-n-slate-12">
            {{ int(values[hover.uf] || 0) }}
          </span>
          {{ unit }} · {{ share(values[hover.uf] || 0) }}
        </div>
      </div>
    </div>

    <div class="flex gap-2 items-center text-[11px] text-n-slate-10">
      <span>menos</span>
      <span class="flex overflow-hidden rounded">
        <span
          v-for="p in LEGEND"
          :key="p"
          class="w-6 h-2"
          :style="{ background: shade(p) }"
        />
      </span>
      <span>mais</span>
    </div>
  </div>
</template>
