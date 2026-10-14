<script setup>
/**
 * Enviar para um numero — 14/10/2026.
 *
 * Para quem pensa em telefone, nao em conversa: digita o numero, a tela acha o
 * contato e as conversas dele no Chatwoot, a pessoa escolhe por qual caixa sai
 * e escreve.
 *
 * - "Enviar agora" posta direto na conversa com a sessao do atendente (igual a
 *   digitar na conversa). Nao passa pelo n8n.
 * - "Agendar" cria uma campanha de um destinatario no n8n, que manda na hora.
 *
 * So numeros que JA tem conversa no Chatwoot. Criar conversa daqui dispararia
 * o que escuta `conversation_created` (o video do BPC na caixa 15) e, nas
 * caixas da uazapi, exige o formato de contato da uazapi. Para numero novo, a
 * tela manda usar o "Nova conversa" do proprio Chatwoot.
 */
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useMapGetter } from 'dashboard/composables/store';
import {
  callDisparador,
  contactConversations,
  searchContacts,
  sendNow,
} from '../api';
import { SINGLE_CONFIG, TIME_ZONE, VARIABLES } from '../constants';
import {
  conversationOptions,
  formatDateTime,
  formatPhone,
  phoneSearchKey,
  renderTemplate,
  renderText,
  samePhone,
  templateMessageBody,
} from '../helpers';

const emit = defineEmits(['back', 'scheduled']);

const route = useRoute();
const inboxes = useMapGetter('inboxes/getInboxes');

const INPUT =
  'px-3 h-11 w-full text-base rounded-lg border outline-none border-n-weak bg-n-solid-1 text-n-slate-12 focus:border-n-brand';
const CARD =
  'flex flex-col gap-3 p-5 rounded-xl border border-n-weak bg-n-solid-1';
const BTN =
  'inline-flex gap-2 justify-center items-center px-4 h-11 text-sm font-medium rounded-lg transition-colors disabled:opacity-50';
const STEP_NUM =
  'flex justify-center items-center text-xs font-semibold rounded-full size-6 bg-n-brand text-white';

// ------------------------------------------------------------ 1. o numero
const phone = ref('');
const searching = ref(false);
const searchError = ref('');
const searched = ref(false);
const contact = ref(null);
const options = ref([]);

const phoneValid = computed(() => !!phoneSearchKey(phone.value));

async function find() {
  searchError.value = '';
  searched.value = false;
  contact.value = null;
  options.value = [];
  if (!phoneValid.value) {
    searchError.value =
      'Não entendi o número. Digite com DDD, por exemplo (85) 99999-9999.';
    return;
  }
  searching.value = true;
  try {
    const found = (await searchContacts(phoneSearchKey(phone.value))).filter(
      c => samePhone(c.phone_number, phone.value)
    );
    // Mesmo numero em dois cadastros acontece (ver migracao do BPC): junta as
    // conversas de todos e fica uma por caixa.
    const convs = (
      await Promise.all(found.map(c => contactConversations(c.id)))
    ).flat();
    contact.value = found[0] || null;
    options.value = conversationOptions(convs, inboxes.value).map(o => ({
      ...o,
      contact_id: (
        convs.find(c => Number(c.id) === o.conversation_id)?.meta?.sender || {}
      ).id,
    }));
    searched.value = true;
  } catch (e) {
    searchError.value = 'Não consegui procurar agora. Tente de novo.';
  } finally {
    searching.value = false;
  }
}

// --------------------------------------------------------------- 2. a caixa
const chosenId = ref(null);
watch(options, list => {
  chosenId.value = list.length ? list[0].conversation_id : null;
});
const chosen = computed(
  () => options.value.find(o => o.conversation_id === chosenId.value) || null
);
const contactName = computed(() =>
  String((contact.value && contact.value.name) || '')
    .replace(/^~/, '')
    .trim()
);

// ------------------------------------------------------------ 3. a mensagem
const texto = ref('');
const templateKey = ref('');
const templateParams = ref({});
const useTemplate = computed(() => chosen.value && !chosen.value.textoLivre);
const template = computed(() =>
  chosen.value
    ? chosen.value.templates.find(t => t.key === templateKey.value) || null
    : null
);
watch(chosenId, () => {
  templateKey.value = '';
});
watch(template, t => {
  const p = {};
  (t ? t.params : []).forEach((n, i) => {
    p[n] = i === 0 ? '{{primeiro_nome}}' : '';
  });
  templateParams.value = p;
});

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
const paramLabel = n => `{{${n}}}`;

const preview = computed(() => {
  if (useTemplate.value) {
    return template.value
      ? renderTemplate(
          template.value.body_text,
          templateParams.value,
          contactName.value
        )
      : '';
  }
  return renderText(texto.value, contactName.value);
});

// -------------------------------------------------------------- 4. quando
const when = ref('now');
const scheduleAt = ref('');
const scheduleMs = computed(() =>
  scheduleAt.value ? Date.parse(`${scheduleAt.value}:00-03:00`) : NaN
);

const problem = computed(() => {
  if (!chosen.value) return 'Escolha por qual caixa a mensagem vai sair.';
  if (useTemplate.value) {
    if (!chosen.value.templates.length)
      return 'Esta caixa não tem mensagem aprovada cadastrada.';
    if (!template.value) return 'Escolha a mensagem aprovada.';
    if (template.value.params.some(n => !templateParams.value[n]))
      return 'Preencha os campos da mensagem aprovada.';
  } else if (!texto.value.trim()) return 'Escreva a mensagem.';
  if (when.value === 'later') {
    if (Number.isNaN(scheduleMs.value)) return 'Escolha o dia e a hora.';
    if (scheduleMs.value < Date.now() + 60000)
      return 'O horário agendado já passou.';
  }
  return '';
});

// ------------------------------------------------------------------ enviar
const sending = ref(false);
const sendError = ref('');
const done = ref(null);

function messageBody() {
  if (useTemplate.value) {
    return templateMessageBody(
      template.value,
      templateParams.value,
      contactName.value
    );
  }
  return {
    content: renderText(texto.value, contactName.value),
    message_type: 'outgoing',
  };
}

async function send() {
  if (problem.value || sending.value) return;
  sending.value = true;
  sendError.value = '';
  const o = chosen.value;
  try {
    if (when.value === 'now') {
      await sendNow(o.conversation_id, messageBody());
      done.value = { kind: 'now' };
    } else {
      const t = template.value;
      const res = await callDisparador('criar', {
        campanha: {
          nome: `Mensagem para ${contactName.value || formatPhone(phone.value)}`,
          inbox_id: o.inbox_id,
          inbox_nome: o.inbox_nome,
          tipo_mensagem: useTemplate.value ? 'template' : 'texto',
          conteudo: useTemplate.value ? '' : texto.value,
          template: useTemplate.value
            ? {
                name: t.name,
                language: t.language,
                category: t.category,
                namespace: t.namespace,
                body_text: t.body_text,
                params: { ...templateParams.value },
              }
            : null,
          config: { ...SINGLE_CONFIG },
          inicio_em: new Date(scheduleMs.value).toISOString(),
          filtro: { excluir: [] },
        },
        destinatarios: [
          {
            conversation_id: o.conversation_id,
            contact_id: o.contact_id || (contact.value && contact.value.id),
            nome: contactName.value,
            telefone: (contact.value && contact.value.phone_number) || '',
          },
        ],
      });
      done.value = { kind: 'later', campanhaId: res.campanha_id };
      emit('scheduled', res.campanha_id);
    }
  } catch (e) {
    const msg =
      (e.response && e.response.data && e.response.data.error) || e.message;
    sendError.value = `Não foi enviada: ${msg}`;
  } finally {
    sending.value = false;
  }
}

function conversationUrl(id) {
  return `/app/accounts/${route.params.accountId}/conversations/${id}`;
}

function reset() {
  done.value = null;
  texto.value = '';
  templateKey.value = '';
  when.value = 'now';
  scheduleAt.value = '';
}
</script>

<template>
  <div class="flex flex-col gap-4 max-w-2xl">
    <button
      class="inline-flex gap-1 items-center self-start text-sm text-n-slate-11 hover:text-n-slate-12"
      @click="emit('back')"
    >
      <span class="i-lucide-arrow-left size-4" /> Voltar
    </button>

    <!-- Pronto -->
    <div v-if="done" :class="CARD" class="items-start">
      <span class="i-lucide-circle-check-big size-8 text-n-teal-11" />
      <h2 class="text-lg font-semibold text-n-slate-12">
        {{ done.kind === 'now' ? 'Mensagem enviada' : 'Mensagem agendada' }}
      </h2>
      <p class="text-sm text-n-slate-11">
        <template v-if="done.kind === 'now'">
          Ela já está na conversa de {{ contactName || formatPhone(phone) }}
          pela caixa {{ chosen.inbox_nome }}.
        </template>
        <template v-else>
          Sai em {{ formatDateTime(scheduleMs, TIME_ZONE) }} pela caixa
          {{ chosen.inbox_nome }}. Dá para acompanhar ou cancelar na lista de
          envios.
        </template>
      </p>
      <div class="flex flex-wrap gap-2">
        <a
          :href="conversationUrl(chosen.conversation_id)"
          :class="BTN"
          class="border border-n-weak text-n-slate-12 hover:bg-n-alpha-1"
        >
          <span class="i-lucide-message-circle size-4" /> Abrir a conversa
        </a>
        <button
          :class="BTN"
          class="text-n-slate-11 hover:bg-n-alpha-1"
          @click="reset"
        >
          Mandar outra para essa pessoa
        </button>
      </div>
    </div>

    <template v-else>
      <!-- 1. Numero -->
      <section :class="CARD">
        <div class="flex gap-2 items-center">
          <span :class="STEP_NUM">1</span>
          <h2 class="text-base font-semibold text-n-slate-12">
            Para qual número?
          </h2>
        </div>
        <div class="flex gap-2">
          <input
            v-model="phone"
            :class="INPUT"
            inputmode="tel"
            placeholder="(85) 99999-9999"
            @keydown.enter.prevent="find"
          />
          <button
            :class="BTN"
            class="text-white shrink-0 bg-n-brand hover:opacity-90"
            :disabled="searching || !phone.trim()"
            @click="find"
          >
            <span
              class="i-lucide-search size-4"
              :class="searching ? 'animate-pulse' : ''"
            />
            {{ searching ? 'Procurando…' : 'Procurar' }}
          </button>
        </div>
        <p v-if="searchError" class="text-sm text-n-ruby-11">
          {{ searchError }}
        </p>

        <template v-if="searched">
          <div
            v-if="!contact"
            class="p-3 text-sm rounded-lg bg-n-amber-3 text-n-amber-11"
          >
            Esse número ainda não está no Chatwoot. Para falar com um número
            novo, use o botão <strong>Nova conversa</strong> do Chatwoot (na
            lista de conversas).
          </div>
          <div
            v-else-if="!options.length"
            class="p-3 text-sm rounded-lg bg-n-amber-3 text-n-amber-11"
          >
            Achei {{ contactName || 'o contato' }}, mas ainda não há nenhuma
            conversa com ele. Abra o contato no Chatwoot e use
            <strong>Nova conversa</strong>.
          </div>
          <p v-else class="text-sm text-n-slate-12">
            <span class="i-lucide-user-round-check size-4 text-n-teal-11" />
            <strong>{{ contactName || 'Sem nome' }}</strong>
            <span class="text-n-slate-11">
              · {{ formatPhone(contact.phone_number) }}</span
            >
          </p>
        </template>
      </section>

      <template v-if="options.length">
        <!-- 2. Caixa -->
        <section :class="CARD">
          <div class="flex gap-2 items-center">
            <span :class="STEP_NUM">2</span>
            <h2 class="text-base font-semibold text-n-slate-12">
              Por qual WhatsApp vai sair?
            </h2>
          </div>
          <label
            v-for="o in options"
            :key="o.conversation_id"
            class="flex gap-3 items-start p-3 rounded-lg border cursor-pointer"
            :class="
              chosenId === o.conversation_id
                ? 'border-n-brand bg-n-brand/10'
                : 'border-n-weak hover:bg-n-alpha-1'
            "
          >
            <input
              v-model="chosenId"
              type="radio"
              class="mt-1"
              :value="o.conversation_id"
            />
            <span class="flex flex-col">
              <span class="text-sm font-medium text-n-slate-12">
                {{ o.inbox_nome }}
              </span>
              <span class="text-xs text-n-slate-11">
                Última conversa em
                {{ formatDateTime(o.last_activity_at * 1000, TIME_ZONE) }}
                <template v-if="o.oficial">
                  · WhatsApp oficial
                  <template v-if="!o.textoLivre">
                    · sem resposta do cliente há mais de 24h
                  </template>
                </template>
              </span>
            </span>
          </label>
        </section>

        <!-- 3. Mensagem -->
        <section :class="CARD">
          <div class="flex gap-2 items-center">
            <span :class="STEP_NUM">3</span>
            <h2 class="text-base font-semibold text-n-slate-12">
              O que vai escrever?
            </h2>
          </div>

          <template v-if="useTemplate">
            <p class="text-sm text-n-slate-11">
              Pelo WhatsApp oficial, quando o cliente não fala com vocês há
              mais de 24 horas, só dá para mandar uma
              <strong>mensagem aprovada pela Meta</strong>.
            </p>
            <p
              v-if="!chosen.templates.length"
              class="p-3 text-sm rounded-lg bg-n-amber-3 text-n-amber-11"
            >
              Esta caixa ainda não tem mensagem aprovada cadastrada no
              Chatwoot. Peça para o administrador sincronizar os templates da
              caixa.
            </p>
            <template v-else>
              <select
                v-model="templateKey"
                :class="INPUT"
                class="text-sm"
              >
                <option value="" disabled>Escolha a mensagem aprovada…</option>
                <option
                  v-for="t in chosen.templates"
                  :key="t.key"
                  :value="t.key"
                >
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
                <input
                  v-model="templateParams[n]"
                  :class="INPUT"
                  class="text-sm"
                />
              </label>
            </template>
          </template>

          <template v-else>
            <textarea
              ref="textArea"
              v-model="texto"
              rows="5"
              class="p-3 w-full text-base rounded-lg border outline-none resize-y border-n-weak bg-n-solid-1 text-n-slate-12 focus:border-n-brand"
              placeholder="Escreva aqui a mensagem…"
            />
            <div class="flex flex-wrap gap-2 items-center">
              <span class="text-xs text-n-slate-11">Colocar na mensagem:</span>
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
            <span class="text-xs text-n-slate-11">Como a pessoa vai ver:</span>
            <div
              class="self-end p-3 max-w-md text-sm whitespace-pre-wrap rounded-xl rounded-br-sm bg-n-teal-3 text-n-slate-12"
            >
              {{ preview }}
            </div>
          </div>
        </section>

        <!-- 4. Quando -->
        <section :class="CARD">
          <div class="flex gap-2 items-center">
            <span :class="STEP_NUM">4</span>
            <h2 class="text-base font-semibold text-n-slate-12">Quando?</h2>
          </div>
          <div class="flex flex-wrap gap-4 text-sm text-n-slate-12">
            <label class="flex gap-2 items-center">
              <input v-model="when" type="radio" value="now" /> Agora
            </label>
            <label class="flex gap-2 items-center">
              <input v-model="when" type="radio" value="later" /> Agendar
            </label>
            <input
              v-if="when === 'later'"
              v-model="scheduleAt"
              type="datetime-local"
              class="px-3 h-9 text-sm rounded-lg border outline-none border-n-weak bg-n-solid-1 text-n-slate-12"
            />
          </div>
        </section>

        <div class="flex flex-wrap gap-3 justify-between items-center pb-6">
          <span
            class="text-sm"
            :class="problem ? 'text-n-slate-11' : 'text-n-teal-11'"
          >
            {{ problem || 'Tudo certo.' }}
          </span>
          <button
            :class="BTN"
            class="text-white bg-n-brand hover:opacity-90"
            :disabled="!!problem || sending"
            @click="send"
          >
            <span class="i-lucide-send size-4" />
            {{
              sending
                ? 'Enviando…'
                : when === 'now'
                  ? 'Enviar agora'
                  : 'Agendar mensagem'
            }}
          </button>
        </div>
        <p v-if="sendError" class="-mt-4 text-sm text-n-ruby-11">
          {{ sendError }}
        </p>
      </template>
    </template>
  </div>
</template>
