<script setup>
/**
 * Disparador — lista de campanhas, criacao e acompanhamento.
 * Desenho geral e regras em constants.js.
 *
 * A tela troca entre tres modos sem rota propria (lista, nova, detalhe): o
 * estado cabe aqui e o "voltar" do navegador continua levando para fora da
 * tela, como no Kanban.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { callDisparador } from './api';
import { CAMPAIGN_STATUS, REFRESH_MS, TIME_ZONE } from './constants';
import { formatDateTime, progressOf } from './helpers';
import CampaignForm from './components/CampaignForm.vue';
import CampaignDetail from './components/CampaignDetail.vue';
import SingleSend from './components/SingleSend.vue';
import StatusPill from './components/StatusPill.vue';

const mode = ref('list');
const TITLES = {
  list: 'O que você quer fazer?',
  single: 'Mandar para uma pessoa',
  form: 'Mandar para várias pessoas',
};
const selectedId = ref(null);

const campanhas = ref([]);
const loading = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  try {
    const r = await callDisparador('listar');
    campanhas.value = r.campanhas || [];
    error.value = '';
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

const hasActive = computed(() =>
  campanhas.value.some(c => c.status === 'agendada')
);

let timer = null;
onMounted(() => {
  load();
  timer = setInterval(() => {
    if (mode.value === 'list' && hasActive.value) load();
  }, REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));

function open(id) {
  selectedId.value = Number(id);
  mode.value = 'detail';
}
function backToList() {
  mode.value = 'list';
  selectedId.value = null;
  load();
}
function onCreated(id) {
  load();
  open(id);
}
</script>

<template>
  <div class="flex flex-col w-full h-full bg-n-background">
    <div class="overflow-y-auto flex-1">
      <div class="flex flex-col gap-5 px-6 py-5 mx-auto max-w-[1200px]">
        <header
          v-if="mode !== 'detail'"
          class="flex flex-wrap gap-4 justify-between items-end"
        >
          <div>
            <p
              class="text-[11px] font-semibold tracking-[0.14em] uppercase text-n-brand"
            >
              Disparador
            </p>
            <h1
              class="mt-1 text-2xl font-semibold tracking-tight text-n-slate-12"
            >
              {{ TITLES[mode] }}
            </h1>
          </div>
        </header>

        <!-- O que voce quer fazer? -->
        <div
          v-if="mode === 'list'"
          class="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          <button
            class="flex gap-4 items-start p-5 text-left rounded-xl border transition-colors border-n-weak bg-n-solid-1 hover:border-n-brand hover:bg-n-brand/5"
            @click="mode = 'single'"
          >
            <span
              class="flex justify-center items-center rounded-full size-11 shrink-0 bg-n-brand/10"
            >
              <span class="i-lucide-user-round size-5 text-n-brand" />
            </span>
            <span class="flex flex-col gap-1">
              <span class="text-base font-semibold text-n-slate-12">
                Mandar para uma pessoa
              </span>
              <span class="text-sm text-n-slate-11">
                Digite o número, escolha o WhatsApp e escreva. Pode mandar na
                hora ou agendar.
              </span>
            </span>
          </button>
          <button
            class="flex gap-4 items-start p-5 text-left rounded-xl border transition-colors border-n-weak bg-n-solid-1 hover:border-n-brand hover:bg-n-brand/5"
            @click="mode = 'form'"
          >
            <span
              class="flex justify-center items-center rounded-full size-11 shrink-0 bg-n-brand/10"
            >
              <span class="i-lucide-users-round size-5 text-n-brand" />
            </span>
            <span class="flex flex-col gap-1">
              <span class="text-base font-semibold text-n-slate-12">
                Mandar para várias pessoas
              </span>
              <span class="text-sm text-n-slate-11">
                Escolha quem recebe (por etapa do Kanban, por exemplo). As
                mensagens saem aos poucos, sozinhas.
              </span>
            </span>
          </button>
        </div>

        <h2
          v-if="mode === 'list' && campanhas.length"
          class="pt-2 text-sm font-semibold text-n-slate-12"
        >
          Envios feitos e agendados
        </h2>

        <SingleSend
          v-if="mode === 'single'"
          @back="backToList"
          @scheduled="load"
        />

        <CampaignForm
          v-else-if="mode === 'form'"
          @created="onCreated"
          @cancel="mode = 'list'"
        />

        <CampaignDetail
          v-else-if="mode === 'detail' && selectedId"
          :key="selectedId"
          :campanha-id="selectedId"
          @back="backToList"
          @changed="load"
          @deleted="backToList"
        />

        <template v-else>
          <p v-if="error" class="text-sm text-n-ruby-11">{{ error }}</p>
          <p
            v-else-if="!loading && !campanhas.length"
            class="p-6 text-sm text-center rounded-xl border border-dashed border-n-weak text-n-slate-11"
          >
            Nenhum envio ainda. Escolha uma das opções acima para começar.
          </p>

          <div
            v-if="campanhas.length"
            class="overflow-x-auto rounded-xl border border-n-weak"
          >
            <table class="w-full text-sm">
              <thead class="text-xs text-left text-n-slate-10 bg-n-alpha-1">
                <tr>
                  <th class="px-3 py-2 font-medium">Nome</th>
                  <th class="px-3 py-2 font-medium">WhatsApp</th>
                  <th class="px-3 py-2 font-medium">Status</th>
                  <th class="px-3 py-2 font-medium w-56">Progresso</th>
                  <th class="px-3 py-2 font-medium">Começa</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="c in campanhas"
                  :key="c.id"
                  class="border-t cursor-pointer border-n-weak hover:bg-n-alpha-1"
                  @click="open(c.id)"
                >
                  <td class="px-3 py-2">
                    <span class="font-medium text-n-slate-12">{{ c.nome }}</span>
                    <span class="block text-xs text-n-slate-10">
                      {{ c.criado_por }}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-n-slate-11">{{ c.inbox_nome }}</td>
                  <td class="px-3 py-2">
                    <StatusPill :status="c.status" :map="CAMPAIGN_STATUS" />
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex flex-col gap-1">
                      <span
                        class="overflow-hidden h-1.5 rounded-full bg-n-alpha-2"
                      >
                        <span
                          class="block h-full rounded-full bg-n-brand"
                          :style="{ width: `${progressOf(c).pct}%` }"
                        />
                      </span>
                      <span class="text-xs text-n-slate-11">
                        {{ progressOf(c).enviados }} de {{ progressOf(c).total }}
                        enviadas
                        <template v-if="progressOf(c).erros">
                          · {{ progressOf(c).erros }} erro(s)
                        </template>
                        <template v-if="progressOf(c).pulados">
                          · {{ progressOf(c).pulados }} pulada(s)
                        </template>
                      </span>
                    </div>
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap text-n-slate-11">
                    {{ formatDateTime(c.inicio_em, TIME_ZONE) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
