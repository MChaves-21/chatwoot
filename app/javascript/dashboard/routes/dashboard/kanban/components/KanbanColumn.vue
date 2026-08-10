<script setup>
import { ref } from 'vue';
import KanbanCard from './KanbanCard.vue';

defineProps({
  column: { type: Object, required: true },
  conversations: { type: Array, default: () => [] },
  countLabel: { type: String, default: '' },
  tags: { type: Array, default: () => [] },
  hasMore: { type: Boolean, default: false },
  isFiltered: { type: Boolean, default: false },
  error: { type: String, default: '' },
  draggingId: { type: [Number, String], default: null },
  conversationUrl: { type: Function, required: true },
  // O quadro por estado e somente leitura. Padrao true: os dois funis de
  // etiqueta nao mudam de comportamento.
  draggable: { type: Boolean, default: true },
});

const emit = defineEmits(['drop', 'load-more', 'open-card', 'drag-start', 'drag-end']);

const isOver = ref(false);

const onDrop = () => {
  isOver.value = false;
  emit('drop');
};
</script>

<template>
  <div
    class="flex flex-col w-[290px] min-w-[290px] max-h-full rounded-xl border bg-n-alpha-2 border-n-weak"
    :class="{ 'outline outline-2 -outline-offset-4 outline-dashed outline-n-brand': isOver }"
    @dragover.prevent="isOver = true"
    @dragleave="isOver = false"
    @drop.prevent="onDrop"
  >
    <div
      class="flex gap-2 items-center px-3 py-2.5 text-sm font-semibold border-b border-n-weak text-n-slate-12"
    >
      <span
        class="flex-shrink-0 rounded-full size-2.5"
        :style="{ backgroundColor: column.color }"
      />
      <span class="truncate">{{ column.title }}</span>
      <span
        class="px-2 ml-auto text-[11px] font-semibold rounded-full border border-n-weak text-n-slate-11"
      >
        {{ countLabel }}
      </span>
    </div>

    <div class="flex overflow-y-auto flex-col flex-1 gap-2 p-2">
      <p v-if="error" class="py-3.5 text-xs text-center" style="color: #ef4444">
        Erro: {{ error }}
      </p>

      <p
        v-else-if="!conversations.length"
        class="py-3.5 text-xs text-center text-n-slate-11"
      >
        {{ isFiltered ? 'Nenhum resultado' : 'Nenhuma conversa' }}
      </p>

      <KanbanCard
        v-for="conv in conversations"
        :key="conv.id"
        :conversation="conv"
        :tags="tags"
        :conversation-url="conversationUrl(conv.id)"
        :is-dragging="draggingId === conv.id"
        :draggable="draggable"
        @open="emit('open-card', conv)"
        @dragstart="
          emit('drag-start', {
            conversation: conv,
            label: column.label || column.key,
          })
        "
        @dragend="emit('drag-end')"
      />

      <button
        v-if="hasMore"
        class="py-1.5 text-xs text-n-brand hover:underline"
        @click="emit('load-more')"
      >
        {{ isFiltered ? 'Carregar mais (para filtrar)' : 'Ver mais' }}
      </button>
    </div>
  </div>
</template>
