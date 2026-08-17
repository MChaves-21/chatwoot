<!--
  O objeto `filters` e o estado reativo compartilhado do quadro, nao uma copia:
  escrever nele daqui e intencional e e o que mantem a barra de filtros e o
  board em sincronia sem duplicar estado.
-->
<!-- eslint-disable vue/no-mutating-props -->
<script setup>
import { computed } from 'vue';
import BaseModal from './BaseModal.vue';
import { LEAD_FLAGS } from '../constants';
import { dayStart, dayEnd } from '../helpers';

const props = defineProps({
  filters: { type: Object, required: true },
  tags: { type: Array, default: () => [] },
  resultCount: { type: Number, default: 0 },
  isFiltered: { type: Boolean, default: false },
  leadLookupEnabled: { type: Boolean, default: false },
  isEnriching: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'clear', 'change', 'flag-change']);

const INPUT =
  'w-full px-2.5 py-2 text-sm rounded-lg border bg-n-background border-n-weak text-n-slate-12';
const LABEL = 'block mt-3 mb-1 text-xs font-semibold text-n-slate-11';

// Campos de data guardam o texto YYYY-MM-DD; o estado guarda o timestamp.
const dateModel = (key, boundKey, edge) =>
  computed({
    get: () => props.filters[`${key}Text`] || '',
    set: v => {
      props.filters[`${key}Text`] = v;
      props.filters[boundKey] = edge === 'start' ? dayStart(v) : dayEnd(v);
      emit('change');
    },
  });

const criadoDe = dateModel('criadoDe', 'cDe', 'start');
const criadoAte = dateModel('criadoAte', 'cAte', 'end');
const atualDe = dateModel('atualDe', 'aDe', 'start');
const atualAte = dateModel('atualAte', 'aAte', 'end');
</script>

<template>
  <BaseModal @close="emit('close')">
    <h2 class="mb-1 text-lg font-semibold text-n-slate-12">Filtros</h2>
    <p class="mb-4 text-xs leading-relaxed text-n-slate-11">
      Estes filtros atuam sobre as conversas já carregadas em cada coluna. Use
      "Ver mais" para trazer mais antes de filtrar. Para achar alguém que ainda
      não apareceu no quadro, use a busca da barra do topo — ela consulta o
      servidor e varre os dois funis.
    </p>

    <div class="flex gap-2.5">
      <div class="flex-1">
        <label :class="LABEL">Tag</label>
        <select v-model="filters.tag" :class="INPUT" @change="emit('change')">
          <option value="">Todas</option>
          <option v-for="tag in tags" :key="tag.label" :value="tag.label">
            {{ tag.title }}
          </option>
        </select>
      </div>
      <div class="flex-1">
        <label :class="LABEL">Flag do lead (Supabase)</label>
        <select
          v-model="filters.flag"
          :class="INPUT"
          :disabled="!leadLookupEnabled || isEnriching"
          @change="emit('flag-change')"
        >
          <option value="">Todas</option>
          <option v-for="f in LEAD_FLAGS" :key="f.key" :value="f.key">
            {{ f.label }}
          </option>
        </select>
        <p v-if="!leadLookupEnabled" class="mt-1 text-[11px] text-n-slate-11">
          Configure o webhook de lead para usar este filtro.
        </p>
      </div>
    </div>

    <div class="flex gap-2.5">
      <div class="flex-1">
        <label :class="LABEL">Criado de</label>
        <input v-model="criadoDe" type="date" :class="INPUT" />
      </div>
      <div class="flex-1">
        <label :class="LABEL">Criado até</label>
        <input v-model="criadoAte" type="date" :class="INPUT" />
      </div>
    </div>

    <div class="flex gap-2.5">
      <div class="flex-1">
        <label :class="LABEL">Atualizado de</label>
        <input v-model="atualDe" type="date" :class="INPUT" />
      </div>
      <div class="flex-1">
        <label :class="LABEL">Atualizado até</label>
        <input v-model="atualAte" type="date" :class="INPUT" />
      </div>
    </div>

    <label class="flex gap-2 items-center mt-3.5 text-xs cursor-pointer text-n-slate-11">
      <input
        v-model="filters.naoLidas"
        type="checkbox"
        class="w-auto"
        @change="emit('change')"
      />
      Somente conversas com mensagem não lida
    </label>

    <p v-if="isFiltered" class="mt-2.5 text-xs text-n-slate-11">
      {{ resultCount }} resultado(s) nas conversas carregadas
    </p>

    <div class="flex gap-2.5 justify-end mt-4">
      <button
        class="px-3 py-1.5 text-sm rounded-lg border border-n-weak text-n-slate-12"
        @click="emit('clear')"
      >
        Limpar
      </button>
      <button
        class="px-3 py-1.5 text-sm text-white rounded-lg bg-n-brand"
        @click="emit('close')"
      >
        Fechar
      </button>
    </div>
  </BaseModal>
</template>
