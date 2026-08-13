<script setup>
import { computed, ref, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';
import BaseModal from './BaseModal.vue';
import {
  convAssignee,
  convCreatedRaw,
  convDisplayName,
  convLabels,
  convPhone,
  convStageLabel,
  convUpdatedRaw,
  dateStrSP,
  fmtDate,
  fmtPhoneBR,
  shiftYmd,
  situacaoBR,
  todaySP,
  ymdToBR,
} from '../helpers';
import { UNSTAGED_LABEL } from '../constants';

const props = defineProps({
  conversations: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  /**
   * As tags configuradas do quadro (prefs.tags) — 12/08/2026.
   *
   * So elas viram chip, de proposito, e nao "toda etiqueta que nao e etapa":
   * as conversas carregam `atendimento_humanizado` (222 em 11/08) e `manual`
   * (138), que sao sinais de automacao e nao qualificacao do lead. Mostrar as
   * duas encheria quase toda linha com os mesmos dois chips e esconderia
   * justamente as tags que dizem algo sobre o caso.
   */
  tags: { type: Array, default: () => [] },
  initialMode: { type: String, default: 'created' },
  isLoading: { type: Boolean, default: false },
  conversationUrl: { type: Function, required: true },
});

const emit = defineEmits(['close', 'export']);

const mode = ref(props.initialMode);
const date = ref(todaySP());

watch(
  () => props.initialMode,
  v => {
    mode.value = v;
    date.value = todaySP();
    // Cada abertura comeca com todas as etapas marcadas, por decisao de 13/08.
    // Filtro que sobrevive fechado esconde dado sem ninguem lembrar por que.
    selectAllStages();
  }
);

const stageLabels = computed(() => props.columns.map(c => c.label));

const whenOf = conv =>
  mode.value === 'updated' ? convUpdatedRaw(conv) : convCreatedRaw(conv);

const list = computed(() => {
  const target = date.value;
  return props.conversations
    .filter(c => dateStrSP(whenOf(c)) === target)
    .sort((a, b) => (whenOf(b) || 0) - (whenOf(a) || 0));
});

const isToday = computed(() => date.value === todaySP());

/** Chave da opcao sintetica: conversa que nao cai em coluna nenhuma. */
const NO_STAGE_KEY = '__fora_do_funil__';

/**
 * Chave de etapa da conversa — sempre uma das opcoes do filtro.
 *
 * Separada de stageOf porque o filtro compara CHAVE, nao titulo: os dois funis
 * tem colunas de titulo identico ("Analise medica", "Desqualificado"), e o
 * titulo sozinho nao identifica coluna.
 */
const stageKeyOf = conv => {
  const found = convStageLabel(conv, stageLabels.value);
  // Ver ContactPopup: cartao sem etiqueta de etapa num funil que tem a coluna
  // Sem etapa pertence a ela, e nao a um traco.
  const lbl =
    found ||
    (stageLabels.value.includes(UNSTAGED_LABEL) ? UNSTAGED_LABEL : '');
  return props.columns.some(c => c.label === lbl) ? lbl : NO_STAGE_KEY;
};

const stageOf = conv => {
  const col = props.columns.find(c => c.label === stageKeyOf(conv));
  return {
    title: col ? col.title : '-',
    color: col ? col.color : '#64748b',
  };
};

/**
 * Filtro de etapas — 13/08/2026.
 *
 * Nasceu de um problema concreto: a migracao do ChatGuru criou 428 conversas
 * num dia so, todas nas colunas Closer/SDR ChatGuru. Sem filtro, a tela de
 * Criados daquele dia vira uma lista de leads importados e some com os leads
 * que a equipe realmente atendeu.
 *
 * As opcoes sao as colunas do funil aberto, mais uma sintetica para quem nao
 * cai em coluna nenhuma. Essa ultima so aparece nos funis SEM a coluna "Sem
 * etapa" (hoje, so o de Auxilio): la a conversa com etiqueta de etapa
 * desconhecida some do quadro, e esta tela e o unico lugar onde ela aparece —
 * deixa-la fora do filtro a esconderia tambem aqui.
 *
 * A lista e estavel por funil, e NAO derivada das conversas do dia. Se ela
 * mudasse conforme o dia, a selecao se perderia a cada clique na seta de
 * navegacao.
 */
const stageOptions = computed(() => {
  const opts = props.columns.map(c => ({
    key: c.label,
    title: c.title,
    color: c.color,
  }));
  if (!stageLabels.value.includes(UNSTAGED_LABEL)) {
    opts.push({ key: NO_STAGE_KEY, title: 'Sem etapa', color: '#64748b' });
  }
  return opts;
});

const selectedStages = ref([]);
const selectAllStages = () => {
  selectedStages.value = stageOptions.value.map(o => o.key);
};

/*
 * Observa a ASSINATURA das opcoes, nao o array em si: o computed devolve um
 * array novo a cada leitura, e observa-lo direto reiniciaria a selecao em
 * loop. A troca de funil muda a assinatura e reinicia — que e o certo, porque
 * as chaves de um funil nao existem no outro.
 */
watch(() => stageOptions.value.map(o => o.key).join('|'), selectAllStages, {
  immediate: true,
});

const allStagesSelected = computed(
  () => selectedStages.value.length === stageOptions.value.length
);

const listaFiltrada = computed(() => {
  if (allStagesSelected.value) return list.value;
  const sel = new Set(selectedStages.value);
  return list.value.filter(c => sel.has(stageKeyOf(c)));
});

const isFilterOpen = ref(false);
const filterRoot = ref(null);
onClickOutside(filterRoot, () => {
  isFilterOpen.value = false;
});

const toggleStage = key => {
  const i = selectedStages.value.indexOf(key);
  if (i >= 0) selectedStages.value.splice(i, 1);
  else selectedStages.value.push(key);
};

/**
 * As tags do quadro aplicadas nesta conversa, na ordem em que estao
 * configuradas — nao na ordem em que foram gravadas no Chatwoot.
 *
 * A ordem fixa importa: percorrendo uma coluna inteira, a mesma tag cai sempre
 * na mesma posicao e da para bater o olho. Pela ordem de gravacao, "Urgente"
 * apareceria ora primeiro ora por ultimo em linhas vizinhas.
 */
const tagsOf = conv => {
  const applied = convLabels(conv);
  return props.tags.filter(t => applied.includes(t.label));
};

const TAB = 'px-3 py-1.5 text-xs rounded-lg border border-n-weak text-n-slate-12';
const TAB_ON = 'text-white border-transparent';
const NAV = 'px-2.5 py-1 text-sm rounded-lg border border-n-weak text-n-slate-12';
const TH =
  'sticky top-0 z-10 px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-left uppercase bg-n-alpha-2 text-n-slate-11';
const TD = 'px-2.5 py-1.5 text-left border-b border-n-weak whitespace-nowrap';
</script>

<template>
  <BaseModal width="w-[1060px]" @close="emit('close')">
    <div class="flex flex-wrap gap-2.5 items-center mb-3">
      <div class="flex gap-1.5">
        <button
          :class="[TAB, mode === 'created' ? TAB_ON : '']"
          :style="mode === 'created' ? 'background-color:#2563eb' : ''"
          @click="mode = 'created'"
        >
          Criados
        </button>
        <button
          :class="[TAB, mode === 'updated' ? TAB_ON : '']"
          :style="mode === 'updated' ? 'background-color:#2563eb' : ''"
          @click="mode = 'updated'"
        >
          Atualizados
        </button>
      </div>

      <div class="flex gap-1 items-center">
        <button :class="NAV" title="Dia anterior" @click="date = shiftYmd(date, -1)">
          ‹
        </button>
        <input
          v-model="date"
          type="date"
          class="px-2 py-1 text-xs rounded-lg border bg-n-background border-n-weak text-n-slate-12"
        />
        <button :class="NAV" title="Próximo dia" @click="date = shiftYmd(date, 1)">
          ›
        </button>
        <button
          :class="[NAV, isToday ? 'opacity-50 cursor-not-allowed' : '']"
          :disabled="isToday"
          @click="date = todaySP()"
        >
          Hoje
        </button>
      </div>

      <div ref="filterRoot" class="flex relative items-center">
        <button
          :class="[NAV, allStagesSelected ? '' : 'border-n-brand text-n-brand']"
          :title="
            allStagesSelected
              ? 'Escolher quais etapas aparecem na lista'
              : 'A lista esta filtrada por etapa'
          "
          @click="isFilterOpen = !isFilterOpen"
        >
          Etapas:
          {{
            allStagesSelected
              ? 'todas'
              : `${selectedStages.length} de ${stageOptions.length}`
          }}
          <span class="text-n-slate-11">▾</span>
        </button>

        <div
          v-if="isFilterOpen"
          class="absolute top-full z-20 p-1 mt-1 rounded-lg border shadow-lg ltr:left-0 rtl:right-0 w-[264px] max-h-[320px] overflow-auto border-n-strong bg-n-solid-1"
        >
          <div class="flex gap-1 px-1 pb-1 mb-1 border-b border-n-weak">
            <button
              class="px-2 py-1 text-[11px] rounded-md text-n-brand hover:bg-n-alpha-2"
              @click="selectAllStages"
            >
              Marcar todas
            </button>
            <button
              class="px-2 py-1 text-[11px] rounded-md text-n-slate-11 hover:bg-n-alpha-2"
              @click="selectedStages = []"
            >
              Desmarcar todas
            </button>
          </div>

          <label
            v-for="opt in stageOptions"
            :key="opt.key"
            class="flex gap-2 items-center px-2 py-1 rounded-md cursor-pointer hover:bg-n-alpha-2"
          >
            <input
              type="checkbox"
              :checked="selectedStages.includes(opt.key)"
              @change="toggleStage(opt.key)"
            />
            <span
              class="flex-shrink-0 rounded-full size-2"
              :style="{ backgroundColor: opt.color }"
            />
            <span class="text-xs text-n-slate-12">{{ opt.title }}</span>
          </label>
        </div>
      </div>

      <span class="text-xs text-n-slate-11">
        {{ listaFiltrada.length }} conversa(s) - {{ ymdToBR(date) }}
        <template v-if="isToday">(hoje)</template>
        <template v-if="!allStagesSelected">
          · de {{ list.length }} no dia
        </template>
      </span>

      <span class="flex-1" />

      <button
        class="px-3 py-1.5 text-sm text-white rounded-lg bg-n-brand"
        :disabled="!listaFiltrada.length"
        @click="emit('export', { list: listaFiltrada, mode, date })"
      >
        Exportar Excel
      </button>
      <button
        class="px-3 py-1.5 text-sm rounded-lg border border-n-weak text-n-slate-12"
        @click="emit('close')"
      >
        Fechar
      </button>
    </div>

    <div class="overflow-auto flex-1 min-h-[220px] rounded-xl border border-n-weak">
      <p v-if="isLoading" class="p-6 text-sm text-center text-n-slate-11">
        Carregando conversas...
      </p>

      <p v-else-if="!listaFiltrada.length" class="p-6 text-sm text-center text-n-slate-11">
        Nenhuma conversa
        {{ mode === 'updated' ? 'atualizada' : 'criada' }} em
        {{ ymdToBR(date) }}.
      </p>

      <table v-else class="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th :class="TH">ID</th>
            <th :class="TH">Título</th>
            <th :class="TH">Telefone</th>
            <th :class="TH">Etapa</th>
            <th :class="TH">Tags</th>
            <th :class="TH">Situação</th>
            <th :class="TH">Responsável</th>
            <th :class="TH">
              {{ mode === 'updated' ? 'Atualizado' : 'Criado' }}
            </th>
            <th :class="TH" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="conv in listaFiltrada" :key="conv.id" class="hover:bg-n-alpha-2">
            <td :class="TD">#{{ conv.id }}</td>
            <td :class="[TD, 'max-w-[260px] whitespace-normal']">
              {{ convDisplayName(conv) }}
            </td>
            <td :class="TD">{{ fmtPhoneBR(convPhone(conv)) }}</td>
            <td :class="TD">
              <span
                class="px-2 text-[10.5px] font-bold text-white rounded-full"
                :style="{ backgroundColor: stageOf(conv).color }"
              >
                {{ stageOf(conv).title }}
              </span>
            </td>
            <!--
              whitespace-normal e max-w: uma conversa pode ter varias tags e,
              com nowrap, tres chips empurrariam Situacao e Responsavel para
              fora da largura util do modal.
            -->
            <td :class="[TD, 'max-w-[220px] whitespace-normal']">
              <span
                v-for="t in tagsOf(conv)"
                :key="t.label"
                class="inline-block mr-1 mb-0.5 px-1.5 text-[10.5px] font-semibold text-white rounded-full"
                :style="{ backgroundColor: t.color }"
                :title="t.title"
              >
                {{ t.title }}
              </span>
              <span v-if="!tagsOf(conv).length" class="text-n-slate-11">—</span>
            </td>
            <td :class="TD">{{ situacaoBR(conv.status) }}</td>
            <td :class="TD">{{ convAssignee(conv) || 'Não definido' }}</td>
            <td :class="TD">{{ fmtDate(whenOf(conv)) }}</td>
            <td :class="TD">
              <a
                :href="conversationUrl(conv.id)"
                target="_blank"
                rel="noopener"
                class="text-n-brand hover:underline"
              >
                abrir
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </BaseModal>
</template>
