<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import KanbanAPI, { fetchSummary } from '../api';
import { LEAD_FLAGS, UNSTAGED_LABEL } from '../constants';
import {
  buildPrevSummary,
  convAssignee,
  convCreatedRaw,
  convDisplayName,
  convLabels,
  convPhone,
  convStageLabel,
  fmtDate,
  isTrue,
  msgItems,
  msgsToArr,
  situacaoBR,
  suggestTags,
} from '../helpers';

const props = defineProps({
  conversation: { type: Object, required: true },
  columns: { type: Array, default: () => [] },
  tags: { type: Array, default: () => [] },
  prefs: { type: Object, required: true },
  conversationUrl: { type: String, required: true },
  // Acoes assincronas do quadro. Vem como funcao, e nao como evento, porque
  // o popup precisa saber quando terminaram para liberar o botao.
  toggleTag: { type: Function, required: true },
  moveToStage: { type: Function, required: true },
});

const emit = defineEmits(['close']);

const full = ref({});
const messages = ref([]);
const lead = ref(null);
const isLoading = ref(true);
const loadError = ref('');
const tab = ref('resumo');
const busyTag = ref(null);
const busyStage = ref(null);

const summaryText = ref('');
const summaryFromAI = ref(false);
const isSummarizing = ref(false);

const stageLabels = computed(() => props.columns.map(c => c.label));
const name = computed(() => convDisplayName(props.conversation));
const phone = computed(() => convPhone(props.conversation));

/**
 * Fonte de verdade: o objeto do quadro. E nele que moveToStage e toggleTag
 * escrevem, e ele ja vem com labels na carga da coluna.
 *
 * Preferir full.value.labels aqui era um bug: o GET /conversations/:id sempre
 * devolve labels, entao esse ramo vencia sempre e congelava no momento da
 * carga — os chips de tag paravam de responder ao clique mesmo com a gravacao
 * dando certo.
 */
const appliedLabels = computed(() => convLabels(props.conversation));

const stage = computed(() => {
  const found = convStageLabel(
    { labels: appliedLabels.value },
    stageLabels.value
  );
  // Card do funil BPC que ainda nao foi classificado: nenhuma etiqueta bate,
  // mas ele nao esta "sem fase" — esta na coluna Sem etapa, e o botao dela
  // precisa aparecer desabilitado como o da fase atual.
  const lbl =
    found ||
    (stageLabels.value.includes(UNSTAGED_LABEL) ? UNSTAGED_LABEL : '');
  const col = props.columns.find(c => c.label === lbl);
  return {
    label: lbl,
    title: col ? col.title : '-',
    color: col ? col.color : '#64748b',
  };
});

/** Etiquetas que não são etapa nem tag configurada — mostradas como leitura. */
const otherLabels = computed(() => {
  const tagLabels = props.tags.map(t => t.label);
  return appliedLabels.value.filter(
    l => !stageLabels.value.includes(l) && !tagLabels.includes(l)
  );
});

const suggested = computed(() => {
  if (isLoading.value) return [];
  try {
    return suggestTags(
      { labels: appliedLabels.value },
      lead.value,
      messages.value,
      props.tags
    );
  } catch (e) {
    return [];
  }
});

const leadFlags = computed(() => {
  if (!lead.value) return [];
  return LEAD_FLAGS.filter(f => isTrue(lead.value[f.key]));
});

const hasLead = computed(
  () =>
    lead.value &&
    (lead.value.id !== undefined || lead.value.Telefone !== undefined)
);

const chatMessages = computed(() => msgItems(messages.value));

const tagIsOn = label => appliedLabels.value.includes(label);
const tagTitle = label =>
  (props.tags.find(t => t.label === label) || {}).title || label;

// ------------------------------------------------------------------ resumo

async function renderSummary({ forceLocal = false } = {}) {
  isSummarizing.value = true;
  summaryText.value = '';

  if (!forceLocal && props.prefs.summaryUrl && props.prefs.secret) {
    const txt = await fetchSummary({
      url: props.prefs.summaryUrl,
      secret: props.prefs.secret,
      conversationId: props.conversation.id,
      phone: phone.value,
      messages: msgsToArr(messages.value),
    });
    if (txt) {
      summaryText.value = txt;
      summaryFromAI.value = true;
      isSummarizing.value = false;
      return;
    }
  }

  summaryFromAI.value = false;
  summaryText.value = buildPrevSummary({
    conv: props.conversation,
    full: full.value,
    lead: lead.value,
    msgs: messages.value,
    columns: props.columns,
    tags: props.tags,
  });
  isSummarizing.value = false;
}

// ------------------------------------------------------------------- carga

onMounted(async () => {
  document.addEventListener('keydown', onKey);
  try {
    const [f, m] = await Promise.all([
      KanbanAPI.getConversation(props.conversation.id),
      KanbanAPI.getMessages(props.conversation.id),
    ]);
    full.value = f || {};
    messages.value = m || [];

    if (props.prefs.leadUrl && props.prefs.secret && phone.value) {
      const { fetchLead } = await import('../api');
      lead.value = await fetchLead({
        url: props.prefs.leadUrl,
        secret: props.prefs.secret,
        phone: phone.value,
      });
    }
    isLoading.value = false;
    await renderSummary();
  } catch (err) {
    isLoading.value = false;
    loadError.value = err.message || 'Falha ao carregar a conversa';
  }
});

onBeforeUnmount(() => document.removeEventListener('keydown', onKey));

function onKey(e) {
  if (e.key === 'Escape') emit('close');
}

// ------------------------------------------------------------------ acoes

async function onToggleTag(label) {
  busyTag.value = label;
  const res = await props.toggleTag(props.conversation, label);
  busyTag.value = null;
  // A conversa e o mesmo objeto do board, entao appliedLabels ja reflete a
  // mudanca; so precisamos recalcular o resumo se ele for o local.
  if (res && res.ok && !summaryFromAI.value) await renderSummary({ forceLocal: true });
}

async function onMove(toLabel) {
  busyStage.value = toLabel;
  const res = await props.moveToStage(
    props.conversation,
    stage.value.label,
    toLabel
  );
  busyStage.value = null;
  if (res && res.ok) emit('close');
}

const CHIP =
  'px-2 py-0.5 text-[11px] rounded-full border border-n-weak text-n-slate-11';
const ROW =
  'flex gap-2.5 justify-between py-1 text-sm border-b border-n-weak';
const SEC =
  'mt-3.5 mb-1.5 text-[11px] font-semibold tracking-wide uppercase text-n-slate-11';
</script>

<template>
  <div
    class="flex fixed inset-0 z-50 justify-center items-center bg-black/60"
    @click.self="emit('close')"
  >
    <div
      class="flex overflow-hidden flex-col w-[900px] max-w-[96vw] max-h-[90vh] rounded-2xl border shadow-lg bg-n-background border-n-weak"
    >
      <!-- cabecalho -->
      <div
        class="flex justify-between items-center px-4 py-3.5 border-b border-n-weak"
      >
        <div class="min-w-0">
          <div class="text-lg font-bold truncate text-n-slate-12">{{ name }}</div>
          <div class="mt-0.5 text-xs text-n-slate-11">
            {{ phone }} - #{{ conversation.id }}
          </div>
        </div>
        <button
          class="px-1.5 text-2xl leading-none text-n-slate-11"
          aria-label="Fechar"
          @click="emit('close')"
        >
          &times;
        </button>
      </div>

      <div class="flex flex-1 min-h-0">
        <!-- coluna esquerda -->
        <div
          class="overflow-y-auto px-4 py-3.5 w-80 min-w-80 border-r border-n-weak"
        >
          <p v-if="isLoading" class="text-sm text-n-slate-11">Carregando...</p>
          <p v-else-if="loadError" class="text-sm" style="color: #ef4444">
            Erro: {{ loadError }}
          </p>

          <template v-else>
            <div :class="ROW">
              <span class="text-n-slate-11">Estágio</span>
              <span
                class="px-2 text-[11px] font-bold text-white rounded-full"
                :style="{ backgroundColor: stage.color }"
              >
                {{ stage.title }}
              </span>
            </div>
            <div :class="ROW">
              <span class="text-n-slate-11">Responsável</span>
              <span class="text-n-slate-12">{{ convAssignee(full) || '-' }}</span>
            </div>
            <div :class="ROW">
              <span class="text-n-slate-11">Criado</span>
              <span class="text-n-slate-12">
                {{ fmtDate(full.created_at || convCreatedRaw(conversation)) }}
              </span>
            </div>
            <div :class="ROW">
              <span class="text-n-slate-11">Status</span>
              <span class="text-n-slate-12">{{ situacaoBR(full.status) }}</span>
            </div>

            <template v-if="otherLabels.length">
              <p :class="SEC">Etiquetas</p>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="l in otherLabels" :key="l" :class="CHIP">{{ l }}</span>
              </div>
            </template>

            <p :class="SEC">Tags</p>
            <div v-if="!tags.length" class="text-sm text-n-slate-11">
              Nenhuma tag configurada.
            </div>
            <div v-else class="flex flex-wrap gap-1.5">
              <button
                v-for="tag in tags"
                :key="tag.label"
                class="px-2.5 py-0.5 text-[11px] rounded-full border transition-colors"
                :class="
                  tagIsOn(tag.label)
                    ? 'font-bold text-white border-transparent'
                    : 'border-n-weak text-n-slate-11 hover:border-n-brand'
                "
                :style="tagIsOn(tag.label) ? { backgroundColor: tag.color } : {}"
                :disabled="busyTag === tag.label"
                @click="onToggleTag(tag.label)"
              >
                {{ tag.title }}
              </button>
            </div>

            <template v-if="suggested.length">
              <p :class="SEC">Sugeridas (clique para aplicar)</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="l in suggested"
                  :key="l"
                  class="px-2.5 py-0.5 text-[11px] rounded-full border border-dashed border-n-brand text-n-slate-11"
                  :disabled="busyTag === l"
                  @click="onToggleTag(l)"
                >
                  + {{ tagTitle(l) }}
                </button>
              </div>
              <p class="mt-1 text-[10.5px] leading-relaxed text-n-slate-11">
                Sugestão automática por palavras-chave. Confira antes de aplicar.
              </p>
            </template>

            <p :class="SEC">Dados do lead</p>
            <template v-if="hasLead">
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="f in leadFlags"
                  :key="f.key"
                  class="px-2 py-0.5 text-[10.5px] font-bold rounded-md border"
                  style="color: #4ade80; border-color: #1a7f37; background-color: #0e2a1a"
                >
                  {{ f.upper }}
                </span>
                <span v-if="!leadFlags.length" class="text-sm text-n-slate-11">
                  sem flags
                </span>
              </div>
              <div v-if="lead['Status Follow-up']" :class="ROW">
                <span class="text-n-slate-11">Follow-up</span>
                <span class="text-n-slate-12">{{ lead['Status Follow-up'] }}</span>
              </div>
              <div v-if="lead.Ultimo_contato" :class="ROW">
                <span class="text-n-slate-11">Último contato</span>
                <span class="text-n-slate-12">{{ fmtDate(lead.Ultimo_contato) }}</span>
              </div>
            </template>
            <p v-else class="text-sm text-n-slate-11">
              Lead não encontrado no Supabase<template v-if="!prefs.leadUrl">
                (endpoint não configurado)</template
              >.
            </p>

            <a
              :href="conversationUrl"
              target="_blank"
              rel="noopener"
              class="inline-block mt-3.5 text-xs text-n-brand hover:underline"
            >
              Abrir no Chatwoot
            </a>
          </template>
        </div>

        <!-- coluna direita -->
        <div class="flex flex-col flex-1 min-w-0">
          <div class="flex gap-1 px-3.5 pt-2.5">
            <button
              v-for="t in [
                { id: 'resumo', label: 'Resumo' },
                { id: 'historico', label: 'Histórico' },
              ]"
              :key="t.id"
              class="px-3 py-1.5 text-xs rounded-t-lg border border-b-0 border-n-weak"
              :class="tab === t.id ? 'font-semibold bg-n-alpha-2 text-n-slate-12' : 'text-n-slate-11'"
              @click="tab = t.id"
            >
              {{ t.label }}
            </button>
          </div>

          <div
            class="overflow-y-auto flex-1 px-3.5 py-3 mx-3.5 mb-3.5 rounded-b-lg rounded-tr-lg border border-n-weak bg-n-alpha-2"
          >
            <!-- resumo -->
            <template v-if="tab === 'resumo'">
              <p v-if="isSummarizing" class="text-sm text-n-slate-11">
                Gerando resumo...
              </p>
              <template v-else>
                <span
                  v-if="summaryFromAI"
                  class="inline-block px-2 py-0.5 mb-2 text-[10px] font-bold rounded-md border"
                  style="color: #4ade80; border-color: #1a7f37; background-color: #0e2a1a"
                >
                  Resumo por IA
                </span>
                <span
                  v-else
                  :class="CHIP"
                  class="inline-block mb-2 font-bold"
                >
                  Ficha montada localmente
                </span>
                <p
                  v-if="!summaryFromAI"
                  class="mb-2 text-[10.5px] leading-relaxed text-n-slate-11"
                >
                  Campos extraídos por palavra-chave da conversa. Serve para ver
                  o que ainda falta perguntar — confirme antes de usar.
                </p>
                <p class="text-sm leading-relaxed whitespace-pre-wrap text-n-slate-12">
                  {{ summaryText }}
                </p>
                <button
                  class="px-3 py-1.5 mt-3 text-xs rounded-lg border border-n-weak text-n-slate-12"
                  @click="renderSummary({ forceLocal: summaryFromAI })"
                >
                  {{
                    summaryFromAI
                      ? 'Montar ficha localmente'
                      : prefs.summaryUrl
                        ? 'Tentar resumo por IA'
                        : 'Recalcular'
                  }}
                </button>
              </template>
            </template>

            <!-- historico -->
            <template v-else>
              <p v-if="!chatMessages.length" class="text-sm text-n-slate-11">
                Sem mensagens.
              </p>
              <div
                v-for="m in chatMessages"
                :key="m.id"
                class="my-2 max-w-[85%]"
                :class="m.message_type === 1 ? 'ml-auto text-right' : 'mr-auto'"
              >
                <div class="mb-0.5 text-[10.5px] text-n-slate-11">
                  {{
                    (m.sender && m.sender.name
                      ? m.sender.name
                      : m.message_type === 1
                        ? 'Atendente'
                        : 'Cliente'
                    ).replace(/^~+/, '')
                  }}
                  - {{ fmtDate(m.created_at) }}
                </div>
                <div
                  class="inline-block px-2.5 py-1.5 text-sm text-left break-words whitespace-pre-wrap rounded-lg border text-n-slate-12"
                  :class="
                    m.message_type === 1
                      ? 'border-n-brand bg-n-alpha-2'
                      : 'border-n-weak bg-n-background'
                  "
                >
                  {{ m.content }}
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- mover de fase -->
      <div class="flex flex-wrap gap-1.5 items-center px-4 py-2.5 border-t border-n-weak">
        <p class="w-full mb-0.5 text-[11px] font-semibold tracking-wide uppercase text-n-slate-11">
          Mover para fase
        </p>
        <button
          v-for="col in columns"
          :key="col.label"
          class="px-2.5 py-1 text-xs rounded-md border border-l-[3px] border-n-weak text-n-slate-12 hover:border-n-brand disabled:opacity-50"
          :style="{ borderLeftColor: col.color }"
          :disabled="busyStage === col.label || col.label === stage.label"
          @click="onMove(col.label)"
        >
          {{ col.title }}
        </button>
      </div>
    </div>
  </div>
</template>
