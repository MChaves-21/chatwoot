<script setup>
/**
 * Funil em colunas, da esquerda para a direita: cada etapa e uma coluna com
 * a altura proporcional a quantos leads chegaram nela ou alem. Entre uma
 * coluna e a outra, a taxa de passagem.
 *
 * steps: [{ label, title, reached, pct, next, color }]
 * Clicar numa coluna pede para abrir as conversas daquela etapa.
 */
import { computed } from 'vue';

const props = defineProps({
  steps: { type: Array, required: true },
});
const emit = defineEmits(['select']);

const max = computed(() => Math.max(1, ...props.steps.map(s => s.reached)));
const int = n => Number(n).toLocaleString('pt-BR');
const pct = n =>
  `${Number(n || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;

// Passagem baixa e o gargalo: destaca as menores taxas do funil.
const worst = computed(() => {
  const rates = props.steps
    .map((s, i) => ({ i, next: s.next }))
    .filter(r => r.next !== null && props.steps[r.i].reached >= 5);
  rates.sort((a, b) => a.next - b.next);
  return new Set(rates.slice(0, 1).map(r => r.i));
});
</script>

<template>
  <div class="overflow-x-auto">
    <ol
      class="grid gap-0 min-w-[640px]"
      :style="{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }"
    >
      <li v-for="(s, i) in steps" :key="s.label" class="flex flex-col min-w-0">
        <div class="flex items-center h-6">
          <span
            v-if="i > 0"
            class="-ml-3 px-1.5 py-0.5 text-[10.5px] font-semibold rounded tabular-nums"
            :class="
              worst.has(i - 1)
                ? 'bg-n-ruby-3 text-n-ruby-11'
                : 'bg-n-alpha-2 text-n-slate-11'
            "
            :title="`${pct(steps[i - 1].next)} dos que chegaram em ${steps[i - 1].title} passaram para ${s.title}`"
          >
            → {{ pct(steps[i - 1].next) }}
          </span>
        </div>
        <button
          type="button"
          class="flex flex-col gap-2 px-1.5 pt-1 text-left rounded-lg transition-colors group hover:bg-n-alpha-1"
          :title="`${s.title}: ${int(s.reached)} leads nesta etapa ou além (${pct(s.pct)}) — clique para ver as conversas`"
          @click="emit('select', s.label)"
        >
          <span
            class="text-lg font-semibold tabular-nums leading-none text-n-slate-12"
          >
            {{ int(s.reached) }}
          </span>
          <span class="flex items-end w-full h-36">
            <span
              class="block w-full rounded-t-md transition-opacity group-hover:opacity-80"
              :style="{
                height: `${Math.max((s.reached / max) * 100, 2)}%`,
                background: s.color,
              }"
            />
          </span>
          <span
            class="text-[11px] font-medium leading-tight line-clamp-2 min-h-[2.5em] text-n-slate-12"
          >
            {{ s.title }}
          </span>
          <span class="text-[10.5px] tabular-nums text-n-slate-10">
            {{ pct(s.pct) }} do total
          </span>
        </button>
      </li>
    </ol>
  </div>
</template>
