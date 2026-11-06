<script setup>
import { computed } from 'vue';
import {
  convCreatedRaw,
  convDisplayName,
  convLabels,
  convPhone,
} from '../helpers';

/**
 * Card do funil de etiqueta.
 *
 * A prop `draggable` foi removida em 10/08/2026: existia porque o quadro por
 * estado reusava este card em modo somente leitura, e aquele quadro virou
 * tabela. Este componente agora atende um caso so — sempre arrastavel.
 */
const props = defineProps({
  conversation: { type: Object, required: true },
  tags: { type: Array, default: () => [] },
  conversationUrl: { type: String, required: true },
  isDragging: { type: Boolean, default: false },
});

const emit = defineEmits(['open', 'dragstart', 'dragend']);

const name = computed(() => convDisplayName(props.conversation));
const phone = computed(() => convPhone(props.conversation));
const unread = computed(() => props.conversation.unread_count || 0);
/**
 * Telefone legivel: (85) 98403-5779. Sem o +55, que era igual em todo card e
 * fazia o numero ser cortado na linha. O numero cru (com +55) fica no title.
 * Numero fora do padrao BR passa direto.
 */
const phoneShown = computed(() => {
  const digits = phone.value.replace(/\D/g, '');
  const m = digits.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone.value;
});

/**
 * Data curta: "06/11 16:18" no ano corrente, "12/08/25 17:09" fora dele. O ano
 * repetido em todo card era ruido; a data completa fica no title.
 */
const createdDate = computed(() => {
  const v = convCreatedRaw(props.conversation);
  if (v === null || v === undefined) return null;
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
});

const createdShort = computed(() => {
  const d = createdDate.value;
  if (!d) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    ...(sameYear ? {} : { year: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(d)
    .replace(',', '');
});

const createdFull = computed(() =>
  createdDate.value
    ? `Criada em ${new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(createdDate.value)}`
    : ''
);

/** Só as etiquetas configuradas como tag viram chip; etapas ficam de fora. */
const shownTags = computed(() => {
  const applied = convLabels(props.conversation);
  return props.tags.filter(t => applied.includes(t.label));
});

// O navegador dispara click logo depois de dragend. Sem esta guarda, soltar
// um card abre o popup do contato — era o justDragged do arquivo original.
let justDragged = false;

const onDragStart = event => {
  event.dataTransfer.effectAllowed = 'move';
  emit('dragstart');
};

const onDragEnd = () => {
  justDragged = true;
  setTimeout(() => {
    justDragged = false;
  }, 60);
  emit('dragend');
};

const onClick = () => {
  if (justDragged) return;
  emit('open');
};

// 05/11/2026: o card recebe foco pelo Tab e abre com Enter ou espaco. Arrastar
// continua so com o mouse; pelo teclado, a etapa muda dentro do popup.
const unreadLabel = computed(() =>
  unread.value === 1
    ? '1 mensagem não lida'
    : `${unread.value} mensagens não lidas`
);
</script>

<template>
  <!--
    Card compacto — 06/11/2026. Duas linhas em vez de tres: nome e nao lidas em
    cima; telefone, #id e data embaixo. Cabem ~6 cards por coluna na tela
    (antes ~4). O link "abrir" virou icone: repetido em centenas de cards, o
    texto azul competia com o nome. Clique no card abre o popup; o icone abre a
    conversa em nova aba, como antes.
  -->
  <div
    class="px-2.5 py-2 rounded-lg border transition-colors select-none cursor-grab active:cursor-grabbing bg-n-background border-n-weak hover:border-n-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-n-brand"
    :class="isDragging ? 'opacity-40' : ''"
    role="button"
    tabindex="0"
    draggable="true"
    :aria-label="`${name}, conversa ${conversation.id}`"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @click="onClick"
    @keydown.enter.prevent="onClick"
    @keydown.space.prevent="onClick"
  >
    <div class="flex gap-1.5 items-center">
      <span
        class="flex-1 min-w-0 text-sm font-semibold truncate text-n-slate-12"
        :title="name"
      >
        {{ name }}
      </span>
      <span
        v-if="unread"
        class="px-1.5 text-[11px] font-bold leading-4 text-center text-white rounded-full tabular-nums shrink-0 min-w-4 bg-n-ruby-9"
        :aria-label="unreadLabel"
      >
        {{ unread }}
      </span>
      <a
        :href="conversationUrl"
        target="_blank"
        rel="noopener"
        draggable="false"
        class="flex justify-center items-center -my-1 -mr-1 rounded transition-colors shrink-0 size-6 text-n-slate-10 hover:text-n-brand hover:bg-n-alpha-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-n-brand"
        title="Abrir conversa em nova aba"
        :aria-label="`Abrir conversa ${conversation.id} em nova aba`"
        @click.stop
        @keydown.stop
      >
        <span class="i-lucide-external-link size-3.5" aria-hidden="true" />
      </a>
    </div>

    <div
      class="flex gap-2 items-baseline mt-0.5 text-[11px] tabular-nums text-n-slate-11"
    >
      <span v-if="phone" class="min-w-0 truncate" :title="phone">
        {{ phoneShown }}
      </span>
      <span class="ml-auto shrink-0 text-n-slate-10">#{{ conversation.id }}</span>
      <span class="shrink-0" :title="createdFull">{{ createdShort }}</span>
    </div>

    <div v-if="shownTags.length" class="flex flex-wrap gap-1 mt-1.5">
      <span
        v-for="tag in shownTags"
        :key="tag.label"
        class="px-2 text-[10px] font-bold text-white rounded-full"
        :style="{ backgroundColor: tag.color }"
      >
        {{ tag.title }}
      </span>
    </div>
  </div>
</template>
