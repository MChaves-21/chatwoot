<script setup>
/**
 * Cartao do painel: icone colorido, titulo, subtitulo e acoes a direita.
 */
import { tint } from '../chart';

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  color: { type: String, default: '#22c55e' },
});
</script>

<template>
  <section
    class="flex flex-col gap-4 p-5 rounded-2xl border shadow-sm min-w-0 border-n-weak bg-n-solid-1"
  >
    <header class="flex flex-wrap gap-3 justify-between items-start">
      <div class="flex gap-3 items-center min-w-0">
        <span
          v-if="icon"
          class="flex flex-shrink-0 justify-center items-center rounded-xl size-9"
          :style="{ background: tint(color, 14), color }"
        >
          <span class="size-[18px]" :class="icon" />
        </span>
        <div class="min-w-0">
          <h2 class="text-base font-semibold leading-tight text-n-slate-12">
            {{ title }}
          </h2>
          <p v-if="subtitle" class="mt-0.5 text-xs text-n-slate-11">
            {{ subtitle }}
          </p>
        </div>
      </div>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>
