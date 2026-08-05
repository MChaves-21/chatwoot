<script setup>
import { computed, ref, watch } from 'vue';
import BaseModal from './BaseModal.vue';
import {
  convAssignee,
  convCreatedRaw,
  convDisplayName,
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

const props = defineProps({
  conversations: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
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

const stageOf = conv => {
  const lbl = convStageLabel(conv, stageLabels.value);
  const col = props.columns.find(c => c.label === lbl);
  return {
    title: col ? col.title : '-',
    color: col ? col.color : '#64748b',
  };
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

      <span class="text-xs text-n-slate-11">
        {{ list.length }} conversa(s) - {{ ymdToBR(date) }}
        <template v-if="isToday">(hoje)</template>
      </span>

      <span class="flex-1" />

      <button
        class="px-3 py-1.5 text-sm text-white rounded-lg bg-n-brand"
        :disabled="!list.length"
        @click="emit('export', { list, mode, date })"
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

      <p v-else-if="!list.length" class="p-6 text-sm text-center text-n-slate-11">
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
            <th :class="TH">Situação</th>
            <th :class="TH">Responsável</th>
            <th :class="TH">
              {{ mode === 'updated' ? 'Atualizado' : 'Criado' }}
            </th>
            <th :class="TH" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="conv in list" :key="conv.id" class="hover:bg-n-alpha-2">
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
