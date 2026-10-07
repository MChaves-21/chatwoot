<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  sub: { type: String, default: '' },
  hint: { type: String, default: '' },
});
</script>

<template>
  <div
    class="flex flex-col gap-1 p-4 rounded-xl border min-w-0 border-n-weak bg-n-solid-1"
    :title="hint"
  >
    <span class="text-xs font-medium truncate text-n-slate-11">
      {{ label }}
    </span>
    <span class="text-2xl font-semibold tabular-nums text-n-slate-12">
      {{ value }}
    </span>
    <span v-if="sub" class="text-xs truncate text-n-slate-10">{{ sub }}</span>
  </div>
</template>
