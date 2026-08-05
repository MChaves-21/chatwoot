<script setup>
import { computed } from 'vue';
import {
  convCreatedRaw,
  convDisplayName,
  convLabels,
  convPhone,
  fmtDate,
} from '../helpers';

const props = defineProps({
  conversation: { type: Object, required: true },
  tags: { type: Array, default: () => [] },
  conversationUrl: { type: String, required: true },
  isDragging: { type: Boolean, default: false },
});

const emit = defineEmits(['open', 'dragstart', 'dragend']);

const name = computed(() => convDisplayName(props.conversation));
const phone = computed(() => convPhone(props.conversation));
const unread = computed(() => props.conversation.unread_count || 0);
const createdAt = computed(() => fmtDate(convCreatedRaw(props.conversation)));

/** Só as etiquetas configuradas como tag viram chip; etapas ficam de fora. */
const shownTags = computed(() => {
  const applied = convLabels(props.conversation);
  return props.tags.filter(t => applied.includes(t.label));
});

// O navegador dispara click logo depois de dragend. Sem esta guarda, soltar
// um card abre o popup do contato — era o justDragged do arquivo original.
let justDragged = false;

const onDragStart = event => {
  event.dataTransfer.effectAllowed = 'move';
  emit('dragstart');
};

const onDragEnd = () => {
  justDragged = true;
  setTimeout(() => {
    justDragged = false;
  }, 60);
  emit('dragend');
};

const onClick = () => {
  if (justDragged) return;
  emit('open');
};
</script>

<template>
  <div
    class="p-2.5 rounded-lg border cursor-grab active:cursor-grabbing transition-colors bg-n-background border-n-weak hover:border-n-brand"
    :class="{ 'opacity-40': isDragging }"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @click="onClick"
  >
    <div class="flex gap-1.5 items-center font-semibold text-n-slate-12">
      <span class="truncate">{{ name }}</span>
      <span
        v-if="unread"
        class="px-1.5 ml-auto text-xs font-bold text-white rounded-full min-w-4 text-center"
        style="background-color: #ef4444"
      >
        {{ unread }}
      </span>
    </div>

    <div v-if="phone" class="mt-0.5 text-xs text-n-slate-11">{{ phone }}</div>

    <div v-if="shownTags.length" class="flex flex-wrap gap-1 mt-1.5">
      <span
        v-for="tag in shownTags"
        :key="tag.label"
        class="px-2 text-[10px] font-bold text-white rounded-full"
        :style="{ backgroundColor: tag.color }"
      >
        {{ tag.title }}
      </span>
    </div>

    <div class="flex gap-1.5 justify-between mt-1.5 text-[11px] text-n-slate-11">
      <span class="truncate">#{{ conversation.id }} - {{ createdAt }}</span>
      <a
        :href="conversationUrl"
        target="_blank"
        rel="noopener"
        class="flex-shrink-0 text-n-brand hover:underline"
        @click.stop
      >
        abrir
      </a>
    </div>
  </div>
</template>
