<script setup>
import { computed } from 'vue';
import BaseBubble from './Base.vue';
import AudioChip from 'next/message/chips/Audio.vue';
import { useMessageContext } from '../provider.js';

const { attachments, id, conversationId } = useMessageContext();

const attachment = computed(() => {
  return attachments.value[0];
});
</script>

<template>
  <BaseBubble class="bg-transparent" data-bubble-name="audio">
    <!-- Fork G&S 23/11/2026: player um pouco maior e botao de transcrever. -->
    <AudioChip
      :attachment="attachment"
      :message-id="id"
      :conversation-id="conversationId"
      allow-transcribe
      class="p-2 text-n-slate-12 skip-context-menu min-w-[17rem] md:min-w-[21rem]"
    />
  </BaseBubble>
</template>
