<script setup>
/**
 * Nova campanha do Disparador — passo a passo (14/10/2026).
 *
 * Feito para quem nunca mexeu com disparo: uma pergunta por tela, palavras do
 * dia a dia, e o tecnico (segundos, etiquetas de descarte) escondido atras de
 * "Personalizar" / "ver detalhes".
 *
 *   1. Caixa     por qual WhatsApp sai (define texto livre x mensagem aprovada)
 *   2. Publico   todo mundo da caixa, por etapa do Kanban ou por etiqueta;
 *                a contagem atualiza sozinha e ja tira os descartados
 *   3. Mensagem  com previa no balao, ja trocada para o primeiro contato
 *   4. Quando    ritmo e horario prontos, com estimativa de inicio e fim
 *   5. Revisar   resumo em frases e o botao de criar
 *
 * Nada e enviado daqui: a tela grava a campanha no n8n, que calcula o horario
 * de cada envio e manda pelo cron.
 */
import { computed, ref, watch } from 'vue';
import { useMapGetter } from 'dashboard/composables/store';
import { FUNNELS, UNSTAGED_LABEL } from '../../kanban/constants';
import { callDisparador, loadAudience } from '../api';
import {
  DEFAULT_EXCLUDE,
  MAX_RECIPIENTS,
  PACES,
  TIME_ZONE,
  VARIABLES,
  WEEKDAYS,
  WINDOWS,
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
  'px-3 h-10 w-full text-sm rounded-lg border outline-none border-n-weak bg-n-solid-1 text-n-slate-12 focus:border-n-brand';
const CARD = 'flex flex-col gap-4 p-5 rounded-xl border border-n-weak bg-n-solid-1';
const OPTION =
  'flex gap-3 items-start p-3 text-left rounded-lg border transition-colors cursor-pointer';
const OPTION_ON = 'border-n-brand bg-n-brand/10';
const OPTION_OFF = 'border-n-weak hover:bg-n-alpha-1';
const CHIP =
  'inline-flex gap-1.5 items-center px-3 h-8 text-xs rounded-full border transition-colors';
const BTN =
  'inline-flex gap-2 justify-center items-center px-4 h-10 text-sm font-medium rounded-lg transition-colors disabled:opacity-50';
const HINT = 'text-xs text-n-slate-11';

const STEPS = ['WhatsApp', 'Quem recebe', 'Mensagem', 'Quando', 'Revisar'];
const step = ref(0);

// --------------------------------------------------------------- 1. caixa
const inboxId = ref(null);
const inbox = computed(
  () => (inboxes.value || []).find(i => i.id === inboxId.value) || null
);
const isOfficial = computed(
  () => !!inbox.value && inbox.value.channel_type === 'Channel::Whatsapp'
);
const funnel = computed(() =>
  FUNNELS.find(f => f.inboxId && f.inboxId === inboxId.value)
);
const stageChips = computed(() =>
  funnel.value
    ? funnel.value.columns.filter(c => c.label && c.label !== UNSTAGED_LABEL)
    : []
);
function chooseInbox(id) {
  if (inboxId.value === id) return;
  inboxId.value = id;
  audienceMode.value = 'todos';
  labels.value = [];
}

// --------------------------------------------------------------- 2. publico
const audienceMode = ref('todos'); // todos | etapas | etiquetas
const onlyOpen = ref(false);
const labels = ref([]);
const labelInput = ref('');
const exclude = ref([...DEFAULT_EXCLUDE]);
const excludeInput = ref('');
const showExclude = ref(false);

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
function setMode(m) {
  audienceMode.value = m;
  labels.value = [];
}

const filterLabels = computed(() =>
  audienceMode.value === 'todos' ? [] : labels.value
);

const audience = ref(null);
const audienceLoading = ref(false);
const audienceError = ref('');
const progress = ref({ read: 0, total: 0 });
let audienceRun = 0;
let audienceTimer = null;

async function fetchAudience() {
  const run = (audienceRun += 1);
  audienceError.value = '';
  if (!inboxId.value) return;
  if (audienceMode.value !== 'todos' && !labels.value.length) {
    audience.value = null;
    return;
  }
  audienceLoading.value = true;
  progress.value = { read: 0, total: 0 };
  try {
    const r = await loadAudience({
      inboxId: inboxId.value,
      labels: filterLabels.value,
      status: onlyOpen.value ? 'open' : 'all',
      onProgress: (read, total) => {
        if (run === audienceRun) progress.value = { read, total };
      },
    });
    if (run !== audienceRun) return;
    audience.value = {
      ...buildRecipients(r.conversations, { exclude: exclude.value }),
      lidas: r.conversations.length,
      truncated: r.truncated,
    };
  } catch (e) {
    if (run === audienceRun)
      audienceError.value = 'Não consegui contar agora. Tente de novo.';
  } finally {
    if (run === audienceRun) audienceLoading.value = false;
  }
}

// Conta sozinho: qualquer mudanca no filtro refaz a contagem.
watch(
  [inboxId, audienceMode, onlyOpen, labels, exclude],
  () => {
    audience.value = null;
    clearTimeout(audienceTimer);
    audienceTimer = setTimeout(fetchAudience, 500);
  },
  { deep: true }
);

const recipients = computed(() =>
  audience.value ? audience.value.recipients : []
);
const sampleName = computed(() =>
  recipients.value.length && recipients.value[0].nome
    ? recipients.value[0].nome
    : 'Maria da Silva'
);

// -------------------------------------------------------------- 3. mensagem
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
  el.focus();
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

// ----------------------------------------------------------------- 4. quando
const paceId = ref(PACES[0].id);
const windowId = ref(WINDOWS[0].id);
const custom = ref(false);
const cfg = ref({
  ...PACES[0].config,
  ...WINDOWS[0].config,
  dias: [...WINDOWS[0].config.dias],
});
function choosePace(p) {
  paceId.value = p.id;
  Object.assign(cfg.value, p.config);
}
function chooseWindow(w) {
  windowId.value = w.id;
  Object.assign(cfg.value, w.config, { dias: [...w.config.dias] });
}
function toggleDay(id) {
  toggle(cfg.value.dias, id);
}

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
const risky = computed(() => !isOfficial.value && cfg.value.intervalo_min < 20);

// ---------------------------------------------------------------- 5. revisar
const nome = ref('');
watch([inbox, step], () => {
  if (step.value === 4 && !nome.value.trim() && inbox.value) {
    const hoje = new Date().toLocaleDateString('pt-BR', {
      timeZone: TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
    });
    nome.value = `${inbox.value.name} — ${hoje}`;
  }
});

const audienceSummary = computed(() => {
  if (audienceMode.value === 'todos') return 'todos os contatos da caixa';
  const nomes = labels.value.map(l => {
    const c = stageChips.value.find(s => s.label === l);
    return c ? c.title : l;
  });
  return `${audienceMode.value === 'etapas' ? 'quem está em' : 'quem tem a etiqueta'} ${nomes.join(', ')}`;
});

// ---------------------------------------------------------------- validacao
const stepProblem = computed(() => {
  const c = cfg.value;
  switch (step.value) {
    case 0:
      return inboxId.value ? '' : 'Escolha por qual WhatsApp a mensagem sai.';
    case 1:
      if (audienceMode.value !== 'todos' && !labels.value.length)
        return audienceMode.value === 'etapas'
          ? 'Marque pelo menos uma etapa.'
          : 'Adicione pelo menos uma etiqueta.';
      if (audienceLoading.value || !audience.value)
        return 'Contando quem vai receber…';
      if (!recipients.value.length) return 'Ninguém vai receber com esse filtro.';
      if (recipients.value.length > MAX_RECIPIENTS)
        return `São mais de ${MAX_RECIPIENTS} pessoas. Divida em campanhas menores (por etapa).`;
      return '';
    case 2:
      if (isOfficial.value) {
        if (!templates.value.length)
          return 'Esta caixa não tem mensagem aprovada cadastrada.';
        if (!template.value) return 'Escolha a mensagem aprovada.';
        if (template.value.params.some(n => !templateParams.value[n]))
          return 'Preencha os campos da mensagem aprovada.';
        return '';
      }
      return texto.value.trim() ? '' : 'Escreva a mensagem.';
    case 3:
      if (!(c.intervalo_min >= 5))
        return 'O intervalo mínimo é de 5 segundos.';
      if (!(c.intervalo_max >= c.intervalo_min))
        return 'O intervalo máximo não pode ser menor que o mínimo.';
      if (!(c.janela_inicio < c.janela_fim)) return 'Horário inválido.';
      if (!c.dias.length) return 'Marque pelo menos um dia da semana.';
      if (startMode.value === 'later' && Number.isNaN(startMs.value))
        return 'Escolha o dia e a hora de início.';
      return '';
    default:
      return nome.value.trim() ? '' : 'Dê um nome para achar depois.';
  }
});

function next() {
  if (!stepProblem.value && step.value < STEPS.length - 1) step.value += 1;
}
function back() {
  if (step.value > 0) step.value -= 1;
  else emit('cancel');
}
function goTo(i) {
  if (i < step.value) step.value = i;
}

// ------------------------------------------------------------------- criar
const saving = ref(false);
const saveError = ref('');

async function create() {
  if (stepProblem.value || saving.value) return;
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
          status: onlyOpen.value ? 'open' : 'all',
          etiquetas: [...filterLabels.value],
          excluir: [...exclude.value],
        },
      },
      destinatarios: recipients.value,
    });
    emit('created', res.campanha_id);
  } catch (e) {
    saveError.value = `Não foi criada: ${e.message}`;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 max-w-3xl">
    <!-- Passos -->
    <ol class="flex flex-wrap gap-2 items-center text-xs">
      <li
        v-for="(s, i) in STEPS"
        :key="s"
        class="flex gap-2 items-center"
      >
        <button
          class="flex gap-1.5 items-center px-2.5 h-7 rounded-full border"
          :class="[
            i === step
              ? 'border-n-brand bg-n-brand text-white'
              : i < step
                ? 'border-n-brand text-n-slate-12 hover:bg-n-alpha-1'
                : 'border-n-weak text-n-slate-10 cursor-default',
          ]"
          @click="goTo(i)"
        >
          <span v-if="i < step" class="i-lucide-check size-3" />
          <span v-else>{{ i + 1 }}</span>
          {{ s }}
        </button>
        <span v-if="i < STEPS.length - 1" class="w-3 h-px bg-n-weak" />
      </li>
    </ol>

    <!-- 1. Caixa -->
    <section v-if="step === 0" :class="CARD">
      <div>
        <h2 class="text-lg font-semibold text-n-slate-12">
          Por qual WhatsApp a mensagem vai sair?
        </h2>
        <p :class="HINT">
          Os contatos que vão receber são os que já conversaram por este número.
        </p>
      </div>
      <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
        <button
          v-for="i in inboxes"
          :key="i.id"
          :class="[OPTION, inboxId === i.id ? OPTION_ON : OPTION_OFF]"
          @click="chooseInbox(i.id)"
        >
          <span
            class="mt-0.5 size-5"
            :class="
              i.channel_type === 'Channel::Whatsapp'
                ? 'i-lucide-badge-check text-n-teal-11'
                : 'i-lucide-message-circle text-n-slate-11'
            "
          />
          <span class="flex flex-col">
            <span class="text-sm font-medium text-n-slate-12">{{
              i.name
            }}</span>
            <span :class="HINT">
              {{
                i.channel_type === 'Channel::Whatsapp'
                  ? 'WhatsApp oficial — só mensagens aprovadas pela Meta'
                  : 'WhatsApp — pode escrever o texto que quiser'
              }}
            </span>
          </span>
        </button>
      </div>
    </section>

    <!-- 2. Publico -->
    <section v-if="step === 1" :class="CARD">
      <div>
        <h2 class="text-lg font-semibold text-n-slate-12">
          Quem vai receber?
        </h2>
        <p :class="HINT">Pessoas que já conversaram por {{ inbox.name }}.</p>
      </div>

      <div class="flex flex-col gap-2">
        <button
          :class="[OPTION, audienceMode === 'todos' ? OPTION_ON : OPTION_OFF]"
          @click="setMode('todos')"
        >
          <span class="mt-0.5 i-lucide-users size-5 text-n-slate-11" />
          <span class="flex flex-col">
            <span class="text-sm font-medium text-n-slate-12">
              Todo mundo desta caixa
            </span>
          </span>
        </button>
        <button
          v-if="stageChips.length"
          :class="[OPTION, audienceMode === 'etapas' ? OPTION_ON : OPTION_OFF]"
          @click="setMode('etapas')"
        >
          <span class="mt-0.5 i-lucide-columns-3 size-5 text-n-slate-11" />
          <span class="flex flex-col">
            <span class="text-sm font-medium text-n-slate-12">
              Só quem está em algumas etapas do Kanban
            </span>
            <span :class="HINT">Ex.: só quem está aguardando assinatura</span>
          </span>
        </button>
        <button
          :class="[
            OPTION,
            audienceMode === 'etiquetas' ? OPTION_ON : OPTION_OFF,
          ]"
          @click="setMode('etiquetas')"
        >
          <span class="mt-0.5 i-lucide-tag size-5 text-n-slate-11" />
          <span class="flex flex-col">
            <span class="text-sm font-medium text-n-slate-12">
              Só quem tem certas etiquetas
            </span>
          </span>
        </button>
      </div>

      <div v-if="audienceMode === 'etapas'" class="flex flex-wrap gap-2">
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

      <div v-if="audienceMode === 'etiquetas'" class="flex flex-col gap-2">
        <input
          v-model="labelInput"
          :class="INPUT"
          list="disparador-labels"
          placeholder="Digite a etiqueta e aperte Enter"
          @keydown.enter.prevent="addLabel"
        />
        <div class="flex flex-wrap gap-2">
          <button
            v-for="l in labels"
            :key="l"
            :class="CHIP"
            class="border-n-brand bg-n-brand/10 text-n-slate-12"
            title="Tirar"
            @click="toggle(labels, l)"
          >
            {{ l }} <span class="i-lucide-x size-3" />
          </button>
        </div>
      </div>

      <label class="flex gap-2 items-center text-sm text-n-slate-12">
        <input v-model="onlyOpen" type="checkbox" />
        Só conversas em aberto (deixa de fora as já resolvidas)
      </label>

      <!-- Contagem -->
      <div class="flex flex-col gap-2 p-4 rounded-lg bg-n-alpha-1">
        <p v-if="audienceLoading" class="text-sm text-n-slate-11">
          <span class="i-lucide-loader-circle size-4 animate-spin" />
          Contando… {{ progress.read }} de {{ progress.total || '…' }}
        </p>
        <p v-else-if="audienceError" class="text-sm text-n-ruby-11">
          {{ audienceError }}
        </p>
        <template v-else-if="audience">
          <p class="text-base text-n-slate-12">
            <strong class="text-2xl">{{ recipients.length }}</strong>
            {{ recipients.length === 1 ? 'pessoa vai' : 'pessoas vão' }}
            receber.
          </p>
          <p v-if="recipients.length" :class="HINT">
            {{
              recipients
                .slice(0, 6)
                .map(r => r.nome || r.telefone)
                .join(', ')
            }}<template v-if="recipients.length > 6">
              e mais {{ recipients.length - 6 }}</template
            >
          </p>
          <p v-if="audience.truncated" class="text-xs text-n-amber-11">
            A caixa é grande demais para uma campanha só. Escolha etapas para
            dividir.
          </p>
        </template>
      </div>

      <div class="flex flex-col gap-2">
        <p :class="HINT">
          <span class="i-lucide-shield-check size-3.5 text-n-teal-11" />
          Quem foi descartado (desqualificado, cancelado, sem direito…) fica de
          fora automaticamente<template v-if="audience && audience.excluidas">
            — {{ audience.excluidas }} nesta lista</template
          >.
          <button
            class="underline text-n-slate-12"
            @click="showExclude = !showExclude"
          >
            {{ showExclude ? 'esconder' : 'ver detalhes' }}
          </button>
        </p>
        <div v-if="showExclude" class="flex flex-wrap gap-1.5">
          <button
            v-for="l in exclude"
            :key="l"
            :class="CHIP"
            class="border-n-ruby-8 bg-n-ruby-3 text-n-ruby-11"
            title="Deixar de excluir"
            @click="toggle(exclude, l)"
          >
            {{ l }} <span class="i-lucide-x size-3" />
          </button>
          <input
            v-model="excludeInput"
            class="px-3 h-8 text-xs bg-transparent rounded-full border outline-none w-44 border-n-weak text-n-slate-12"
            list="disparador-labels"
            placeholder="+ etiqueta"
            @keydown.enter.prevent="addExclude"
          />
        </div>
      </div>

      <datalist id="disparador-labels">
        <option v-for="t in labelTitles" :key="t" :value="t" />
      </datalist>
    </section>

    <!-- 3. Mensagem -->
    <section v-if="step === 2" :class="CARD">
      <h2 class="text-lg font-semibold text-n-slate-12">
        O que vai escrever?
      </h2>

      <template v-if="isOfficial">
        <p :class="HINT">
          Pelo WhatsApp oficial, mensagem enviada pelo escritório precisa ser
          uma <strong>mensagem aprovada pela Meta</strong> (template).
        </p>
        <p
          v-if="!templates.length"
          class="p-3 text-sm rounded-lg bg-n-amber-3 text-n-amber-11"
        >
          Esta caixa ainda não tem mensagem aprovada cadastrada no Chatwoot.
          Peça para o administrador sincronizar os templates da caixa
          (Configurações → Caixas de entrada → {{ inbox.name }}).
        </p>
        <template v-else>
          <select v-model="templateKey" :class="INPUT">
            <option value="" disabled>Escolha a mensagem aprovada…</option>
            <option v-for="t in templates" :key="t.key" :value="t.key">
              {{ t.name }}
            </option>
          </select>
          <label
            v-for="n in template ? template.params : []"
            :key="n"
            class="flex flex-col gap-1"
          >
            <span class="text-xs font-medium text-n-slate-11">
              O que entra no lugar de {{ paramLabel(n) }}
            </span>
            <input v-model="templateParams[n]" :class="INPUT" />
          </label>
        </template>
      </template>

      <template v-else>
        <textarea
          ref="textArea"
          v-model="texto"
          rows="6"
          class="p-3 w-full text-base rounded-lg border outline-none resize-y border-n-weak bg-n-solid-1 text-n-slate-12 focus:border-n-brand"
          placeholder="Olá, tudo bem? …"
        />
        <div class="flex flex-wrap gap-2 items-center">
          <span :class="HINT">Colocar na mensagem:</span>
          <button
            v-for="v in VARIABLES"
            :key="v.token"
            class="px-3 h-8 text-xs rounded-full border border-n-weak text-n-slate-12 hover:bg-n-alpha-1"
            @click="insertVar(v.token)"
          >
            + {{ v.label }} da pessoa
          </button>
        </div>
      </template>

      <div v-if="preview" class="flex flex-col gap-1">
        <span :class="HINT">Como {{ sampleName }} vai ver:</span>
        <div
          class="self-end p-3 max-w-md text-sm whitespace-pre-wrap rounded-xl rounded-br-sm bg-n-teal-3 text-n-slate-12"
        >
          {{ preview }}
        </div>
      </div>
    </section>

    <!-- 4. Quando -->
    <section v-if="step === 3" :class="CARD">
      <h2 class="text-lg font-semibold text-n-slate-12">
        Quando e em que ritmo?
      </h2>

      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium text-n-slate-12">Começar</span>
        <div class="flex flex-wrap gap-4 items-center text-sm text-n-slate-12">
          <label class="flex gap-2 items-center">
            <input v-model="startMode" type="radio" value="now" /> Agora
          </label>
          <label class="flex gap-2 items-center">
            <input v-model="startMode" type="radio" value="later" /> Em outro
            dia/hora
          </label>
          <input
            v-if="startMode === 'later'"
            v-model="startAt"
            type="datetime-local"
            class="px-3 h-9 text-sm rounded-lg border outline-none border-n-weak bg-n-solid-1 text-n-slate-12"
          />
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium text-n-slate-12">Velocidade</span>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
          <button
            v-for="p in PACES"
            :key="p.id"
            :class="[OPTION, !custom && paceId === p.id ? OPTION_ON : OPTION_OFF]"
            @click="
              custom = false;
              choosePace(p);
            "
          >
            <span class="flex flex-col">
              <span class="text-sm font-medium text-n-slate-12">
                {{ p.titulo }}
              </span>
              <span :class="HINT">{{ p.descricao }}</span>
            </span>
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-sm font-medium text-n-slate-12">Horário</span>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <button
            v-for="w in WINDOWS"
            :key="w.id"
            :class="[
              OPTION,
              !custom && windowId === w.id ? OPTION_ON : OPTION_OFF,
            ]"
            @click="
              custom = false;
              chooseWindow(w);
            "
          >
            <span class="flex flex-col">
              <span class="text-sm font-medium text-n-slate-12">
                {{ w.titulo }}
              </span>
              <span :class="HINT">{{ w.descricao }}</span>
            </span>
          </button>
        </div>
      </div>

      <button
        class="self-start text-xs underline text-n-slate-11"
        @click="custom = !custom"
      >
        {{ custom ? 'Esconder ajustes' : 'Personalizar (segundos, pausas e dias)' }}
      </button>

      <div v-if="custom" class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label class="flex flex-col gap-1">
          <span :class="HINT">Esperar no mínimo (seg.)</span>
          <input v-model.number="cfg.intervalo_min" type="number" min="5" :class="INPUT" />
        </label>
        <label class="flex flex-col gap-1">
          <span :class="HINT">Esperar no máximo (seg.)</span>
          <input v-model.number="cfg.intervalo_max" type="number" min="5" :class="INPUT" />
        </label>
        <label class="flex flex-col gap-1">
          <span :class="HINT">Descansar a cada (mensagens)</span>
          <input v-model.number="cfg.pausa_a_cada" type="number" min="0" :class="INPUT" />
        </label>
        <label class="flex flex-col gap-1">
          <span :class="HINT">Descansar por (min.)</span>
          <input v-model.number="cfg.pausa_minutos" type="number" min="0" :class="INPUT" />
        </label>
        <label class="flex flex-col gap-1">
          <span :class="HINT">Das</span>
          <input v-model="cfg.janela_inicio" type="time" :class="INPUT" />
        </label>
        <label class="flex flex-col gap-1">
          <span :class="HINT">Até</span>
          <input v-model="cfg.janela_fim" type="time" :class="INPUT" />
        </label>
        <div class="flex flex-col col-span-2 gap-1">
          <span :class="HINT">Dias</span>
          <div class="flex flex-wrap gap-1.5 items-center h-10">
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

      <p class="p-3 text-sm rounded-lg bg-n-alpha-1 text-n-slate-12">
        Cerca de <strong>{{ perHour }} mensagens por hora</strong>.
        <template v-if="estimate">
          A primeira sai {{ formatDateTime(estimate.first, TIME_ZONE) }} e a
          última por volta de {{ formatDateTime(estimate.last, TIME_ZONE) }}.
        </template>
      </p>
      <p v-if="risky" class="text-xs text-n-amber-11">
        Com menos de 20 segundos entre uma mensagem e outra, o WhatsApp pode
        bloquear o número.
      </p>
    </section>

    <!-- 5. Revisar -->
    <section v-if="step === 4" :class="CARD">
      <h2 class="text-lg font-semibold text-n-slate-12">Confira antes de criar</h2>

      <ul class="flex flex-col gap-2 text-sm text-n-slate-12">
        <li class="flex gap-2">
          <span class="i-lucide-message-circle size-4 mt-0.5 text-n-slate-11" />
          Sai pelo WhatsApp <strong>{{ inbox.name }}</strong>.
        </li>
        <li class="flex gap-2">
          <span class="i-lucide-users size-4 mt-0.5 text-n-slate-11" />
          <span>
            Vai para <strong>{{ recipients.length }}
              {{ recipients.length === 1 ? 'pessoa' : 'pessoas' }}</strong>:
            {{ audienceSummary }}<template v-if="onlyOpen">, só conversas em
              aberto</template>.
          </span>
        </li>
        <li class="flex gap-2">
          <span class="i-lucide-clock size-4 mt-0.5 text-n-slate-11" />
          <span v-if="estimate">
            Começa {{ formatDateTime(estimate.first, TIME_ZONE) }} e termina por
            volta de {{ formatDateTime(estimate.last, TIME_ZONE) }}.
          </span>
        </li>
      </ul>

      <div class="flex flex-col gap-1">
        <span :class="HINT">Mensagem (exemplo para {{ sampleName }}):</span>
        <div
          class="self-end p-3 max-w-md text-sm whitespace-pre-wrap rounded-xl rounded-br-sm bg-n-teal-3 text-n-slate-12"
        >
          {{ preview }}
        </div>
      </div>

      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium text-n-slate-12">
          Nome da campanha (só para vocês acharem depois)
        </span>
        <input v-model="nome" :class="INPUT" maxlength="120" />
      </label>

      <p :class="HINT">
        Depois de criada, dá para pausar ou cancelar a qualquer momento. Quem
        for descartado no meio do caminho não recebe.
      </p>
    </section>

    <!-- Rodape -->
    <div class="flex flex-wrap gap-3 justify-between items-center pb-6">
      <button
        :class="BTN"
        class="text-n-slate-11 hover:bg-n-alpha-1"
        @click="back"
      >
        <span class="i-lucide-arrow-left size-4" />
        {{ step === 0 ? 'Cancelar' : 'Voltar' }}
      </button>
      <div class="flex flex-wrap gap-3 items-center">
        <span v-if="stepProblem" class="text-sm text-n-slate-11">
          {{ stepProblem }}
        </span>
        <button
          v-if="step < STEPS.length - 1"
          :class="BTN"
          class="text-white bg-n-brand hover:opacity-90"
          :disabled="!!stepProblem"
          @click="next"
        >
          Continuar <span class="i-lucide-arrow-right size-4" />
        </button>
        <button
          v-else
          :class="BTN"
          class="text-white bg-n-brand hover:opacity-90"
          :disabled="!!stepProblem || saving"
          @click="create"
        >
          <span class="i-lucide-send size-4" />
          {{
            saving
              ? 'Criando…'
              : `Criar campanha para ${recipients.length} ${recipients.length === 1 ? 'pessoa' : 'pessoas'}`
          }}
        </button>
      </div>
    </div>
    <p v-if="saveError" class="-mt-4 text-sm text-n-ruby-11">
      {{ saveError }}
    </p>
  </div>
</template>
