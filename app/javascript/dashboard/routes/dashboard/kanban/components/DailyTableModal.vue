<script setup>
/**
 * Tabela de contagem — a tela que a equipe manda no grupo as 12h e as 17h30.
 *
 * Duas secoes, nesta ordem de propósito:
 *   1. HOJE — o que se moveu no dia, por quem de fato respondeu. E a
 *      informacao principal; e o que muda de uma foto para a outra.
 *   2. ESTOQUE — tudo que existe agora, por responsavel. Contexto, nao
 *      manchete: muda pouco de um dia para o outro.
 *
 * O botao "Copiar imagem" existe para acabar com a foto de tela tirada de
 * celular. Ver tableImage.js.
 */

import { computed, onMounted, ref } from 'vue';
import BaseModal from './BaseModal.vue';
import { TABLE_COLUMNS } from '../stateConstants';
import { copyImage, downloadImage, renderTables } from '../tableImage';

const props = defineProps({
  dayTable: { type: Object, required: true },
  stockTable: { type: Object, required: true },
  createdToday: { type: Number, default: 0 },
  todayCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  isLoadingAttendants: { type: Boolean, default: false },
  loadAttendants: { type: Function, required: true },
});

const emit = defineEmits(['close']);

const feedback = ref('');
const isBusy = ref(false);

const stamp = computed(() =>
  new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
);

const subtitle = computed(
  () =>
    `${stamp.value} · ${props.todayCount} conversas com atividade hoje · ` +
    `${props.createdToday} novas · ${props.totalCount} na base`
);

// Ler quem atendeu custa uma requisicao por conversa do dia, entao so acontece
// quando a tabela abre — nao no carregamento do quadro.
onMounted(() => props.loadAttendants());

const blocks = computed(() => [
  {
    title: 'Hoje — quem atendeu',
    columns: TABLE_COLUMNS,
    rows: props.dayTable.rows,
    total: props.dayTable.total,
    sharedRows: props.dayTable.sharedRows,
  },
  {
    title: 'Estoque atual — por responsável',
    columns: TABLE_COLUMNS,
    rows: props.stockTable.rows,
    total: props.stockTable.total,
    sharedRows: props.stockTable.sharedRows,
  },
]);

const buildCanvas = () =>
  renderTables({
    title: 'Atendimentos — Gonçalves & Silva',
    subtitle: subtitle.value,
    blocks: blocks.value,
    footer:
      'Aberto = cliente falou e ninguem respondeu ainda. ' +
      'Fechado = desqualificado ou descarte do SDR.',
  });

const onCopy = async () => {
  isBusy.value = true;
  feedback.value = '';
  try {
    await copyImage(buildCanvas());
    feedback.value = 'Imagem copiada. Cole no WhatsApp com Ctrl+V.';
  } catch (e) {
    // Clipboard API exige https e suporte do navegador. Em vez de deixar o
    // usuario na mao, cai para o download — o arquivo tambem resolve o
    // problema de nao ter que fotografar a tela.
    try {
      await downloadImage(buildCanvas(), `atendimentos-${Date.now()}.png`);
      feedback.value = 'Nao deu para copiar; baixei o PNG.';
    } catch (e2) {
      feedback.value = `Falha ao gerar a imagem: ${e2.message}`;
    }
  } finally {
    isBusy.value = false;
  }
};

const onDownload = async () => {
  isBusy.value = true;
  feedback.value = '';
  try {
    await downloadImage(buildCanvas(), `atendimentos-${Date.now()}.png`);
    feedback.value = 'PNG baixado.';
  } catch (e) {
    feedback.value = `Falha ao gerar a imagem: ${e.message}`;
  } finally {
    isBusy.value = false;
  }
};

const BTN =
  'px-3 py-1.5 text-xs rounded-lg border transition-colors border-n-weak text-n-slate-12 hover:bg-n-alpha-2 disabled:opacity-50';
const CELL = 'px-2 py-1.5 text-center tabular-nums';
</script>

<template>
  <BaseModal width="w-[860px]" @close="emit('close')">
    <div class="flex gap-2 items-center mb-1">
      <h2 class="text-base font-bold text-n-slate-12">Tabela de atendimentos</h2>
      <span class="flex-1" />
      <button :class="BTN" :disabled="isBusy" @click="onCopy">
        Copiar imagem
      </button>
      <button :class="BTN" :disabled="isBusy" @click="onDownload">
        Baixar PNG
      </button>
      <button :class="BTN" @click="emit('close')">Fechar</button>
    </div>

    <p class="mb-3 text-xs text-n-slate-11">{{ subtitle }}</p>

    <p v-if="feedback" class="mb-3 text-xs font-medium text-n-brand">
      {{ feedback }}
    </p>

    <section
      v-for="block in blocks"
      :key="block.title"
      class="mb-5"
    >
      <h3 class="mb-1.5 text-sm font-semibold text-n-slate-12">
        {{ block.title }}
        <span
          v-if="block.title.startsWith('Hoje') && isLoadingAttendants"
          class="ml-2 text-xs font-normal text-n-slate-11"
        >
          lendo atendimentos...
        </span>
      </h3>

      <table class="w-full text-xs border rounded-lg border-n-weak">
        <thead>
          <tr class="bg-n-alpha-2 text-n-slate-11">
            <th class="px-2 py-1.5 font-semibold text-left">Agente</th>
            <th
              v-for="col in block.columns"
              :key="col.key"
              class="px-2 py-1.5 font-semibold text-center"
            >
              {{ col.title }}
            </th>
            <th class="px-2 py-1.5 font-semibold text-center">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in block.rows"
            :key="row.name"
            class="border-t border-n-weak"
          >
            <td class="px-2 py-1.5 truncate text-n-slate-12 max-w-[220px]">
              {{ row.name }}
            </td>
            <td
              v-for="col in block.columns"
              :key="col.key"
              :class="[
                CELL,
                row.counts[col.key] ? 'text-n-slate-12' : 'text-n-slate-10',
              ]"
            >
              {{ row.counts[col.key] || 0 }}
            </td>
            <td :class="[CELL, 'font-bold text-n-slate-12']">{{ row.total }}</td>
          </tr>

          <tr
            v-if="!block.rows.length"
            class="border-t border-n-weak"
          >
            <td
              :colspan="block.columns.length + 2"
              class="px-2 py-3 text-center text-n-slate-11"
            >
              Nenhuma conversa neste recorte.
            </td>
          </tr>

          <tr class="font-bold border-t bg-n-alpha-2 border-n-weak">
            <td class="px-2 py-1.5 text-n-slate-12">TOTAL</td>
            <td
              v-for="col in block.columns"
              :key="col.key"
              :class="[CELL, 'text-n-slate-12']"
            >
              {{ block.total.counts[col.key] || 0 }}
            </td>
            <td :class="[CELL, 'text-n-slate-12']">{{ block.total.total }}</td>
          </tr>
        </tbody>
      </table>

      <p
        v-if="block.sharedRows > 0"
        class="mt-1 text-[11px] text-n-slate-11"
      >
        As linhas somam {{ block.sharedRows }} a mais que o TOTAL:
        {{ block.sharedRows }} conversa(s) foram atendidas por mais de uma
        pessoa e aparecem em mais de uma linha. O TOTAL conta conversas
        distintas.
      </p>
    </section>

    <p class="text-[11px] leading-relaxed text-n-slate-11">
      <strong>Aberto</strong> = cliente falou e ninguem respondeu ainda.
      <strong>Fechado</strong> = desqualificado ou descarte do SDR.
      Uma conversa aparece em uma coluna so; quando cabe em mais de uma, vale
      Fechado &gt; Resolvido &gt; Aguardando &gt; Em atendimento &gt; Aberto.
    </p>
  </BaseModal>
</template>
