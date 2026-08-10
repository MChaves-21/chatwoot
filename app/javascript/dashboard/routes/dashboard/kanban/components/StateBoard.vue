<script setup>
/**
 * Quadro por estado — a tela.
 *
 * Somente leitura, por decisao de projeto (10/08/2026). Arrastar aqui teria de
 * significar "mudar o status da conversa", nao "trocar etiqueta" como nos
 * outros dois quadros, e algumas transicoes nao existem: nao ha como devolver
 * uma conversa para "Aberto", porque isso pediria apagar o
 * first_reply_created_at.
 *
 * Como e somente leitura, os cards NAO tem cursor de arrastar (ver a prop
 * :draggable="false"). Um quadro que parece arrastavel e nao e gera chamado.
 */

import { computed } from 'vue';
import KanbanColumn from './KanbanColumn.vue';

const props = defineProps({
  board: { type: Object, required: true },
  conversationUrl: { type: Function, required: true },
});

const emit = defineEmits(['open-table']);

const { board } = props;

const unclassifiedCount = computed(() => board.unclassified.value.length);
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <div
      class="flex flex-wrap gap-2 items-center px-4 py-2 border-b border-n-weak"
    >
      <button
        class="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-n-brand hover:opacity-90"
        @click="emit('open-table')"
      >
        Tabela do dia
      </button>

      <button
        class="px-2.5 py-1.5 text-xs rounded-lg border transition-colors border-n-weak text-n-slate-12 hover:bg-n-alpha-2 disabled:opacity-50"
        :disabled="board.isLoading.value"
        @click="board.load()"
      >
        Recarregar
      </button>

      <span class="text-xs text-n-slate-11">
        {{ board.total.value }} conversas · {{ board.todayConversations.value.length }} com
        atividade hoje
      </span>

      <span class="flex-1" />

      <span class="text-xs text-n-slate-11">{{ board.statusText.value }}</span>
    </div>

    <p
      v-if="unclassifiedCount"
      class="px-4 py-1.5 text-xs"
      style="color: #ef4444"
    >
      {{ unclassifiedCount }} conversa(s) nao se encaixaram em nenhuma coluna.
      Provavelmente o Chatwoot ganhou um status novo — vale conferir
      stateConstants.js.
    </p>

    <div
      class="flex overflow-x-auto overflow-y-hidden flex-1 gap-3 items-start p-3.5"
    >
      <KanbanColumn
        v-for="col in board.columns"
        :key="col.key"
        :column="col"
        :conversations="board.inColumn(col.key)"
        :count-label="board.countFor(col.key)"
        :tags="[]"
        :has-more="false"
        :is-filtered="false"
        :error="''"
        :dragging-id="null"
        :draggable="false"
        :conversation-url="conversationUrl"
      />
    </div>
  </div>
</template>
