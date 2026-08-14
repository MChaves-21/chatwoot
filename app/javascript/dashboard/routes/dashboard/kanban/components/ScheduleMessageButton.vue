<script setup>
/**
 * Agendar mensagem — 14/08/2026.
 *
 * Botao no cabecalho da conversa que grava um agendamento FORA do Chatwoot (um
 * webhook do n8n, que escreve no Supabase). Um cron no n8n pega os vencidos e
 * dispara.
 *
 * ─── Por que nao da para usar o Chatwoot ───
 *
 * `app/models/campaign.rb` recusa qualquer caixa que nao seja Website, Twilio
 * SMS, Sms ou Whatsapp. As duas caixas do escritorio sao `Channel::Api`. E
 * `scheduled_at` so existe em campanha — nao ha agendamento de mensagem avulsa
 * nesta versao. Campanha esta fora, e nao e questao de flag.
 *
 * ─── O que ENTREGA a mensagem na hora marcada ───
 *
 * Conferido em 14/08/2026, e o ponto que define todo o desenho: cada caixa
 * `Channel::Api` tem um `webhook_url` PROPRIO (`GET /inboxes`), apontando
 * direto para a uazapi. Toda mensagem de saida da caixa vai para la e a uazapi
 * entrega no WhatsApp — sem n8n no meio.
 *
 * Entao o cron nao precisa falar com a uazapi. Ele so faz
 * `POST /api/v1/accounts/1/conversations/{id}/messages`, e a entrega E o
 * historico saem pelo caminho que ja existe. Era a pergunta que travava este
 * recurso.
 *
 * Vale registrar o que foi descartado: o webhook de CONTA `message_created`
 * aponta para o workflow `1. COMERCIAL - PREV`, mas ele nao entrega nada —
 * quando a mensagem e do escritorio (`Fromme: true`) ele para no IF
 * "E do cliente?" em ~37ms (execucao 138394). Ou seja, a mensagem agendada
 * nascer NAO aciona a IA. Foi a checagem da secao 6 do CONTEXTOfork ("liste o
 * que escuta o evento") aplicada antes de escrever, e nao depois.
 *
 * ─── A nota privada foi LIGADA em 14/08/2026, depois de medida ───
 *
 * O desenho previa deixar uma nota privada na conversa ao agendar, para
 * qualquer atendente ver na linha do tempo. O que travava:
 *
 *   `app/models/concerns/message_filter_helpers.rb`
 *   def webhook_sendable? = incoming? || outgoing? || template?
 *
 * NAO testa `private?` — e a `notifiable?`, tres linhas abaixo, testa. Ou seja,
 * o Chatwoot despacha a nota privada para o webhook da caixa igual a qualquer
 * mensagem de saida; quem precisa ignora-la e a uazapi. O payload leva
 * `private: true` (Message#webhook_data), entao ela TEM como filtrar — mas
 * "tem como" nao era "filtra", e ninguem tinha medido.
 *
 * MEDIDO EM 14/08/2026: nota privada criada na conversa 466 (caixa 6, contato
 * +5585998552131, o proprio usuario) — mensagem 19545, `private: true`,
 * `message_type: outgoing`, `status: sent` no Chatwoot. NAO chegou no WhatsApp.
 * A uazapi filtra pelo `private` do payload.
 *
 * Ressalva registrada: o teste foi na caixa 6. A caixa 9 tem outro
 * `webhook_url`, mas aponta para a MESMA instancia da uazapi (mesmo host,
 * mesmo token), entao e o mesmo codigo filtrando. Se alguem apontar uma caixa
 * para outra instancia ou trocar de gateway, MECA DE NOVO antes de confiar —
 * esta constante deixa de estar coberta pela medicao.
 */

import { computed, ref, nextTick } from 'vue';
import { useStoreGetters } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { onClickOutside } from '@vueuse/core';

import KanbanAPI, { scheduleMessage } from '../api';
import { LS_KEY } from '../constants';

const NOTA_PRIVADA_AO_AGENDAR = true;

/**
 * Declaradas e ignoradas pelo mesmo motivo do ConversationStatePicker: sem
 * declarar, o Vue despejaria as props como atributos HTML soltos na raiz. A
 * fonte de verdade e o store, que o websocket atualiza sozinho.
 */
defineProps({
  conversationId: { type: [Number, String], default: null },
});

const getters = useStoreGetters();
const currentChat = computed(() => getters.getSelectedChat.value || {});

/**
 * As prefs do kanban vivem no localStorage, nao num store. Ler daqui e
 * deliberado: este componente mora no cabecalho da CONVERSA, nao no quadro,
 * entao nao ha composable do kanban montado para consultar. O mesmo LS_KEY
 * mantem uma configuracao so — dois lugares para a mesma URL divergiriam.
 */
function readPrefs() {
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

/**
 * Sem webhook configurado o botao NAO aparece.
 *
 * Botao que abre um painel e falha ao salvar e pior que botao ausente: o
 * atendente acha que agendou. Quem configura e o modal de Configuracoes do
 * kanban.
 */
const isEnabled = computed(() => {
  const p = readPrefs();
  return Boolean(p.scheduleUrl && p.secret);
});

const isOpen = ref(false);
const isSaving = ref(false);
const text = ref('');
const when = ref('');
const error = ref('');
const panel = ref(null);
const textarea = ref(null);

onClickOutside(panel, () => {
  if (!isSaving.value) isOpen.value = false;
});

/** `datetime-local` fala no fuso do navegador e sem segundos. */
function toLocalInput(date) {
  const p = n => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}:${p(date.getMinutes())}`
  );
}

/**
 * Atalhos de periodo. "Amanha 9h" e as 9 da manha do DIA seguinte, mesmo que
 * agora sejam 8h — quem escolhe "amanha" quer amanha.
 */
const SHORTCUTS = [
  {
    key: '1h',
    title: 'Em 1 hora',
    at: () => new Date(Date.now() + 60 * 60 * 1000),
  },
  {
    key: 'amanha',
    title: 'Amanhã 9h',
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    key: '3d',
    title: 'Em 3 dias',
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      return d;
    },
  },
];

const pick = shortcut => {
  when.value = toLocalInput(shortcut.at());
  error.value = '';
};

const open = async () => {
  isOpen.value = true;
  error.value = '';
  if (!when.value) pick(SHORTCUTS[1]);
  await nextTick();
  textarea.value?.focus();
};

const phone = computed(
  () => currentChat.value.meta?.sender?.phone_number || ''
);
const contactName = computed(() => currentChat.value.meta?.sender?.name || '');

const whenLabel = computed(() => {
  if (!when.value) return '';
  const d = new Date(when.value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
});

const submit = async () => {
  const conteudo = text.value.trim();
  if (!conteudo) {
    error.value = 'Escreva a mensagem.';
    return;
  }
  const quando = new Date(when.value);
  if (Number.isNaN(quando.getTime())) {
    error.value = 'Escolha uma data e hora válidas.';
    return;
  }
  // Um minuto de folga: o cron roda de 5 em 5 min, entao agendar para "agora"
  // ja nasceria atrasado e a conta de atraso ficaria confusa.
  if (quando.getTime() < Date.now() + 60 * 1000) {
    error.value = 'A data precisa estar no futuro.';
    return;
  }

  isSaving.value = true;
  error.value = '';
  const prefs = readPrefs();
  const conversationIdAtual = currentChat.value.id;

  // ISO em UTC. O `datetime-local` devolve horario local SEM fuso; mandar essa
  // string crua faria o n8n comparar 15:00 de Fortaleza com 15:00 UTC e
  // disparar tres horas cedo.
  const res = await scheduleMessage({
    url: prefs.scheduleUrl,
    secret: prefs.secret,
    conversationId: conversationIdAtual,
    inboxId: currentChat.value.inbox_id,
    phone: phone.value,
    contactName: contactName.value,
    scheduledAt: quando.toISOString(),
    content: conteudo,
  });
  isSaving.value = false;

  if (!res.ok) {
    error.value = res.error || 'Não consegui agendar.';
    return;
  }

  if (NOTA_PRIVADA_AO_AGENDAR) {
    // Falha aqui NAO desfaz o agendamento: a mensagem ja esta gravada e vai
    // sair. A nota e conveniencia de leitura, nao parte do compromisso.
    try {
      await KanbanAPI.createPrivateNote(
        conversationIdAtual,
        `📅 Mensagem agendada para ${whenLabel.value} — ${conteudo}`
      );
    } catch (e) {
      useAlert('Agendado, mas não consegui deixar a nota na conversa.');
    }
  }

  useAlert(`Mensagem agendada para ${whenLabel.value}.`);
  text.value = '';
  isOpen.value = false;
};

const BTN =
  'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-n-slate-12 hover:bg-n-alpha-2';
const INPUT =
  'w-full px-2.5 py-2 text-sm rounded-lg border bg-n-background border-n-weak text-n-slate-12';
</script>

<template>
  <div v-if="isEnabled" ref="panel" class="relative flex items-center">
    <button
      v-tooltip="'Agendar mensagem'"
      :class="BTN"
      @click="isOpen ? (isOpen = false) : open()"
    >
      <span class="i-lucide-clock size-4" />
      <span class="hidden sm:inline">Agendar</span>
    </button>

    <div
      v-if="isOpen"
      class="absolute top-full z-50 mt-1 w-[340px] p-3 rounded-xl border shadow-lg ltr:right-0 rtl:left-0 bg-n-solid-2 border-n-weak"
    >
      <p class="mb-2 text-xs font-semibold text-n-slate-12">
        Agendar mensagem
        <span v-if="contactName" class="font-normal text-n-slate-11">
          para {{ contactName }}
        </span>
      </p>

      <div class="flex flex-wrap gap-1.5 mb-2">
        <button
          v-for="s in SHORTCUTS"
          :key="s.key"
          class="px-2 py-1 text-[11px] rounded-md border border-n-weak text-n-slate-12 hover:bg-n-alpha-2"
          @click="pick(s)"
        >
          {{ s.title }}
        </button>
      </div>

      <input v-model="when" type="datetime-local" :class="INPUT" />

      <textarea
        ref="textarea"
        v-model="text"
        :class="`${INPUT} mt-2 min-h-[90px] resize-y`"
        placeholder="Mensagem que será enviada..."
      />

      <p v-if="error" class="mt-2 text-xs" style="color: #ef4444">
        {{ error }}
      </p>
      <p v-else-if="whenLabel" class="mt-2 text-[11px] text-n-slate-11">
        Será enviada em {{ whenLabel }}.
      </p>

      <div class="flex gap-2 justify-end mt-3">
        <button
          class="px-3 py-1.5 text-xs rounded-lg border border-n-weak text-n-slate-12"
          @click="isOpen = false"
        >
          Cancelar
        </button>
        <button
          :disabled="isSaving"
          class="px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-n-brand disabled:opacity-60"
          @click="submit"
        >
          {{ isSaving ? 'Agendando...' : 'Agendar' }}
        </button>
      </div>
    </div>
  </div>
</template>
