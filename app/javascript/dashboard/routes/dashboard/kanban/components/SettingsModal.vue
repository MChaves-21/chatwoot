<script setup>
import { ref } from 'vue';
import BaseModal from './BaseModal.vue';

const props = defineProps({
  prefs: { type: Object, required: true },
});

const emit = defineEmits(['close', 'save']);

const INPUT =
  'w-full px-2.5 py-2 text-sm rounded-lg border bg-n-background border-n-weak text-n-slate-12';
const TEXTAREA = `${INPUT} min-h-[150px] font-mono text-xs resize-y`;
const LABEL = 'block mt-3 mb-1 text-xs font-semibold text-n-slate-11';

// Rascunho local: nada e aplicado enquanto o usuario nao salvar.
const status = ref(props.prefs.status || 'all');
const leadUrl = ref(props.prefs.leadUrl || '');
const summaryUrl = ref(props.prefs.summaryUrl || '');
const secret = ref(props.prefs.secret || '');
const columnsText = ref(JSON.stringify(props.prefs.columns || [], null, 2));
const tagsText = ref(JSON.stringify(props.prefs.tags || [], null, 2));
const error = ref('');

const save = () => {
  let columns;
  let tags;
  try {
    columns = JSON.parse(columnsText.value);
    if (!Array.isArray(columns) || !columns.length)
      throw new Error('a lista de colunas não pode ficar vazia');
  } catch (e) {
    error.value = `JSON de colunas inválido: ${e.message}`;
    return;
  }
  try {
    tags = JSON.parse(tagsText.value || '[]');
    if (!Array.isArray(tags)) throw new Error('tags devem ser uma lista');
  } catch (e) {
    error.value = `JSON de tags inválido: ${e.message}`;
    return;
  }
  error.value = '';
  emit('save', {
    status: status.value.trim() || 'all',
    leadUrl: leadUrl.value.trim(),
    summaryUrl: summaryUrl.value.trim(),
    secret: secret.value.trim(),
    columns,
    tags,
  });
};
</script>

<template>
  <BaseModal @close="emit('close')">
    <h2 class="mb-1 text-lg font-semibold text-n-slate-12">Configurações</h2>
    <p class="mb-4 text-xs leading-relaxed text-n-slate-11">
      Não há mais campos de URL, account, token ou proxy: dentro do Chatwoot o
      quadro usa a sessão do agente que está logado. Restam as colunas, as tags
      e os dois webhooks do n8n que continuam externos.
    </p>

    <label :class="LABEL">Status das conversas a incluir</label>
    <input
      v-model="status"
      :class="INPUT"
      placeholder="all (all, open, resolved, pending, snoozed)"
    />

    <label :class="LABEL">Colunas / estágios (JSON: title, label, color)</label>
    <textarea v-model="columnsText" spellcheck="false" :class="TEXTAREA" />

    <label :class="LABEL">Tags do contato (JSON: title, label, color)</label>
    <textarea v-model="tagsText" spellcheck="false" :class="TEXTAREA" />

    <div class="p-3 mt-4 rounded-lg border border-n-weak bg-n-alpha-2">
      <p class="mb-1 text-xs font-semibold text-n-slate-12">
        Webhooks n8n (opcionais)
      </p>
      <p class="text-[11px] leading-relaxed text-n-slate-11">
        Estes dois não passam pela API do Chatwoot. O segredo abaixo fica
        guardado neste navegador e alcança apenas eles — use um valor
        diferente do antigo segredo do proxy, que deve ser rotacionado.
      </p>

      <label :class="LABEL">Consulta de lead no Supabase</label>
      <input
        v-model="leadUrl"
        :class="INPUT"
        placeholder="https://n8n.goncalvesesilva.cloud/webhook/kanban-lead"
      />

      <label :class="LABEL">Resumo por IA (se vazio, usa o resumo automático)</label>
      <input
        v-model="summaryUrl"
        :class="INPUT"
        placeholder="https://n8n.goncalvesesilva.cloud/webhook/kanban-resumo"
      />

      <label :class="LABEL">Segredo destes dois webhooks</label>
      <input v-model="secret" :class="INPUT" type="password" autocomplete="off" />
    </div>

    <p v-if="error" class="mt-3 text-xs" style="color: #ef4444">{{ error }}</p>

    <div class="flex gap-2.5 justify-end mt-4">
      <button
        class="px-3 py-1.5 text-sm rounded-lg border border-n-weak text-n-slate-12"
        @click="emit('close')"
      >
        Cancelar
      </button>
      <button
        class="px-3 py-1.5 text-sm text-white rounded-lg bg-n-brand"
        @click="save"
      >
        Salvar e carregar
      </button>
    </div>
  </BaseModal>
</template>
