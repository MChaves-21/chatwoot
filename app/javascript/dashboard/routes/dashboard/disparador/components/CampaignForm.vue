<script setup>
/**
 * Nova campanha do Disparador.
 *
 * Ordem da tela, que e a ordem em que a decisao faz sentido:
 *   1. caixa  -> define o canal (uazapi aceita texto; API oficial so template)
 *   2. publico -> etiquetas/etapa do Kanban + status, menos as etiquetas de
 *      descarte; "Buscar publico" le as conversas e mostra quantas sobram
 *   3. mensagem -> com previa ja trocada para o primeiro contato
 *   4. ritmo -> intervalo, pausas, janela e dias; estimativa de fim
 *
 * Nada e enviado daqui: a tela so grava a campanha no n8n, que calcula o
 * horario de cada envio e manda pelo cron.
 */
import { computed, ref, watch } from 'vue';
import { useMapGetter } from 'dashboard/composables/store';
import { FUNNELS, UNSTAGED_LABEL } from '../../kanban/constants';
import { callDisparador, loadAudience } from '../api';
import {
  CONVERSATION_STATUSES,
  DEFAULT_CONFIG,
  DEFAULT_EXCLUDE,
  MAX_RECIPIENTS,
  TIME_ZONE,
  VARIABLES,
  WEEKDAYS,
} from '../constants';
import {
  buildRecipients,
  estimateEnd,
  formatDateTime,
  renderTemplate,
  renderText,
  usableTemplates,
} from '../helpers';

const emit = defineEmits(['created', 'cancel']);

const inboxes = useMapGetter('inboxes/getInboxes');
const allLabels = useMapGetter('labels/getLabels');

const INPUT =
  'px-3 h-9 w-full text-sm rounded-lg border outline-none border-n-weak bg-n-solid-1 text-n-slate-12 focus:border-n-brand';
const LABEL = 'text-xs font-medium text-n-slate-11';
const SECTION = 'flex flex-col gap-3 p-4 rounded-xl border border-n-weak bg-n-solid-1';
const CHIP =
  'inline-flex gap-1 items-center px-2 h-6 text-xs rounded-full border transition-colors';
const BTN =
  'inline-flex gap-1.5 justify-center items-center px-3 h-9 text-sm font-medium rounded-lg transition-colors disabled:opacity-50';

// ------------------------------------------------------------------ 1. caixa
const nome = ref('');
const inboxId = ref(null);
const inbox = computed(
  () => (inboxes.value || []).find(i => i.id === inboxId.value) || null
);
const isOfficial = computed(
  () => inbox.value && inbox.value.channel_type === 'Channel::Whatsapp'
);
const funnel = computed(() =>
  FUNNELS.find(f => f.inboxId && f.inboxId === inboxId.value)
);
const stageChips = computed(() =>
  funnel.value
    ? funnel.value.columns.filter(c => c.label && c.label !== UNSTAGED_LABEL)
    : []
);

// ---------------------------------------------------------------- 2. publico
const status = ref('all');
const labels = ref([]);
const exclude = ref([...DEFAULT_EXCLUDE]);
const excludeInput = ref('');
const labelInput = ref('');

const labelTitles = computed(() =>
  (allLabels.value || []).map(l => l.title).sort()
);

// Recebem o ARRAY (no template o ref ja chega desembrulhado).
function toggle(list, value) {
  const i = list.indexOf(value);
  if (i >= 0) list.splice(i, 1);
  else list.push(value);
}
function addLabel() {
  const v = labelInput.value.trim();
  if (v && !labels.value.includes(v)) labels.value.push(v);
  labelInput.value = '';
}
function addExclude() {
  const v = excludeInput.value.trim();
  if (v && !exclude.value.includes(v)) exclude.value.push(v);
  excludeInput.value = '';
}
function toggleDay(id) {
  toggle(cfg.value.dias, id);
}

const audience = ref(null);
const audienceLoading = ref(false);
const audienceError = ref('');
const progress = ref({ read: 0, total: 0 });

// Mudou o filtro: o publico lido deixa de valer.
watch([inboxId, status, labels, exclude], () => {
  audience.value = null;
}, { deep: true });

async function fetchAudience() {
  audienceError.value = '';
  audience.value = null;
  if (!inboxId.value) {
    audienceError.value = 'Escolha a caixa primeiro.';
    return;
  }
  audienceLoading.value = true;
  progress.value = { read: 0, total: 0 };
  try {
    const r = await loadAudience({
      inboxId: inboxId.value,
      labels: labels.value,
      status: status.value,
      onProgress: (read, total) => {
        progress.value = { read, total };
      },
    });
    audience.value = {
      ...buildRecipients(r.conversations, { exclude: exclude.value }),
      lidas: r.conversations.length,
      truncated: r.truncated,
    };
  } catch (e) {
    audienceError.value = e.message || 'Falha ao ler as conversas.';
  } finally {
    audienceLoading.value = false;
  }
}

const recipients = computed(() =>
  audience.value ? audience.value.recipients : []
);
const sampleName = computed(() =>
  recipients.value.length ? recipients.value[0].nome : 'Maria da Silva'
);

// --------------------------------------------------------------- 3. mensagem
const texto = ref('');
const templateKey = ref('');
const templateParams = ref({});

const templates = computed(() =>
  isOfficial.value ? usableTemplates(inbox.value.message_templates) : []
);
const template = computed(
  () => templates.value.find(t => t.key === templateKey.value) || null
);
watch(template, t => {
  const p = {};
  (t ? t.params : []).forEach((n, i) => {
    p[n] = i === 0 ? '{{primeiro_nome}}' : '';
  });
  templateParams.value = p;
});
watch(inboxId, () => {
  templateKey.value = '';
});

/** Rotulo "{{1}}" montado no script: no template as chaves fechariam o bloco. */
const paramLabel = n => `{{${n}}}`;

const textArea = ref(null);
function insertVar(token) {
  const el = textArea.value;
  if (!el) {
    texto.value += token;
    return;
  }
  const { selectionStart: a, selectionEnd: b } = el;
  texto.value = texto.value.slice(0, a) + token + texto.value.slice(b);
}

const preview = computed(() => {
  if (isOfficial.value) {
    return template.value
      ? renderTemplate(
          template.value.body_text,
          templateParams.value,
          sampleName.value
        )
      : '';
  }
  return renderText(texto.value, sampleName.value);
});

// ------------------------------------------------------------------ 4. ritmo
const cfg = ref({ ...DEFAULT_CONFIG, dias: [...DEFAULT_CONFIG.dias] });
const startMode = ref('now');
const startAt = ref('');

const startMs = computed(() => {
  if (startMode.value !== 'later' || !startAt.value) return Date.now();
  // datetime-local nao tem fuso: o valor e horario de Fortaleza (UTC-3).
  return Date.parse(`${startAt.value}:00-03:00`);
});
const estimate = computed(() =>
  estimateEnd(recipients.value.length, cfg.value, startMs.value)
);
const perHour = computed(() => {
  const media = (cfg.value.intervalo_min + cfg.value.intervalo_max) / 2;
  return media > 0 ? Math.round(3600 / media) : 0;
});

// ---------------------------------------------------------------- validacao
const problems = computed(() => {
  const p = [];
  if (!nome.value.trim()) p.push('Dê um nome à campanha.');
  if (!inboxId.value) p.push('Escolha a caixa.');
  if (!audience.value) p.push('Busque o público.');
  else if (!recipients.value.length) p.push('O público ficou vazio.');
  else if (recipients.value.length > MAX_RECIPIENTS)
    p.push(`Máximo de ${MAX_RECIPIENTS} contatos por campanha.`);
  if (isOfficial.value) {
    if (!template.value) p.push('Escolha um template aprovado.');
    else if (template.value.params.some(n => !templateParams.value[n]))
      p.push('Preencha todas as variáveis do template.');
  } else if (!texto.value.trim()) p.push('Escreva a mensagem.');
  const c = cfg.value;
  if (!(c.intervalo_min >= 5)) p.push('Intervalo mínimo de 5 segundos.');
  if (!(c.intervalo_max >= c.intervalo_min))
    p.push('O intervalo máximo não pode ser menor que o mínimo.');
  if (!(c.janela_inicio < c.janela_fim)) p.push('Janela de horário inválida.');
  if (!c.dias.length) p.push('Marque ao menos um dia da semana.');
  if (startMode.value === 'later' && Number.isNaN(startMs.value))
    p.push('Data de início inválida.');
  return p;
});

const risky = computed(
  () => !isOfficial.value && inboxId.value && cfg.value.intervalo_min < 20
);

const saving = ref(false);
const saveError = ref('');

async function create() {
  if (problems.value.length || saving.value) return;
  const n = recipients.value.length;
  // eslint-disable-next-line no-alert
  const ok = window.confirm(
    `Criar a campanha "${nome.value.trim()}" para ${n} contato(s) da caixa ${inbox.value.name}?\n\nO primeiro envio sai em ${formatDateTime(estimate.value && estimate.value.first, TIME_ZONE)}.`
  );
  if (!ok) return;
  saving.value = true;
  saveError.value = '';
  try {
    const t = template.value;
    const res = await callDisparador('criar', {
      campanha: {
        nome: nome.value.trim(),
        inbox_id: inboxId.value,
        inbox_nome: inbox.value.name,
        tipo_mensagem: isOfficial.value ? 'template' : 'texto',
        conteudo: isOfficial.value ? '' : texto.value,
        template: t
          ? {
              name: t.name,
              language: t.language,
              category: t.category,
              namespace: t.namespace,
              body_text: t.body_text,
              params: { ...templateParams.value },
            }
          : null,
        config: { ...cfg.value },
        inicio_em:
          startMode.value === 'later'
            ? new Date(startMs.value).toISOString()
            : null,
        filtro: {
          status: status.value,
          etiquetas: [...labels.value],
          excluir: [...exclude.value],
        },
      },
      destinatarios: recipients.value,
    });
    emit('created', res.campanha_id);
  } catch (e) {
    saveError.value = e.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 max-w-3xl">
    <!-- 1. Caixa -->
    <section :class="SECTION">
      <h2 class="text-sm font-semibold text-n-slate-12">1. Campanha</h2>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label class="flex flex-col gap-1">
          <span :class="LABEL">Nome</span>
          <input
            v-model="nome"
            :class="INPUT"
            maxlength="120"
            placeholder="Ex.: Retomada leads BPC outubro"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span :class="LABEL">Caixa de entrada</span>
          <select v-model="inboxId" :class="INPUT">
            <option :value="null" disabled>Escolha…</option>
            <option v-for="i in inboxes" :key="i.id" :value="i.id">
              {{ i.name }}
              {{ i.channel_type === 'Channel::Whatsapp' ? '· API oficial' : '' }}
            </option>
          </select>
        </label>
      </div>
      <p v-if="isOfficial" class="text-xs text-n-slate-11">
        Caixa da API oficial do WhatsApp: a Meta só entrega mensagem iniciada
        pelo escritório se for um <strong>template aprovado</strong>.
      </p>
    </section>

    <!-- 2. Publico -->
    <section :class="SECTION">
      <h2 class="text-sm font-semibold text-n-slate-12">2. Público</h2>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr]">
        <label class="flex flex-col gap-1">
          <span :class="LABEL">Status da conversa</span>
          <select v-model="status" :class="INPUT">
            <option v-for="s in CONVERSATION_STATUSES" :key="s.id" :value="s.id">
              {{ s.label }}
            </option>
          </select>
        </label>
        <div class="flex flex-col gap-1">
          <span :class="LABEL">
            Etiquetas (qualquer uma) — vazio = toda a caixa
          </span>
          <div class="flex gap-2">
            <input
              v-model="labelInput"
              :class="INPUT"
              list="disparador-labels"
              placeholder="Digite e tecle Enter"
              @keydown.enter.prevent="addLabel"
            />
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="l in labels"
              :key="l"
              :class="CHIP"
              class="border-n-brand bg-n-brand/10 text-n-slate-12"
              title="Remover"
              @click="toggle(labels, l)"
            >
              {{ l }} <span class="i-lucide-x size-3" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="stageChips.length" class="flex flex-col gap-1">
        <span :class="LABEL">Etapas do Kanban ({{ funnel.title }})</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in stageChips"
            :key="c.label"
            :class="[
              CHIP,
              labels.includes(c.label)
                ? 'border-n-brand bg-n-brand/10 text-n-slate-12'
                : 'border-n-weak text-n-slate-11 hover:bg-n-alpha-1',
            ]"
            @click="toggle(labels, c.label)"
          >
            <span class="rounded-full size-2" :style="{ background: c.color }" />
            {{ c.title }}
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <span :class="LABEL">Não enviar para quem tiver a etiqueta</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="l in exclude"
            :key="l"
            :class="CHIP"
            class="border-n-ruby-8 bg-n-ruby-3 text-n-ruby-11"
            title="Remover da exclusão"
            @click="toggle(exclude, l)"
          >
            {{ l }} <span class="i-lucide-x size-3" />
          </button>
          <input
            v-model="excludeInput"
            class="px-2 h-6 text-xs bg-transparent rounded-full border outline-none w-44 border-n-weak text-n-slate-12"
            list="disparador-labels"
            placeholder="+ etiqueta"
            @keydown.enter.prevent="addExclude"
          />
        </div>
      </div>

      <datalist id="disparador-labels">
        <option v-for="t in labelTitles" :key="t" :value="t" />
      </datalist>

      <div class="flex flex-wrap gap-3 items-center">
        <button
          :class="BTN"
          class="border border-n-weak text-n-slate-12 hover:bg-n-alpha-1"
          :disabled="audienceLoading || !inboxId"
          @click="fetchAudience"
        >
          <span
            class="i-lucide-users size-4"
            :class="audienceLoading ? 'animate-pulse' : ''"
          />
          {{ audienceLoading ? 'Lendo conversas…' : 'Buscar público' }}
        </button>
        <span v-if="audienceLoading" class="text-xs text-n-slate-11">
          {{ progress.read }} de {{ progress.total || '…' }}
        </span>
        <span v-if="audienceError" class="text-xs text-n-ruby-11">
          {{ audienceError }}
        </span>
      </div>

      <div
        v-if="audience"
        class="flex flex-col gap-2 p-3 text-sm rounded-lg bg-n-alpha-1"
      >
        <p class="text-n-slate-12">
          <strong>{{ recipients.length }}</strong> contato(s) vão receber.
          <span class="text-n-slate-11">
            Lidas {{ audience.lidas }} conversas · {{ audience.excluidas }}
            barradas por etiqueta · {{ audience.duplicadas }} do mesmo contato
            <template v-if="audience.semContato">
              · {{ audience.semContato }} sem contato
            </template>
          </span>
        </p>
        <p v-if="audience.truncated" class="text-xs text-n-amber-11">
          A caixa tem mais conversas do que a tela lê de uma vez. Use
          etiquetas para dividir em campanhas menores.
        </p>
        <p
          v-if="recipients.length > MAX_RECIPIENTS"
          class="text-xs text-n-ruby-11"
        >
          Passa do limite de {{ MAX_RECIPIENTS }} por campanha.
        </p>
        <p v-if="recipients.length" class="text-xs text-n-slate-11">
          {{
            recipients
              .slice(0, 8)
              .map(r => r.nome || r.telefone)
              .join(', ')
          }}<template v-if="recipients.length > 8">…</template>
        </p>
      </div>
    </section>

    <!-- 3. Mensagem -->
    <section :class="SECTION">
      <h2 class="text-sm font-semibold text-n-slate-12">3. Mensagem</h2>

      <template v-if="isOfficial">
        <p v-if="!templates.length" class="text-sm text-n-amber-11">
          Esta caixa não tem template aprovado sincronizado. Sincronize os
          templates nas configurações da caixa (Configurações → Caixas de
          entrada → a caixa → Templates) e recarregue esta tela.
        </p>
        <template v-else>
          <label class="flex flex-col gap-1">
            <span :class="LABEL">Template aprovado</span>
            <select v-model="templateKey" :class="INPUT">
              <option value="" disabled>Escolha…</option>
              <option v-for="t in templates" :key="t.key" :value="t.key">
                {{ t.name }} ({{ t.language }})
              </option>
            </select>
          </label>
          <div
            v-if="template && template.params.length"
            class="grid grid-cols-1 gap-2 md:grid-cols-2"
          >
            <label
              v-for="n in template.params"
              :key="n"
              class="flex flex-col gap-1"
            >
              <span :class="LABEL">Variável {{ paramLabel(n) }}</span>
              <input v-model="templateParams[n]" :class="INPUT" />
            </label>
          </div>
        </template>
      </template>

      <template v-else>
        <textarea
          ref="textArea"
          v-model="texto"
          rows="5"
          class="p-3 w-full text-sm rounded-lg border outline-none resize-y border-n-weak bg-n-solid-1 text-n-slate-12 focus:border-n-brand"
          placeholder="Olá {{primeiro_nome}}, tudo bem? …"
        />
      </template>

      <div class="flex flex-wrap gap-1.5 items-center">
        <span :class="LABEL">Inserir:</span>
        <button
          v-for="v in VARIABLES"
          :key="v.token"
          :class="CHIP"
          class="border-n-weak text-n-slate-11 hover:bg-n-alpha-1"
          :disabled="isOfficial"
          :title="isOfficial ? 'No template, use as variáveis acima' : v.token"
          @click="insertVar(v.token)"
        >
          {{ v.label }}
        </button>
      </div>

      <div v-if="preview" class="flex flex-col gap-1">
        <span :class="LABEL">Prévia para {{ sampleName }}</span>
        <div
          class="p-3 text-sm whitespace-pre-wrap rounded-lg bg-n-teal-2 text-n-slate-12"
        >
          {{ preview }}
        </div>
      </div>
    </section>

    <!-- 4. Ritmo -->
    <section :class="SECTION">
      <h2 class="text-sm font-semibold text-n-slate-12">4. Ritmo de envio</h2>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label class="flex flex-col gap-1">
          <span :class="LABEL">Intervalo mín. (s)</span>
          <input
            v-model.number="cfg.intervalo_min"
            type="number"
            min="5"
            :class="INPUT"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span :class="LABEL">Intervalo máx. (s)</span>
          <input
            v-model.number="cfg.intervalo_max"
            type="number"
            min="5"
            :class="INPUT"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span :class="LABEL">Pausa a cada (envios)</span>
          <input
            v-model.number="cfg.pausa_a_cada"
            type="number"
            min="0"
            :class="INPUT"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span :class="LABEL">Duração da pausa (min)</span>
          <input
            v-model.number="cfg.pausa_minutos"
            type="number"
            min="0"
            :class="INPUT"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span :class="LABEL">Das</span>
          <input v-model="cfg.janela_inicio" type="time" :class="INPUT" />
        </label>
        <label class="flex flex-col gap-1">
          <span :class="LABEL">Até</span>
          <input v-model="cfg.janela_fim" type="time" :class="INPUT" />
        </label>
        <div class="flex flex-col col-span-2 gap-1">
          <span :class="LABEL">Dias</span>
          <div class="flex flex-wrap gap-1.5 items-center h-9">
            <button
              v-for="d in WEEKDAYS"
              :key="d.id"
              :class="[
                CHIP,
                cfg.dias.includes(d.id)
                  ? 'border-n-brand bg-n-brand/10 text-n-slate-12'
                  : 'border-n-weak text-n-slate-10',
              ]"
              @click="toggleDay(d.id)"
            >
              {{ d.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap gap-4 items-center text-sm">
        <label class="flex gap-2 items-center text-n-slate-12">
          <input v-model="startMode" type="radio" value="now" />
          Começar agora (dentro da janela)
        </label>
        <label class="flex gap-2 items-center text-n-slate-12">
          <input v-model="startMode" type="radio" value="later" />
          Agendar para
        </label>
        <input
          v-if="startMode === 'later'"
          v-model="startAt"
          type="datetime-local"
          class="px-3 h-9 text-sm rounded-lg border outline-none border-n-weak bg-n-solid-1 text-n-slate-12"
        />
      </div>

      <p class="text-xs text-n-slate-11">
        Cerca de {{ perHour }} mensagens por hora dentro da janela.
        <template v-if="estimate">
          Primeiro envio {{ formatDateTime(estimate.first, TIME_ZONE) }} ·
          último por volta de {{ formatDateTime(estimate.last, TIME_ZONE) }}
          (horário de Fortaleza).
        </template>
      </p>
      <p v-if="risky" class="text-xs text-n-amber-11">
        Intervalo abaixo de 20 s num número da uazapi aumenta muito o risco de
        bloqueio pelo WhatsApp.
      </p>
    </section>

    <!-- Rodape -->
    <div class="flex flex-wrap gap-3 justify-between items-center pb-6">
      <ul
        v-if="problems.length"
        class="text-xs list-disc list-inside text-n-slate-11"
      >
        <li v-for="p in problems" :key="p">{{ p }}</li>
      </ul>
      <span v-else class="text-xs text-n-teal-11">Pronto para criar.</span>
      <div class="flex gap-2">
        <button
          :class="BTN"
          class="text-n-slate-11 hover:bg-n-alpha-1"
          @click="emit('cancel')"
        >
          Voltar
        </button>
        <button
          :class="BTN"
          class="text-white bg-n-brand hover:opacity-90"
          :disabled="!!problems.length || saving"
          @click="create"
        >
          <span class="i-lucide-send size-4" />
          {{
            saving
              ? 'Criando…'
              : `Criar campanha${recipients.length ? ` (${recipients.length})` : ''}`
          }}
        </button>
      </div>
    </div>
    <p v-if="saveError" class="-mt-4 text-sm text-n-ruby-11">
      {{ saveError }}
    </p>
  </div>
</template>
