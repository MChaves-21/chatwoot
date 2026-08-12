<script setup>
/**
 * Matriz "departamento ou usuario x estado" — 12/08/2026.
 *
 * Reproduz a tabela que a equipe lia no ChatGuru: linhas de departamento e de
 * pessoa, colunas de estado, contagem no cruzamento. Substitui a fila de chips
 * que ficava aqui — os chips davam o total por estado, esta tabela da o mesmo
 * total na linha TOTAL e ainda diz de quem e cada pedaco.
 *
 * A tabela tambem e o controle de filtro da lista de baixo: clicar numa celula
 * filtra por linha E estado, clicar no nome da linha filtra so pela linha,
 * clicar no cabecalho filtra so pelo estado. Clicar de novo tira o filtro.
 *
 * Nao classifica nada por conta propria: le `board.matrix`, o mesmo lugar que
 * alimenta a lista. Reclassificar aqui seria o jeito mais rapido de fazer o
 * topo discordar do que esta logo abaixo.
 */

import { computed } from 'vue';
import { MATRIX_CELL_COLORS, TABLE_COLUMNS } from '../stateConstants';

const props = defineProps({
  board: { type: Object, required: true },
});

const { board } = props;

const matrix = computed(() => board.matrix.value);

/**
 * Se nao ha nenhuma equipe cadastrada, o grupo Departamentos so teria a linha
 * "Sem departamento" com tudo dentro — uma tabela de uma linha que nao informa
 * nada. Nesse caso ele nao aparece, e no lugar vai o aviso de como habilita-lo.
 */
const hasTeams = computed(() => (board.teams.value || []).length > 0);

const groups = computed(() =>
  matrix.value.groups.filter(g => g.key !== 'equipes' || hasTeams.value)
);

const columns = TABLE_COLUMNS;

const colorOf = key => MATRIX_CELL_COLORS[key] || '#64748b';

// ------------------------------------------------------------------ filtro

const isStateOn = key => board.stateFilter.value === key;

const isRowOn = (group, rowKey) => {
  const f = board.rowFilter.value;
  return Boolean(f && f.group === group && f.key === rowKey);
};

const isCellOn = (group, rowKey, stateKey) =>
  isRowOn(group, rowKey) && isStateOn(stateKey);

function toggleState(key) {
  board.stateFilter.value = isStateOn(key) ? null : key;
}

function toggleRow(group, rowKey) {
  board.rowFilter.value = isRowOn(group, rowKey) ? null : { group, key: rowKey };
}

function toggleCell(group, rowKey, stateKey) {
  // Segundo clique na MESMA celula limpa os dois filtros de uma vez. Limpar so
  // um deixaria a lista num recorte que ninguem pediu.
  if (isCellOn(group, rowKey, stateKey)) {
    board.clearMatrixFilter();
    return;
  }
  board.rowFilter.value = { group, key: rowKey };
  board.stateFilter.value = stateKey;
}

const hasFilter = computed(
  () => Boolean(board.stateFilter.value) || Boolean(board.rowFilter.value)
);

// ------------------------------------------------------------------ estilo

/**
 * Celula com valor ganha fundo na cor do estado; zero fica apagado.
 *
 * Opacidade baixa no fundo e cor cheia no texto e o que faz a mesma celula
 * funcionar no tema claro e no escuro sem duas paletas. Cor fixa aqui e
 * deliberado — ver o comentario de MATRIX_CELL_COLORS.
 */
function cellStyle(count, key, on) {
  if (!count) return {};
  const c = colorOf(key);
  return {
    backgroundColor: on ? `${c}44` : `${c}22`,
    color: c,
    borderColor: on ? c : 'transparent',
  };
}

const TH_ROW =
  'px-3 py-2 text-[11px] font-bold tracking-wide text-left uppercase text-n-slate-11';
const TH_NUM =
  'px-2 py-2 text-[11px] font-bold tracking-wide text-center uppercase cursor-pointer select-none';
const CELL =
  'px-2 py-1 text-center tabular-nums rounded-md border border-transparent cursor-pointer transition-colors';
</script>

<template>
  <div class="flex flex-col border-b border-n-weak">
    <div class="flex gap-2 items-center px-4 pt-3 pb-1">
      <h2 class="text-xs font-bold tracking-wide uppercase text-n-slate-11">
        Departamento ou usuário
      </h2>
      <span class="flex-1" />
      <button
        v-if="hasFilter"
        class="px-2 py-0.5 text-xs rounded-lg border border-n-weak text-n-slate-11 hover:bg-n-alpha-2"
        @click="board.clearMatrixFilter()"
      >
        Limpar filtro
      </button>
    </div>

    <!--
      Altura maxima com rolagem propria: com equipes E agentes a tabela pode
      passar de 15 linhas, e sem o teto ela empurraria a lista de conversas
      inteira para fora da tela.
    -->
    <div class="overflow-auto px-4 pb-3 max-h-[320px]">
      <table class="w-full text-xs border-separate border-spacing-y-1">
        <thead>
          <tr>
            <th :class="TH_ROW" />
            <th
              v-for="col in columns"
              :key="col.key"
              :class="TH_NUM"
              :style="{ color: colorOf(col.key) }"
              :title="`Filtrar por ${col.title}`"
              @click="toggleState(col.key)"
            >
              {{ col.title }}
              <span class="font-extrabold">
                ({{ matrix.total.counts[col.key] || 0 }})
              </span>
              <span v-if="isStateOn(col.key)">•</span>
            </th>
            <th
              class="px-2 py-2 text-[11px] font-bold tracking-wide text-center uppercase text-n-slate-11"
            >
              Total
            </th>
          </tr>
        </thead>

        <tbody v-for="group in groups" :key="group.key">
          <tr>
            <td
              :colspan="columns.length + 2"
              class="px-3 pt-2 text-[10.5px] font-bold tracking-wider uppercase text-n-slate-10"
            >
              {{ group.title }}
            </td>
          </tr>

          <tr
            v-for="row in group.rows"
            :key="group.key + row.key"
            class="rounded-lg"
            :class="isRowOn(group.key, row.key) ? 'bg-n-alpha-2' : ''"
          >
            <td
              class="px-3 py-1.5 rounded-l-lg cursor-pointer max-w-[280px]"
              :title="`Filtrar por ${row.name}`"
              @click="toggleRow(group.key, row.key)"
            >
              <span
                class="block font-medium truncate"
                :class="
                  row.kind === 'none' ? 'text-n-slate-10' : 'text-n-slate-12'
                "
              >
                {{ row.name }}
              </span>
              <span
                v-if="row.subtitle"
                class="block text-[10.5px] truncate text-n-slate-10"
              >
                {{ row.subtitle }}
              </span>
            </td>

            <td v-for="col in columns" :key="col.key" class="px-1">
              <div
                :class="CELL"
                :style="
                  cellStyle(
                    row.counts[col.key],
                    col.key,
                    isCellOn(group.key, row.key, col.key)
                  )
                "
                :title="`${row.name} · ${col.title}`"
                @click="toggleCell(group.key, row.key, col.key)"
              >
                <span :class="row.counts[col.key] ? 'font-bold' : 'text-n-slate-10'">
                  {{ row.counts[col.key] || 0 }}
                </span>
              </div>
            </td>

            <td class="px-2 py-1 font-bold text-center rounded-r-lg tabular-nums text-n-slate-12">
              {{ row.total }}
            </td>
          </tr>
        </tbody>

        <tfoot>
          <tr class="font-bold border-t border-n-weak">
            <td class="px-3 py-2 text-n-slate-12">TOTAL</td>
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-2 py-2 text-center tabular-nums text-n-slate-12"
            >
              {{ matrix.total.counts[col.key] || 0 }}
            </td>
            <td class="px-2 py-2 text-center tabular-nums text-n-slate-12">
              {{ matrix.total.total }}
            </td>
          </tr>
        </tfoot>
      </table>

      <!--
        O aviso substitui o grupo Departamentos quando nao ha equipe nenhuma.
        Sem ele, a tabela pareceria simplesmente nao ter a metade que o usuario
        pediu, sem dizer o que falta fazer.
      -->
      <p v-if="!hasTeams" class="mt-2 text-[11px] leading-relaxed text-n-slate-11">
        Nenhuma equipe cadastrada nesta conta, então só há linhas de agente.
        Para ver departamentos (Comercial, SDR, Closer, Suporte), crie as
        equipes em <strong>Configurações → Equipes</strong> e passe a atribuir
        as conversas a elas — as linhas aparecem sozinhas, sem precisar de nova
        versão.
      </p>
    </div>
  </div>
</template>
