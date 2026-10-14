<script setup>
/**
 * Acompanhamento de uma campanha: contagem por status, um contato por linha,
 * pausar / retomar / cancelar e exportar CSV.
 *
 * "Retomar" recalcula o horario de todos os pendentes a partir de agora (no
 * n8n), com o mesmo ritmo da criacao. "Cancelar" marca os pendentes como
 * cancelados; quem ja estava "Enviando" naquele minuto ainda pode sair.
 * "Excluir" so aparece em campanha concluida ou cancelada e apaga a campanha e
 * os destinatarios no n8n (o historico nas conversas do Chatwoot fica).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { callDisparador } from '../api';
import {
  CAMPAIGN_STATUS,
  RECIPIENT_STATUS,
  REFRESH_MS,
  TIME_ZONE,
} from '../constants';
import { formatDateTime, toCsv } from '../helpers';
import StatusPill from './StatusPill.vue';

const props = defineProps({
  campanhaId: { type: Number, required: true },
});
const emit = defineEmits(['back', 'changed', 'deleted']);

const route = useRoute();
const BTN =
  'inline-flex gap-1.5 items-center px-3 h-8 text-xs font-medium rounded-lg border transition-colors border-n-weak text-n-slate-12 hover:bg-n-alpha-1 disabled:opacity-50';

const campanha = ref(null);
const destinatarios = ref([]);
const loading = ref(false);
const error = ref('');
const busy = ref(false);
const filtro = ref('');

async function load() {
  loading.value = true;
  try {
    const r = await callDisparador('detalhar', {
      campanha_id: props.campanhaId,
    });
    campanha.value = r.campanha;
    destinatarios.value = r.destinatarios || [];
    error.value = '';
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

let timer = null;
onMounted(() => {
  load();
  timer = setInterval(() => {
    if (campanha.value && campanha.value.status === 'agendada') load();
  }, REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));

const contagem = computed(() => {
  const c = {};
  destinatarios.value.forEach(d => {
    c[d.status] = (c[d.status] || 0) + 1;
  });
  return c;
});

const config = computed(() => {
  try {
    return JSON.parse((campanha.value && campanha.value.config_json) || '{}');
  } catch (e) {
    return {};
  }
});
const template = computed(() => {
  try {
    return JSON.parse((campanha.value && campanha.value.template_json) || '{}');
  } catch (e) {
    return {};
  }
});

const visiveis = computed(() =>
  filtro.value
    ? destinatarios.value.filter(d => d.status === filtro.value)
    : destinatarios.value
);

function conversationUrl(id) {
  return `/app/accounts/${route.params.accountId}/conversations/${id}`;
}

async function act(acao, pergunta) {
  // eslint-disable-next-line no-alert
  if (pergunta && !window.confirm(pergunta)) return;
  busy.value = true;
  try {
    await callDisparador(acao, { campanha_id: props.campanhaId });
    await load();
    emit('changed');
  } catch (e) {
    // eslint-disable-next-line no-alert
    window.alert(e.message);
  } finally {
    busy.value = false;
  }
}

const podeExcluir = computed(
  () =>
    campanha.value &&
    ['concluida', 'cancelada'].includes(campanha.value.status)
);

async function excluir() {
  const pergunta =
    'Excluir esta campanha do Disparador? Some da lista junto com a lista de ' +
    'destinatários. As mensagens já enviadas continuam nas conversas. Não dá ' +
    'para desfazer.';
  // eslint-disable-next-line no-alert
  if (!window.confirm(pergunta)) return;
  busy.value = true;
  try {
    await callDisparador('excluir', { campanha_id: props.campanhaId });
    emit('deleted');
  } catch (e) {
    // eslint-disable-next-line no-alert
    window.alert(e.message);
  } finally {
    busy.value = false;
  }
}

function exportCsv() {
  const csv = toCsv(destinatarios.value, [
    { label: 'Ordem', value: d => d.ordem },
    { label: 'Nome', value: d => d.nome },
    { label: 'Telefone', value: d => d.telefone },
    { label: 'Conversa', value: d => d.conversation_id },
    { label: 'Status', value: d => (RECIPIENT_STATUS[d.status] || {}).label || d.status },
    { label: 'Agendado para', value: d => formatDateTime(d.agendado_para, TIME_ZONE) },
    { label: 'Processado em', value: d => formatDateTime(d.enviado_em, TIME_ZONE) },
    { label: 'Erro / motivo', value: d => d.erro },
  ]);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `disparo-${props.campanhaId}-${(campanha.value.nome || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <button
      class="inline-flex gap-1 items-center self-start text-sm text-n-slate-11 hover:text-n-slate-12"
      @click="emit('back')"
    >
      <span class="i-lucide-arrow-left size-4" /> Campanhas
    </button>

    <p v-if="error" class="text-sm text-n-ruby-11">{{ error }}</p>
    <p v-else-if="!campanha && loading" class="text-sm text-n-slate-11">
      Carregando…
    </p>

    <template v-if="campanha">
      <header class="flex flex-wrap gap-3 justify-between items-start">
        <div class="min-w-0">
          <div class="flex gap-2 items-center">
            <h2 class="text-xl font-semibold text-n-slate-12">
              {{ campanha.nome }}
            </h2>
            <StatusPill :status="campanha.status" :map="CAMPAIGN_STATUS" />
          </div>
          <p class="mt-1 text-sm text-n-slate-11">
            {{ campanha.inbox_nome }} · criada por {{ campanha.criado_por }} em
            {{ formatDateTime(campanha.createdAt, TIME_ZONE) }}
          </p>
          <p class="mt-1 text-xs text-n-slate-10">
            Ritmo: {{ config.intervalo_min }}–{{ config.intervalo_max }} s
            <template v-if="config.pausa_a_cada">
              · pausa de {{ config.pausa_minutos }} min a cada
              {{ config.pausa_a_cada }}
            </template>
            · {{ config.janela_inicio }}–{{ config.janela_fim }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button :class="BTN" :disabled="loading" @click="load">
            <span
              class="i-lucide-refresh-cw size-3.5"
              :class="loading ? 'animate-spin' : ''"
            />
            Atualizar
          </button>
          <button
            v-if="campanha.status === 'agendada'"
            :class="BTN"
            :disabled="busy"
            @click="act('pausar')"
          >
            <span class="i-lucide-pause size-3.5" /> Pausar
          </button>
          <button
            v-if="campanha.status === 'pausada'"
            :class="BTN"
            :disabled="busy"
            @click="
              act(
                'retomar',
                'Retomar a campanha? Os pendentes ganham novos horários a partir de agora.'
              )
            "
          >
            <span class="i-lucide-play size-3.5" /> Retomar
          </button>
          <button
            v-if="['agendada', 'pausada'].includes(campanha.status)"
            :class="BTN"
            class="text-n-ruby-11"
            :disabled="busy"
            @click="
              act(
                'cancelar',
                'Cancelar a campanha? Os pendentes não serão mais enviados. Não dá para desfazer.'
              )
            "
          >
            <span class="i-lucide-square size-3.5" /> Cancelar
          </button>
          <button :class="BTN" @click="exportCsv">
            <span class="i-lucide-download size-3.5" /> CSV
          </button>
          <button
            v-if="podeExcluir"
            :class="BTN"
            class="text-n-ruby-11"
            :disabled="busy"
            @click="excluir"
          >
            <span class="i-lucide-trash-2 size-3.5" /> Excluir
          </button>
        </div>
      </header>

      <div
        class="p-3 text-sm whitespace-pre-wrap rounded-lg border border-n-weak bg-n-solid-1 text-n-slate-12"
      >
        <span
          v-if="campanha.tipo_mensagem === 'template'"
          class="block mb-1 text-xs text-n-slate-10"
        >
          Template {{ template.name }} ({{ template.language }})
        </span>
        {{
          campanha.tipo_mensagem === 'template'
            ? template.body_text
            : campanha.conteudo
        }}
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          class="px-3 h-7 text-xs rounded-full border"
          :class="
            !filtro
              ? 'border-n-blue-8 bg-n-blue-3 text-n-slate-12'
              : 'border-n-weak text-n-slate-11'
          "
          @click="filtro = ''"
        >
          Todos · {{ destinatarios.length }}
        </button>
        <button
          v-for="(info, key) in RECIPIENT_STATUS"
          v-show="contagem[key]"
          :key="key"
          class="px-3 h-7 text-xs rounded-full border"
          :class="
            filtro === key
              ? 'border-n-blue-8 bg-n-blue-3 text-n-slate-12'
              : 'border-n-weak text-n-slate-11'
          "
          @click="filtro = key"
        >
          {{ info.label }} · {{ contagem[key] }}
        </button>
      </div>

      <div class="overflow-x-auto rounded-xl border border-n-weak">
        <table class="w-full text-sm">
          <thead class="text-xs text-left text-n-slate-10 bg-n-alpha-1">
            <tr>
              <th class="px-3 py-2 font-medium">#</th>
              <th class="px-3 py-2 font-medium">Contato</th>
              <th class="px-3 py-2 font-medium">Status</th>
              <th class="px-3 py-2 font-medium">Agendado</th>
              <th class="px-3 py-2 font-medium">Processado</th>
              <th class="px-3 py-2 font-medium">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in visiveis"
              :key="d.id"
              class="border-t border-n-weak"
            >
              <td class="px-3 py-2 text-n-slate-10">{{ d.ordem }}</td>
              <td class="px-3 py-2">
                <a
                  :href="conversationUrl(d.conversation_id)"
                  target="_blank"
                  rel="noopener"
                  class="text-n-slate-12 hover:underline"
                >
                  {{ d.nome || d.telefone || `Conversa ${d.conversation_id}` }}
                </a>
                <span class="block text-xs text-n-slate-10">
                  {{ d.telefone }}
                </span>
              </td>
              <td class="px-3 py-2">
                <StatusPill :status="d.status" :map="RECIPIENT_STATUS" />
              </td>
              <td class="px-3 py-2 whitespace-nowrap text-n-slate-11">
                {{ formatDateTime(d.agendado_para, TIME_ZONE) }}
              </td>
              <td class="px-3 py-2 whitespace-nowrap text-n-slate-11">
                {{ formatDateTime(d.enviado_em, TIME_ZONE) }}
              </td>
              <td class="px-3 py-2 text-xs text-n-slate-11">{{ d.erro }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
