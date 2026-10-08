<script setup>
/**
 * Histograma em colunas verticais. items: [{ key, title, value, note? }]
 */
import { computed } from 'vue';

const props = defineProps({
  items: { type: Array, required: true },
});

const max = computed(() => Math.max(1, ...props.items.map(i => i.value)));
const int = n => Number(n).toLocaleString('pt-BR');
</script>

<template>
  <div
    class="grid gap-3"
    :style="{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }"
  >
    <div
      v-for="item in items"
      :key="item.key"
      class="flex flex-col gap-1.5 items-center min-w-0"
      :title="`${item.title}: ${int(item.value)}${item.note ? ' · ' + item.note : ''}`"
    >
      <span class="text-sm font-semibold tabular-nums text-n-slate-12">
        {{ int(item.value) }}
      </span>
      <span class="flex items-end w-full h-28">
        <span
          class="block w-full rounded-t-md bg-n-brand"
          :style="{ height: `${Math.max((item.value / max) * 100, 2)}%` }"
        />
      </span>
      <span class="text-[11px] text-center leading-tight text-n-slate-11">
        {{ item.title }}
      </span>
      <span v-if="item.note" class="text-[10.5px] tabular-nums text-n-slate-10">
        {{ item.note }}
      </span>
    </div>
  </div>
</template>
