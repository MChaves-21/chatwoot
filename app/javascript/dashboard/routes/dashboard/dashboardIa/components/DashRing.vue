<script setup>
/**
 * Anel de progresso da meta. O anel enche ate 100%; passou da meta, ele
 * fica cheio e o numero do centro conta o resto.
 */
import { computed } from 'vue';

const props = defineProps({
  percent: { type: Number, required: true },
  // Marca fina no anel: onde o mes deveria estar hoje para bater a meta.
  pace: { type: Number, default: null },
});

const R = 44;
const LEN = 2 * Math.PI * R;
const filled = computed(() => Math.min(Math.max(props.percent, 0), 100));
const paceAngle = computed(() =>
  props.pace === null ? null : (Math.min(props.pace, 100) / 100) * 360
);
</script>

<template>
  <div class="relative flex-shrink-0 size-40">
    <svg class="-rotate-90 size-full" viewBox="0 0 100 100" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        :r="R"
        fill="none"
        class="text-n-slate-3"
        stroke="currentColor"
        stroke-width="8"
      />
      <circle
        cx="50"
        cy="50"
        :r="R"
        fill="none"
        class="text-n-brand"
        stroke="currentColor"
        stroke-width="8"
        stroke-linecap="round"
        :stroke-dasharray="`${(filled / 100) * LEN} ${LEN}`"
      />
      <!-- A svg esta girada -90: o inicio do anel (3h no desenho) aparece no topo. -->
      <line
        v-if="paceAngle !== null"
        x1="89"
        y1="50"
        x2="99"
        y2="50"
        class="text-n-slate-12"
        stroke="currentColor"
        stroke-width="1.5"
        :transform="`rotate(${paceAngle} 50 50)`"
      />
    </svg>
    <div
      class="flex absolute inset-0 flex-col justify-center items-center text-center"
    >
      <slot />
    </div>
  </div>
</template>
