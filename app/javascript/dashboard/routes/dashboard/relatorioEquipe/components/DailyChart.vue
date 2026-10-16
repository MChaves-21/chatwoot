<script setup>
/**
 * Mensagens por dia: duas colunas por dia, lado a lado.
 *   esquerda  recebidas do cliente
 *   direita   enviadas, empilhadas em equipe / IA / sem autor
 * A escala e a mesma para as duas, entao da para comparar a altura.
 *
 * days: [{ date: 'AAAA-MM-DD', recebida, humano, ia, sem_autor }]
 */
import { computed } from 'vue';
import { CATEGORIES, SENT_KEYS } from '../constants';

const props = defineProps({
  days: { type: Array, required: true },
});

const COLOR = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]));
const TITLE = Object.fromEntries(CATEGORIES.map(c => [c.key, c.short]));

const sentOf = d => SENT_KEYS.reduce((a, k) => a + (d[k] || 0), 0);
const max = computed(() =>
  Math.max(1, ...props.days.map(d => Math.max(d.recebida || 0, sentOf(d))))
);
const pct = v => `${(v / max.value) * 100}%`;

// Rotulo do eixo: no maximo ~12 rotulos, para nao embolar.
const step = computed(() => Math.max(1, Math.ceil(props.days.length / 12)));
const dayLabel = ymd => {
  const [, m, d] = ymd.split('-');
  return `${d}/${m}`;
};
const weekday = ymd =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'short',
  });
const int = n => Number(n || 0).toLocaleString('pt-BR');

const tooltip = d =>
  [
    `${dayLabel(d.date)} (${weekday(d.date)})`,
    `Recebidas: ${int(d.recebida)}`,
    `Enviadas: ${int(sentOf(d))}`,
    ...SENT_KEYS.map(k => `  ${TITLE[k]}: ${int(d[k])}`),
  ].join('\n');
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex gap-px items-end h-48">
      <div
        v-for="d in days"
        :key="d.date"
        class="flex flex-1 gap-px justify-center items-end h-full min-w-0 rounded-sm hover:bg-n-alpha-1"
        :title="tooltip(d)"
      >
        <span
          class="block w-1/2 max-w-3 rounded-t-sm"
          :style="{ height: pct(d.recebida || 0), background: COLOR.recebida }"
        />
        <span
          class="flex flex-col-reverse w-1/2 max-w-3 h-full justify-start"
        >
          <span
            v-for="k in SENT_KEYS"
            :key="k"
            class="block w-full first:rounded-none last:rounded-t-sm"
            :style="{ height: pct(d[k] || 0), background: COLOR[k] }"
          />
        </span>
      </div>
    </div>
    <div class="flex gap-px">
      <span
        v-for="(d, i) in days"
        :key="d.date"
        class="flex-1 min-w-0 text-[10px] text-center tabular-nums text-n-slate-10 whitespace-nowrap overflow-visible"
      >
        {{ i % step === 0 ? dayLabel(d.date) : '' }}
      </span>
    </div>
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-n-slate-11">
      <li v-for="c in CATEGORIES" :key="c.key" class="flex gap-1.5 items-center">
        <span class="rounded-sm size-2.5" :style="{ background: c.color }" />
        {{ c.title }}
      </li>
    </ul>
  </div>
</template>
