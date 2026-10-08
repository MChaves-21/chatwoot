<script setup>
/**
 * Cartao do painel: superficie lisa, borda fina, titulo com icone discreto.
 * Sem fundo colorido de proposito — a cor fica reservada para o dado.
 */
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  // Mantidos por compatibilidade; o visual atual nao usa cor no cabecalho.
  color: { type: String, default: '' },
});
</script>

<template>
  <section
    class="flex flex-col gap-4 p-5 min-w-0 rounded-xl border border-n-weak bg-n-solid-1"
  >
    <header
      v-if="title || $slots.actions"
      class="flex flex-wrap gap-3 justify-between items-start"
    >
      <div class="min-w-0">
        <h3
          class="flex gap-2 items-center text-sm font-semibold text-n-slate-12"
        >
          <span v-if="icon" class="size-4 text-n-slate-10" :class="icon" />
          {{ title }}
        </h3>
        <p v-if="subtitle" class="mt-0.5 text-xs text-n-slate-10">
          {{ subtitle }}
        </p>
      </div>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>
