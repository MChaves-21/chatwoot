<script setup>
/**
 * Lista de barras horizontais.
 *
 * items: [{ key, title, value, note?, color?, muted? }]
 * A largura e proporcional ao maior valor da lista.
 * `ranked` poe a posicao (1, 2, 3...) num selo antes do rotulo.
 */
import { computed } from 'vue';

const props = defineProps({
  items: { type: Array, required: true },
  color: { type: String, default: '#2781F6' },
  ranked: { type: Boolean, default: false },
  // Rotulo curto (UF): coluna estreita, para a barra ganhar espaco.
  narrow: { type: Boolean, default: false },
  // Rotulo longo (frase): coluna larga.
  wide: { type: Boolean, default: false },
  empty: { type: String, default: 'Sem dados no filtro.' },
});

const max = computed(() => Math.max(1, ...props.items.map(i => i.value)));
const fmt = n => Number(n).toLocaleString('pt-BR');

const MEDALS = ['#f59e0b', '#94a3b8', '#f97316'];
</script>

<template>
  <p v-if="!items.length" class="text-xs text-n-slate-10">{{ empty }}</p>
  <ul v-else class="flex flex-col gap-2">
    <li
      v-for="(item, i) in items"
      :key="item.key"
      class="flex gap-3 items-center text-sm"
      :title="`${item.title}: ${fmt(item.value)}${item.note ? ' · ' + item.note : ''}`"
    >
      <span
        v-if="ranked"
        class="flex flex-shrink-0 justify-center items-center text-xs font-bold rounded-full size-6"
        :class="i < 3 ? 'text-white' : 'bg-n-alpha-2 text-n-slate-11'"
        :style="i < 3 ? { background: MEDALS[i] } : null"
      >
        {{ i + 1 }}
      </span>
      <span
        v-else-if="item.color"
        class="flex-shrink-0 rounded-full size-2"
        :style="{ background: item.color }"
      />
      <span
        class="flex-shrink-0 truncate"
        :class="[
          narrow ? 'w-10 font-semibold' : wide ? 'w-1/2 min-w-0' : 'w-36',
          item.muted ? 'text-n-slate-10' : 'text-n-slate-12',
        ]"
      >
        {{ item.title }}
      </span>
      <span class="overflow-hidden flex-1 h-2 min-w-8 rounded-full bg-n-alpha-2">
        <span
          class="block h-full rounded-full"
          :style="{
            width: `${(item.value / max) * 100}%`,
            background: item.color || color,
            opacity: item.muted ? 0.55 : 1,
          }"
        />
      </span>
      <span
        class="flex-shrink-0 w-12 font-semibold text-right tabular-nums text-n-slate-12"
      >
        {{ fmt(item.value) }}
      </span>
      <span
        v-if="item.note"
        class="flex-shrink-0 text-xs text-right whitespace-nowrap min-w-12 tabular-nums text-n-slate-10"
      >
        {{ item.note }}
      </span>
    </li>
  </ul>
</template>
