<script setup>
/**
 * Seletor de estado da conversa + "Marcar como nao lida" — 12/08/2026.
 *
 * Substitui o botao Resolver no cabecalho da conversa. Mora na pasta do kanban
 * de proposito: o `ResolveAction.vue` do upstream fica INTACTO e o unico
 * arquivo do Chatwoot original que muda e o `MoreActions.vue`, em duas linhas
 * (o import e a tag). O fork esta ~107 commits atras do upstream e so continua
 * barato de atualizar porque quase nao ha sobreposicao — trocar o componente
 * inteiro por um nosso custaria um conflito garantido em toda atualizacao.
 *
 * ─── Por que 4 opcoes e nao as 5 que o quadro mostra ───
 *
 * O quadro "Por estado" tem cinco colunas, mas duas delas NAO sao status do
 * Chatwoot:
 *
 *   - "Aberto" e "Em atendimento" sao o MESMO status (`open`). A diferenca e
 *     `first_reply_created_at`, um carimbo que o servidor grava na primeira
 *     resposta e que nao existe endpoint para apagar. Um botao "Aberto" nao
 *     teria como devolver a conversa para la — so pareceria que sim.
 *   - "Fechado" tambem nao e status: e a etiqueta de descarte. Aqui ele existe
 *     como acao COMPOSTA — resolve a conversa e aplica a etiqueta.
 *
 * Entao a lista honesta e: Em atendimento, Aguardando, Resolvido, Fechado.
 * "Aberto" acontece sozinho quando o cliente escreve e ninguem respondeu.
 *
 * ─── Fechado aplica etiqueta por caixa ───
 *
 * Caixa 6 (Auxilio Acidente) usa `desqualificado`; caixa 9 (BPC) usa
 * `bpc_desqualificado`. Aplicar a errada poria o card na coluna de outro
 * funil. Junto vai `atendimento_humanizado`, pela mesma razao do moveToStage:
 * quem foi descartado nao pode continuar recebendo mensagem do robo.
 *
 * ATENCAO: a API de etiquetas SUBSTITUI o conjunto. A lista final e montada
 * aqui a partir das etiquetas que a conversa ja tem.
 */

import { computed, ref } from 'vue';
import { useStore, useStoreGetters } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { onClickOutside } from '@vueuse/core';

import KanbanAPI from '../api';
import { NO_AUTOMATION_LABEL } from '../constants';
import { CLOSED_LABELS } from '../stateConstants';

/**
 * O MoreActions passa `conversation-id` e `status` para o componente que ficava
 * aqui. Declarados e ignorados de proposito: a fonte de verdade e o store (o
 * status muda por websocket sem passar por prop), e sem declara-los o Vue
 * despejaria os dois como atributos HTML soltos no elemento raiz.
 */
defineProps({
  conversationId: { type: [Number, String], default: null },
  status: { type: String, default: '' },
});

const store = useStore();
const getters = useStoreGetters();

const currentChat = computed(() => getters.getSelectedChat.value || {});

/**
 * Etiqueta de descarte da caixa da conversa. Caixa desconhecida cai no rotulo
 * do Auxilio, que e a caixa maior — errar para o lado mais provavel e melhor
 * que nao marcar nada.
 */
const DISCARD_BY_INBOX = { 6: 'desqualificado', 9: 'bpc_desqualificado' };
const discardLabel = computed(
  () => DISCARD_BY_INBOX[currentChat.value.inbox_id] || 'desqualificado'
);

const chatLabels = computed(() => currentChat.value.labels || []);

/**
 * O estado ATUAL, para marcar a opcao ativa.
 *
 * A ordem de teste repete a precedencia do quadro por estado: Fechado vence
 * Resolvido. Sem isso, uma conversa desqualificada E resolvida apareceria como
 * "Resolvido" aqui e como "Fechado" no kanban — duas telas discordando sobre a
 * mesma conversa.
 *
 * LE contra CLOSED_LABELS inteiro, mas ESCREVE `discardLabel` (a etiqueta da
 * caixa). A assimetria e proposital: ao fechar, so uma etiqueta faz sentido —
 * a do funil da conversa, senao o card vai parar na coluna do outro funil. Ao
 * ler, qualquer etiqueta de descarte ja significa fechado, venha de onde vier
 * (do arrasto no kanban, do sync do n8n ou de outra caixa). Testar so
 * `discardLabel` era o bug de 12/08: 8 conversas com `descarte_sdr` que o
 * quadro mostrava em Fechado e este seletor mostraria como "Em atendimento".
 */
const currentKey = computed(() => {
  if (chatLabels.value.some(l => CLOSED_LABELS.includes(l))) return 'fechado';
  const s = currentChat.value.status;
  if (s === 'resolved') return 'resolvido';
  if (s === 'pending' || s === 'snoozed') return 'aguardando';
  return 'atendimento';
});

const OPTIONS = [
  {
    key: 'atendimento',
    label: 'Em atendimento',
    color: '#3b82f6',
    status: 'open',
    hint: 'Conversa em andamento. Se o cliente falar e ninguém responder, ela aparece como "Aberto" no kanban.',
  },
  {
    key: 'aguardando',
    label: 'Aguardando',
    color: '#eab308',
    status: 'pending',
    hint: 'Respondida, esperando devolutiva do cliente.',
  },
  {
    key: 'resolvido',
    label: 'Resolvido',
    color: '#16a34a',
    status: 'resolved',
    hint: 'Deu certo. Sai da lista de abertas.',
  },
  {
    key: 'fechado',
    label: 'Fechado (desqualificado)',
    color: '#ef4444',
    status: 'resolved',
    discard: true,
    hint: 'Não deu certo. Resolve a conversa, aplica a etiqueta de descarte e desliga o robô.',
  },
];

const current = computed(
  () => OPTIONS.find(o => o.key === currentKey.value) || OPTIONS[0]
);

const isOpen = ref(false);
const isLoading = ref(false);
const root = ref(null);
onClickOutside(root, () => {
  isOpen.value = false;
});

async function pick(opt) {
  isOpen.value = false;
  if (opt.key === currentKey.value) return;
  isLoading.value = true;

  try {
    /*
     * Etiquetas ANTES do status, de proposito.
     *
     * Se o status gravasse primeiro e a etiqueta falhasse, a conversa ficaria
     * resolvida sem marca de descarte — sumiria da lista de abertas e nao
     * apareceria na coluna Fechado do quadro. Invisivel nas duas telas. Na
     * ordem inversa o pior caso e uma conversa marcada como descarte que
     * continua aberta: feia, mas visivel, e o proximo clique conserta.
     */
    if (opt.discard) {
      const wanted = [discardLabel.value, NO_AUTOMATION_LABEL];
      const next = [
        ...chatLabels.value,
        ...wanted.filter(l => !chatLabels.value.includes(l)),
      ];
      if (next.length !== chatLabels.value.length) {
        await KanbanAPI.updateLabels(currentChat.value.id, next);
        // O store guarda a conversa; sem isto o seletor continuaria mostrando
        // o estado antigo ate alguem recarregar.
        currentChat.value.labels = next;
      }
    }

    await store.dispatch('toggleStatus', {
      conversationId: currentChat.value.id,
      status: opt.status,
      snoozedUntil: null,
    });

    useAlert(`Conversa marcada como "${opt.label}".`);
  } catch (err) {
    useAlert(`Não consegui mudar o estado: ${err.message || 'falha na API'}`);
  } finally {
    isLoading.value = false;
  }
}

/**
 * Tira a visualizacao da conversa. Endpoint proprio do Chatwoot
 * (POST /conversations/:id/unread), o mesmo que o menu de contexto da lista ja
 * usa — a acao existia, so nao tinha botao no cabecalho.
 */
const isMarking = ref(false);
async function markUnread() {
  isMarking.value = true;
  try {
    await store.dispatch('markMessagesUnread', { id: currentChat.value.id });
    useAlert('Conversa marcada como não lida.');
  } catch (err) {
    useAlert(`Não consegui marcar como não lida: ${err.message || 'falha'}`);
  } finally {
    isMarking.value = false;
  }
}

const BTN =
  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors border-n-strong text-n-slate-12 hover:bg-n-alpha-2 disabled:opacity-50';
</script>

<template>
  <div ref="root" class="flex relative gap-2 items-center">
    <button
      type="button"
      :class="BTN"
      :disabled="isLoading"
      :title="current.hint"
      @click="isOpen = !isOpen"
    >
      <span
        class="flex-shrink-0 rounded-full size-2"
        :style="{ backgroundColor: current.color }"
      />
      {{ isLoading ? 'Salvando…' : current.label }}
      <span class="text-n-slate-11">▾</span>
    </button>

    <button
      type="button"
      :class="BTN"
      :disabled="isMarking"
      title="Tirar a visualização: a conversa volta a aparecer como não lida na lista"
      @click="markUnread"
    >
      {{ isMarking ? 'Marcando…' : 'Marcar como não lida' }}
    </button>

    <div
      v-if="isOpen"
      class="absolute top-full z-20 p-1 mt-1 rounded-lg border shadow-lg ltr:right-0 rtl:left-0 w-[248px] border-n-strong bg-n-solid-1"
    >
      <button
        v-for="opt in OPTIONS"
        :key="opt.key"
        type="button"
        class="flex gap-2 items-start px-2 py-1.5 w-full text-left rounded-md hover:bg-n-alpha-2"
        :class="opt.key === currentKey ? 'bg-n-alpha-2' : ''"
        @click="pick(opt)"
      >
        <span
          class="flex-shrink-0 mt-1.5 rounded-full size-2"
          :style="{ backgroundColor: opt.color }"
        />
        <span class="min-w-0">
          <span class="block text-xs font-medium text-n-slate-12">
            {{ opt.label }}
          </span>
          <span class="block text-[10.5px] leading-snug text-n-slate-11">
            {{ opt.hint }}
          </span>
        </span>
      </button>

      <!--
        O quadro tem cinco colunas e este menu tem quatro. Sem esta linha, a
        primeira pergunta de quem abrir o menu vai ser "cade o Aberto?".
      -->
      <p
        class="px-2 py-1.5 mt-1 text-[10.5px] leading-snug border-t border-n-weak text-n-slate-11"
      >
        <strong>Aberto</strong> não está aqui porque não é uma escolha: é como o
        kanban chama a conversa em que o cliente falou e ninguém respondeu
        ainda. Ela sai desse estado sozinha na primeira resposta.
      </p>
    </div>
  </div>
</template>
