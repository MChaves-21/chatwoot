<script setup>
/**
 * Coluna de funil de etiqueta.
 *
 * Desde 10/08/2026 serve APENAS aos quadros Auxilio Acidente e BPC — o quadro
 * por estado virou tabela. Por isso a prop `draggable` foi removida: existia so
 * para desligar o arrasto naquele terceiro caso, e agora arrastar e sempre
 * valido aqui.
 */

import { computed, ref } from 'vue';
import KanbanCard from './KanbanCard.vue';

const props = defineProps({
  column: { type: Object, required: true },
  conversations: { type: Array, default: () => [] },
  countLabel: { type: String, default: '' },
  tags: { type: Array, default: () => [] },
  hasMore: { type: Boolean, default: false },
  isFiltered: { type: Boolean, default: false },
  // Coluna ainda sem resposta da API. Ver isPending em useKanbanBoard.js.
  isPending: { type: Boolean, default: false },
  error: { type: String, default: '' },
  draggingId: { type: [Number, String], default: null },
  conversationUrl: { type: Function, required: true },
});

const emit = defineEmits(['drop', 'load-more', 'open-card', 'drag-start', 'drag-end']);

// Tom da cor da etapa no fundo do cabecalho. color-mix mantem a cor do
// constants.js como unica fonte; sem suporte, o navegador ignora e fica neutro.
const headerStyle = computed(() => ({
  backgroundColor: `color-mix(in srgb, ${props.column.color} 14%, transparent)`,
}));

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
      Cor da etapa no cabecalho inteiro — 06/11/2026. Antes era so uma faixa de
      4px no topo; com 13-17 colunas lado a lado, a faixa sumia ao rolar na
      horizontal e achar a etapa ainda pedia ler os titulos. Agora a faixa
      continua e o fundo do cabecalho leva um tom da mesma cor (14%), forte o
      bastante para reconhecer de relance e fraco o bastante para o titulo
      manter contraste.
    -->
    <div
      class="flex flex-col flex-shrink-0 border-b border-n-weak"
      :style="headerStyle"
    >
      <div class="h-[3px]" :style="{ backgroundColor: column.color }" />
      <div class="flex gap-2 items-center px-3 py-2">
        <h2
          class="m-0 min-w-0 text-sm font-semibold leading-5 truncate text-n-slate-12"
          :title="column.title"
        >
          {{ column.title }}
        </h2>
        <span
          class="px-2 py-0.5 ml-auto text-[11px] font-semibold leading-none rounded-full tabular-nums shrink-0 text-n-slate-12 bg-n-alpha-2"
        >
          {{ countLabel }}
        </span>
      </div>
    </div>

    <!--
      Barra de rolagem fina e da cor do tema: a nativa do Windows (larga, com
      setas) ocupava 17px de cada coluna e destoava do resto.
    -->
    <div
      class="flex overflow-y-auto overscroll-contain flex-col flex-1 gap-1.5 p-1.5 [scrollbar-width:thin] [scrollbar-color:rgb(var(--slate-7))_transparent]"
    >
      <p v-if="error" class="py-3.5 text-xs text-center text-n-ruby-11">
        Não carregou: {{ error }}. Use o botão recarregar no topo.
      </p>

      <!--
        Coluna que ainda nao respondeu — 14/08/2026.
        Vem ANTES do vazio porque "Nenhuma conversa" numa coluna que so nao
        carregou ainda e informacao errada. Aparece principalmente em "Sem
        etapa", que desde a mesma data carrega por ULTIMO de proposito. Mantem a
        moldura tracejada: da para largar card aqui mesmo antes de terminar.
      -->
      <div
        v-else-if="isPending && !conversations.length"
        class="flex justify-center items-center py-6 text-xs text-center rounded-lg border border-dashed animate-pulse motion-reduce:animate-none border-n-weak text-n-slate-10"
        aria-busy="true"
      >
        Carregando…
      </div>

      <!--
        Coluna vazia com moldura tracejada: le-se como "cabe card aqui", que e
        util justamente quando a pessoa esta arrastando um. O texto plano
        anterior parecia mensagem de erro.
      -->
      <div
        v-else-if="!conversations.length"
        class="flex justify-center items-center px-3 py-6 text-xs text-center rounded-lg border border-dashed border-n-weak text-n-slate-10"
      >
        {{
          isFiltered
            ? 'Nenhuma conversa com esses filtros'
            : 'Nenhuma conversa. Arraste um card para cá.'
        }}
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
        type="button"
        class="py-1.5 text-xs rounded-lg transition-colors text-n-brand hover:bg-n-alpha-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-n-brand"
        @click="emit('load-more')"
      >
        {{ isFiltered ? 'Carregar mais (para filtrar)' : 'Ver mais' }}
      </button>
    </div>
  </div>
</template>
