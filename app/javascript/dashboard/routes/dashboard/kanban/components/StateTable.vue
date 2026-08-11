<script setup>
/**
 * Quadro por estado — tabela.
 *
 * Substitui os cards, por decisao de 10/08/2026. O motivo nao e estetico: o
 * quadro montava 513 cards no DOM de uma vez e a tela ficava pesada. Uma linha
 * de tabela mostra 30-40 registros na altura em que cabiam 5 cards, e ainda
 * permite ordenar — que era o que faltava para trabalhar a fila.
 *
 * As 7 colunas viram chips de contagem no topo. O pedido original era "ver
 * quantos tem em cada estado"; os chips cumprem isso, e a tabela cumpre o
 * trabalhar. Clicar num chip filtra; clicar de novo tira o filtro.
 *
 * A classificacao NAO e refeita aqui: as linhas saem de `board.inColumn()`, o
 * mesmo lugar que alimenta os chips. Reclassificar por conta propria seria a
 * forma mais facil de a tabela discordar do contador logo acima dela.
 */

import { computed, ref, watch } from 'vue';

import { INBOX_NAMES, STATE_TABLE_PAGE_SIZE } from '../stateConstants';
import { idleDays, lastActivityTs } from '../stateBoard';
import { convAssignee, convDisplayName, convPhone, fmtDate, fmtPhoneBR } from '../helpers';

const props = defineProps({
  board: { type: Object, required: true },
  conversationUrl: { type: Function, required: true },
});

const { board } = props;

// ------------------------------------------------------------------ linhas

/**
 * Uma linha por conversa, com os campos ja derivados.
 *
 * Derivar uma vez aqui em vez de dentro do template evita recalcular
 * `idleDays` a cada comparacao da ordenacao — com 503 linhas isso e a
 * diferenca entre ordenar instantaneo e ordenar com engasgo.
 */
const rows = computed(() => {
  const now = board.nowMs.value;
  const out = [];
  board.columns.forEach((col, order) => {
    board.inColumn(col.key).forEach(conv => {
      const idle = idleDays(conv, now);
      out.push({
        id: conv.id,
        conv,
        name: convDisplayName(conv),
        phone: fmtPhoneBR(convPhone(conv)),
        rawPhone: convPhone(conv),
        stateKey: col.key,
        stateTitle: col.short || col.title,
        stateColor: col.color,
        // A ordem de EXIBICAO das colunas, para "ordenar por estado" seguir a
        // mesma sequencia do quadro antigo em vez da ordem alfabetica.
        stateOrder: order,
        inbox: INBOX_NAMES[conv.inbox_id] || `Caixa ${conv.inbox_id}`,
        assignee: convAssignee(conv),
        lastTs: lastActivityTs(conv),
        // Infinity existe (conversa sem timestamp nenhum) e ordena para o topo,
        // que e onde ela deve estar. Na tela vira '—'.
        idle,
      });
    });
  });
  return out;
});

// ------------------------------------------------------------------ filtros

/** null = todos os estados. */
const stateFilter = ref(null);
const query = ref('');

const chips = computed(() =>
  board.columns.map(col => ({
    key: col.key,
    title: col.short || col.title,
    hint: col.hint,
    color: col.color,
    count: board.inColumn(col.key).length,
  }))
);

function toggleChip(key) {
  stateFilter.value = stateFilter.value === key ? null : key;
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return rows.value.filter(r => {
    if (stateFilter.value && r.stateKey !== stateFilter.value) return false;
    if (!q) return true;
    // Telefone entra cru e formatado: quem digita "11987" nao acha nada se so
    // o formatado for comparado, e quem copia "(11) 98765-4321" tambem nao.
    return `${r.name} ${r.rawPhone} ${r.phone} #${r.id}`.toLowerCase().includes(q);
  });
});

// --------------------------------------------------------------- ordenacao

const SORTS = {
  name: r => r.name.toLowerCase(),
  phone: r => r.rawPhone,
  state: r => r.stateOrder,
  inbox: r => r.inbox.toLowerCase(),
  assignee: r => r.assignee.toLowerCase(),
  lastTs: r => r.lastTs,
  idle: r => r.idle,
};

const HEADERS = [
  { key: 'name', title: 'Cliente', align: 'left' },
  { key: 'phone', title: 'Telefone', align: 'left' },
  { key: 'state', title: 'Estado', align: 'left' },
  { key: 'inbox', title: 'Caixa', align: 'left' },
  { key: 'assignee', title: 'Responsável', align: 'left' },
  { key: 'lastTs', title: 'Última atividade', align: 'left' },
  { key: 'idle', title: 'Dias parado', align: 'right' },
];

/**
 * Padrao: dias parado, decrescente. O que esta apodrecendo aparece primeiro —
 * essa e a fila que precisa de acao, nao a ordem alfabetica.
 */
const sortKey = ref('idle');
const sortDesc = ref(true);

function sortBy(key) {
  if (sortKey.value === key) {
    sortDesc.value = !sortDesc.value;
    return;
  }
  sortKey.value = key;
  // Texto comeca em A-Z, numero e data comecam do maior. E o que a pessoa
  // espera de cada tipo sem ter de clicar duas vezes.
  sortDesc.value = key === 'idle' || key === 'lastTs';
}

const sorted = computed(() => {
  const pick = SORTS[sortKey.value] || SORTS.idle;
  const dir = sortDesc.value ? -1 : 1;
  return [...filtered.value].sort((a, b) => {
    const x = pick(a);
    const y = pick(b);
    if (x === y) return a.id - b.id; // desempate estavel
    return (x > y ? 1 : -1) * dir;
  });
});

// --------------------------------------------------------------- paginacao

/**
 * Pagina de 50. Renderizar as 503 linhas de uma vez recriaria o problema dos
 * cards — o gargalo era a quantidade de nos no DOM, nao o formato deles.
 * Paginar e mais simples que virtualizar e resolve o mesmo.
 */
const page = ref(1);
const pageSize = STATE_TABLE_PAGE_SIZE;

const pageCount = computed(() =>
  Math.max(1, Math.ceil(sorted.value.length / pageSize))
);

const paged = computed(() =>
  sorted.value.slice((page.value - 1) * pageSize, page.value * pageSize)
);

// Filtrar, buscar, reordenar ou trocar o periodo com a pagina 7 aberta deixaria
// a tela vazia sem explicacao.
watch([stateFilter, query, sortKey, sortDesc, () => board.scope.value], () => {
  page.value = 1;
});
watch(pageCount, n => {
  if (page.value > n) page.value = n;
});

const rangeText = computed(() => {
  const n = sorted.value.length;
  if (!n) return '0 de 0';
  const from = (page.value - 1) * pageSize + 1;
  const to = Math.min(page.value * pageSize, n);
  return `${from}–${to} de ${n}`;
});

// ------------------------------------------------------------------ formato

/** Dias parado com uma casa ate 10 dias; acima disso a fracao nao informa. */
function idleText(d) {
  if (!Number.isFinite(d)) return '—';
  if (d < 1) return 'hoje';
  if (d < 10) return d.toFixed(1);
  return String(Math.round(d));
}

const TH =
  'px-2.5 py-2 font-semibold text-n-slate-11 whitespace-nowrap select-none cursor-pointer hover:text-n-slate-12';
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0">
    <!-- Chips de estado: cumprem o "ver quantos tem em cada um" que as colunas
         faziam, e servem de filtro. -->
    <div class="flex flex-wrap gap-1.5 items-center px-4 py-2 border-b border-n-weak">
      <button
        class="px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors"
        :class="
          stateFilter === null
            ? 'border-n-brand text-n-brand bg-n-alpha-2'
            : 'border-n-weak text-n-slate-11 hover:bg-n-alpha-1'
        "
        @click="stateFilter = null"
      >
        Todos
        <span class="ml-1 font-bold">{{ rows.length }}</span>
      </button>

      <button
        v-for="chip in chips"
        :key="chip.key"
        class="flex gap-1.5 items-center px-2.5 py-1 text-xs rounded-full border transition-colors"
        :class="
          stateFilter === chip.key
            ? 'border-n-brand text-n-slate-12 bg-n-alpha-2 font-semibold'
            : 'border-n-weak text-n-slate-11 hover:bg-n-alpha-1'
        "
        :title="chip.hint"
        @click="toggleChip(chip.key)"
      >
        <span
          class="flex-shrink-0 rounded-full size-2"
          :style="{ backgroundColor: chip.color }"
        />
        {{ chip.title }}
        <span class="font-bold text-n-slate-12">{{ chip.count }}</span>
      </button>

      <span class="flex-1" />

      <input
        v-model="query"
        type="search"
        placeholder="Buscar nome, telefone ou #id"
        class="px-2.5 py-1 text-xs rounded-lg border bg-n-background border-n-weak text-n-slate-12 w-[220px]"
      />
    </div>

    <!-- A rolagem e desta caixa, nao da pagina: o cabecalho da tabela fica
         grudado no topo com sticky e continua legivel na linha 400. -->
    <div class="overflow-auto flex-1 min-h-0">
      <table class="w-full text-xs border-collapse">
        <thead class="sticky top-0 z-10 bg-n-background">
          <tr class="border-b border-n-weak">
            <th
              v-for="h in HEADERS"
              :key="h.key"
              :class="[TH, h.align === 'right' ? 'text-right' : 'text-left']"
              @click="sortBy(h.key)"
            >
              {{ h.title }}
              <span v-if="sortKey === h.key" class="text-n-brand">
                {{ sortDesc ? '↓' : '↑' }}
              </span>
            </th>
            <th class="px-2.5 py-2 w-10" />
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="row in paged"
            :key="row.id"
            class="border-b transition-colors border-n-weak hover:bg-n-alpha-1"
          >
            <td class="px-2.5 py-1.5 font-medium text-n-slate-12 max-w-[240px]">
              <span class="block truncate" :title="row.name">{{ row.name }}</span>
            </td>
            <td class="px-2.5 py-1.5 whitespace-nowrap text-n-slate-11">
              {{ row.phone || '—' }}
            </td>
            <td class="px-2.5 py-1.5 whitespace-nowrap">
              <span class="flex gap-1.5 items-center">
                <span
                  class="flex-shrink-0 rounded-full size-2"
                  :style="{ backgroundColor: row.stateColor }"
                />
                <span class="text-n-slate-12">{{ row.stateTitle }}</span>
              </span>
            </td>
            <td class="px-2.5 py-1.5 whitespace-nowrap text-n-slate-11">
              {{ row.inbox }}
            </td>
            <td class="px-2.5 py-1.5 whitespace-nowrap text-n-slate-11">
              {{ row.assignee || '—' }}
            </td>
            <td class="px-2.5 py-1.5 whitespace-nowrap text-n-slate-11">
              {{ fmtDate(row.lastTs) || '—' }}
            </td>
            <td
              class="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap text-n-slate-12"
            >
              {{ idleText(row.idle) }}
            </td>
            <td class="px-2.5 py-1.5 text-right whitespace-nowrap">
              <a
                :href="conversationUrl(row.id)"
                target="_blank"
                rel="noopener"
                class="text-n-brand hover:underline"
              >
                abrir
              </a>
            </td>
          </tr>

          <tr v-if="!paged.length">
            <td colspan="8" class="px-4 py-10 text-center text-n-slate-11">
              <span v-if="board.isLoading.value">Carregando…</span>
              <span v-else-if="query || stateFilter">
                Nenhuma conversa com esse filtro.
              </span>
              <span v-else>Nenhuma conversa neste período.</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="sorted.length"
      class="flex gap-2 items-center px-4 py-2 text-xs border-t border-n-weak text-n-slate-11"
    >
      <span>{{ rangeText }}</span>
      <span class="flex-1" />
      <button
        class="px-2 py-1 rounded-lg border border-n-weak hover:bg-n-alpha-2 disabled:opacity-40"
        :disabled="page <= 1"
        @click="page -= 1"
      >
        Anterior
      </button>
      <span class="tabular-nums">{{ page }} / {{ pageCount }}</span>
      <button
        class="px-2 py-1 rounded-lg border border-n-weak hover:bg-n-alpha-2 disabled:opacity-40"
        :disabled="page >= pageCount"
        @click="page += 1"
      >
        Próxima
      </button>
    </div>
  </div>
</template>
