<script setup>
/**
 * Coluna de funil de etiqueta.
 *
 * Desde 10/08/2026 serve APENAS aos quadros Auxilio Acidente e BPC — o quadro
 * por estado virou tabela. Por isso a prop `draggable` foi removida: existia so
 * para desligar o arrasto naquele terceiro caso, e agora arrastar e sempre
 * valido aqui.
 */

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
});

const emit = defineEmits(['drop', 'load-more', 'open-card', 'drag-start', 'drag-end']);

/**
 * Contador em vez de booleano.
 *
 * `dragleave` dispara toda vez que o ponteiro passa de um filho para outro
 * dentro da coluna, entao com um booleano o destaque piscava enquanto o card
 * atravessava a lista. Contando enter menos leave, o destaque so cai quando o
 * ponteiro sai da coluna de verdade.
 */
const overDepth = ref(0);
const isOver = ref(false);

const onEnter = () => {
  overDepth.value += 1;
  isOver.value = true;
};

const onLeave = () => {
  overDepth.value = Math.max(0, overDepth.value - 1);
  if (!overDepth.value) isOver.value = false;
};

const reset = () => {
  overDepth.value = 0;
  isOver.value = false;
};

const onDrop = () => {
  reset();
  emit('drop');
};
</script>

<template>
  <div
    class="flex overflow-hidden flex-col w-[290px] min-w-[290px] max-h-full rounded-xl border transition-colors bg-n-alpha-2 border-n-weak"
    :class="{ 'border-n-brand bg-n-alpha-3': isOver }"
    @dragenter="onEnter"
    @dragover.prevent
    @dragleave="onLeave"
    @drop.prevent="onDrop"
  >
    <!--
      Faixa fina da cor da etapa no topo. Antes a cor era so uma bolinha de
      10px ao lado do titulo; com 13-15 colunas lado a lado, achar a etapa
      certa pela bolinha exigia ler todos os titulos.
    -->
    <div class="h-1 flex-shrink-0" :style="{ backgroundColor: column.color }" />

    <div
      class="flex gap-2 items-center px-3 py-2.5 text-sm font-semibold border-b border-n-weak text-n-slate-12"
    >
      <span class="truncate" :title="column.title">{{ column.title }}</span>
      <span
        class="px-2 py-0.5 ml-auto text-[11px] font-bold leading-none rounded-full text-n-slate-12 bg-n-alpha-2"
      >
        {{ countLabel }}
      </span>
    </div>

    <div class="flex overflow-y-auto flex-col flex-1 gap-2 p-2">
      <p v-if="error" class="py-3.5 text-xs text-center" style="color: #ef4444">
        Erro: {{ error }}
      </p>

      <!--
        Coluna vazia com moldura tracejada: le-se como "cabe card aqui", que e
        util justamente quando a pessoa esta arrastando um. O texto plano
        anterior parecia mensagem de erro.
      -->
      <div
        v-else-if="!conversations.length"
        class="flex justify-center items-center py-6 text-xs text-center rounded-lg border border-dashed border-n-weak text-n-slate-10"
      >
        {{ isFiltered ? 'Nenhum resultado' : 'Nenhuma conversa' }}
      </div>

      <KanbanCard
        v-for="conv in conversations"
        :key="conv.id"
        :conversation="conv"
        :tags="tags"
        :conversation-url="conversationUrl(conv.id)"
        :is-dragging="draggingId === conv.id"
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
