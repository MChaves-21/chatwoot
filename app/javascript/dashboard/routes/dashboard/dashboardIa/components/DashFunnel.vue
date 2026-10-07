<script setup>
/**
 * Funil de vendas: uma faixa por etapa, centralizada e cada vez mais
 * estreita, com a taxa de passagem entre uma e outra.
 *
 * A LARGURA e so a forma do funil (diminui por posicao) — nao representa o
 * valor. Quem informa o valor e o numero dentro da faixa. Por isso a largura
 * nunca cai abaixo do que cabe o texto.
 *
 * steps: [{ label, title, reached, pct, next, color, icon }]
 */
import { gradient } from '../chart';

const props = defineProps({
  steps: { type: Array, required: true },
});

const int = n => Number(n).toLocaleString('pt-BR');
const pct = n =>
  `${Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;

const MIN_WIDTH = 46;
const widthOf = i => {
  const n = props.steps.length;
  if (n <= 1) return 100;
  return 100 - (i / (n - 1)) * (100 - MIN_WIDTH);
};
</script>

<template>
  <ol class="flex flex-col items-center">
    <li
      v-for="(s, i) in steps"
      :key="s.label"
      class="flex flex-col items-center w-full"
    >
      <span
        v-if="i > 0"
        class="relative z-10 px-2 py-0.5 -my-2 font-semibold rounded-full border shadow-sm text-[10.5px] tabular-nums border-n-weak bg-n-solid-1 text-n-slate-11"
        :title="`${pct(steps[i - 1].next)} dos que chegaram em ${steps[i - 1].title} passaram para ${s.title}`"
      >
        {{ pct(steps[i - 1].next) }}
      </span>
      <div
        class="flex gap-3 justify-between items-center px-4 h-12 text-white rounded-xl shadow-sm"
        :style="{ width: `${widthOf(i)}%`, background: gradient(s.color) }"
        :title="`${s.title}: ${int(s.reached)} leads nesta etapa ou além (${pct(s.pct)} do total)`"
      >
        <span class="flex gap-2 items-center min-w-0">
          <span
            class="flex flex-shrink-0 justify-center items-center rounded-full size-7 bg-white/20"
          >
            <span class="size-3.5" :class="s.icon" />
          </span>
          <span class="text-sm font-semibold truncate">{{ s.title }}</span>
        </span>
        <span class="flex-shrink-0 tabular-nums whitespace-nowrap">
          <span class="text-lg font-bold">{{ int(s.reached) }}</span>
          <span class="ml-1 text-xs font-medium opacity-90">
            ({{ pct(s.pct) }})
          </span>
        </span>
      </div>
    </li>
  </ol>
</template>
