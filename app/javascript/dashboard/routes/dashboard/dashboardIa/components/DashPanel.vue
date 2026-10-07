<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
});
</script>

<template>
  <section
    class="flex flex-col gap-3 p-4 rounded-xl border border-n-weak bg-n-solid-1"
  >
    <header class="flex flex-wrap gap-2 justify-between items-start">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-n-slate-12">{{ title }}</h2>
        <p v-if="subtitle" class="text-xs text-n-slate-11">{{ subtitle }}</p>
      </div>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>
