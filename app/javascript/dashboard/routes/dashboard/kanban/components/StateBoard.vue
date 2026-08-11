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
 * Desde 10/08/2026 o corpo e uma TABELA, nao colunas de cards (ver
 * StateTable.vue). Consequencia importante: KanbanColumn e KanbanCard deixaram
 * de ser usados aqui e passaram a servir so os dois funis de etiqueta — foi o
 * que liberou a prop `draggable`, que existia so para este quadro.
 */

import { computed } from 'vue';
import StateTable from './StateTable.vue';

const props = defineProps({
  board: { type: Object, required: true },
  conversationUrl: { type: Function, required: true },
});

const emit = defineEmits(['open-table']);

const { board } = props;

const unclassifiedCount = computed(() => board.unclassified.value.length);

/**
 * Texto do contador. Em "Tudo" nao ha recorte, entao mostrar "503 de 503" so
 * ocuparia espaco.
 */
const countText = computed(() => {
  const all = board.total.value;
  if (board.scope.value === 'tudo') return `${all} conversas`;
  return `${board.scopedTotal.value} de ${all} conversas`;
});
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <div
      class="flex flex-wrap gap-2 items-center px-4 py-2 border-b border-n-weak"
    >
      <!--
        Seletor de periodo. "Hoje" e teve atividade hoje (last_activity_at), o
        mesmo criterio da tabela que a equipe fotografa as 12h e as 17h30 — se
        os dois discordassem, a equipe deixaria de confiar nos dois.
      -->
      <div class="flex overflow-hidden rounded-lg border border-n-weak">
        <button
          v-for="s in board.scopes"
          :key="s.key"
          class="px-2.5 py-1 text-xs transition-colors border-r last:border-r-0 border-n-weak"
          :class="
            board.scope.value === s.key
              ? 'bg-n-brand text-white font-semibold'
              : 'text-n-slate-11 hover:bg-n-alpha-2'
          "
          @click="board.scope.value = s.key"
        >
          {{ s.title }}
        </button>
      </div>

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
        {{ countText }} · {{ board.todayConversations.value.length }} com
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

    <StateTable :board="board" :conversation-url="conversationUrl" />
  </div>
</template>
