<script setup>
/**
 * Indicador: numero, variacao contra o periodo anterior e as ultimas 12
 * semanas em colunas pequenas.
 *
 * `delta` vem pronto (numero ou null). `unit` diz como ler: '%' para
 * variacao relativa de contagem, 'pp' para diferenca de taxa em pontos
 * percentuais. `upIsGood` inverte a cor quando subir e ruim (descartes).
 */
import { computed } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  sub: { type: String, default: '' },
  hint: { type: String, default: '' },
  delta: { type: Number, default: null },
  unit: { type: String, default: '%' },
  upIsGood: { type: Boolean, default: true },
  values: { type: Array, default: () => [] },
});

const deltaText = computed(() => {
  if (props.delta === null || !Number.isFinite(props.delta)) return '';
  const abs = Math.abs(props.delta).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  });
  const arrow = props.delta > 0 ? '↑' : props.delta < 0 ? '↓' : '→';
  return `${arrow} ${abs}${props.unit === 'pp' ? ' p.p.' : '%'}`;
});

const deltaClass = computed(() => {
  if (!props.delta) return 'text-n-slate-10';
  const good = props.delta > 0 === props.upIsGood;
  return good ? 'text-n-teal-11' : 'text-n-ruby-11';
});

const maxValue = computed(() => Math.max(1, ...props.values));
</script>

<template>
  <div class="flex flex-col gap-2 min-w-0" :title="hint">
    <span class="text-xs text-n-slate-11">{{ label }}</span>
    <div class="flex gap-2 items-baseline">
      <span
        class="text-[28px] font-semibold tracking-tight leading-none tabular-nums text-n-slate-12"
      >
        {{ value }}
      </span>
      <span
        v-if="deltaText"
        class="text-xs font-semibold tabular-nums"
        :class="deltaClass"
        title="Contra o período anterior de mesmo tamanho"
      >
        {{ deltaText }}
      </span>
    </div>
    <div class="flex gap-3 justify-between items-end">
      <span class="text-[11px] truncate text-n-slate-10">{{ sub }}</span>
      <span
        v-if="values.length > 1"
        class="flex flex-shrink-0 gap-px items-end h-6"
        title="Últimas 12 semanas, pela data de criação da conversa"
      >
        <span
          v-for="(v, i) in values"
          :key="i"
          class="w-1.5 rounded-sm"
          :class="i === values.length - 1 ? 'bg-n-brand' : 'bg-n-slate-6'"
          :style="{ height: `${Math.max((v / maxValue) * 100, 6)}%` }"
        />
      </span>
    </div>
  </div>
</template>
