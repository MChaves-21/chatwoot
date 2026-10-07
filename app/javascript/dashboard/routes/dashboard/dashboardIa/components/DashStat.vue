<script setup>
/**
 * Indicador do topo: rotulo, icone colorido, numero grande e, no rodape, a
 * curva das ultimas 12 semanas.
 */
import { tint } from '../chart';
import DashSpark from './DashSpark.vue';

defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  sub: { type: String, default: '' },
  hint: { type: String, default: '' },
  icon: { type: String, required: true },
  color: { type: String, required: true },
  // Numero na cor de destaque (usado em Contratos assinados).
  accent: { type: Boolean, default: false },
  values: { type: Array, default: () => [] },
});
</script>

<template>
  <div
    class="flex overflow-hidden flex-col rounded-2xl border shadow-sm min-w-0 border-n-weak bg-n-solid-1"
    :style="{
      backgroundImage: `linear-gradient(160deg, ${tint(color, 9)}, transparent 55%)`,
    }"
    :title="hint"
  >
    <div class="flex flex-col gap-1 px-4 pt-4">
      <div class="flex gap-2 justify-between items-start">
        <span class="text-xs font-semibold leading-tight text-n-slate-11">
          {{ label }}
        </span>
        <span
          class="flex flex-shrink-0 justify-center items-center rounded-lg size-8"
          :style="{ background: tint(color, 16), color }"
        >
          <span class="size-4" :class="icon" />
        </span>
      </div>
      <span
        class="text-3xl font-bold tracking-tight tabular-nums"
        :class="accent ? '' : 'text-n-slate-12'"
        :style="accent ? { color } : null"
      >
        {{ value }}
      </span>
      <span v-if="sub" class="text-xs truncate text-n-slate-10">{{ sub }}</span>
    </div>
    <div
      class="mt-2"
      title="Últimas 12 semanas, pela data de criação da conversa"
    >
      <DashSpark v-if="values.length > 1" :values="values" :color="color" />
      <div v-else class="h-12" />
    </div>
  </div>
</template>
