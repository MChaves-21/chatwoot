<script setup>
/**
 * Lista de barras horizontais. Uma cor so (a da marca): aqui a barra mostra
 * tamanho, nao categoria — quem identifica a linha e o rotulo.
 *
 * items: [{ key, title, value, note?, muted? }]
 * A largura e proporcional ao maior valor da lista.
 */
import { computed } from 'vue';

const props = defineProps({
  items: { type: Array, required: true },
  empty: { type: String, default: 'Sem dados no filtro.' },
});

const max = computed(() => Math.max(1, ...props.items.map(i => i.value)));
const fmt = n => Number(n).toLocaleString('pt-BR');
</script>

<template>
  <p v-if="!items.length" class="text-xs text-n-slate-10">{{ empty }}</p>
  <ul v-else class="flex flex-col gap-1.5">
    <li
      v-for="item in items"
      :key="item.key"
      class="grid gap-2 items-center text-xs grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
      :title="`${item.title}: ${fmt(item.value)}${item.note ? ' · ' + item.note : ''}`"
    >
      <span
        class="truncate"
        :class="item.muted ? 'text-n-slate-10' : 'text-n-slate-12'"
      >
        {{ item.title }}
      </span>
      <span class="overflow-hidden h-2 rounded-full bg-n-alpha-2">
        <span
          class="block h-full rounded-full"
          :class="item.muted ? 'bg-n-slate-8' : 'bg-n-brand'"
          :style="{ width: `${(item.value / max) * 100}%` }"
        />
      </span>
      <span class="tabular-nums text-right text-n-slate-12">
        <span class="font-semibold">{{ fmt(item.value) }}</span>
        <span v-if="item.note" class="ml-1 text-n-slate-10">
          {{ item.note }}
        </span>
      </span>
    </li>
  </ul>
</template>
