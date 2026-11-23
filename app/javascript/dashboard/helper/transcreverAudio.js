/**
 * Botao "Transcrever" do player de audio (fork Goncalves & Silva) - 23/11/2026.
 *
 * Chama o webhook do n8n `transcrever-audio` com o ticket assinado
 * (finalidade `transcrever_audio`). O n8n confere o ticket e o acesso a
 * caixa, reaproveita a transcricao se ja existir a nota privada
 * "🎙️ Transcrição do áudio #<id>", senao transcreve e grava a nota.
 *
 * Devolve { ok: true, text } ou { ok: false, error } - quem chama mostra o
 * erro ao atendente (nada de falha silenciosa).
 */
import { n8nTicket } from 'dashboard/routes/dashboard/n8nTicket';

export const TRANSCREVER_AUDIO_WEBHOOK_URL =
  'https://n8n.goncalvesesilva.cloud/webhook/transcrever-audio';

// Prefixo da nota privada que o n8n grava (fluxo Eventos auxiliares e este botao).
export const NOTA_TRANSCRICAO_PREFIXO = '🎙️ Transcrição do áudio #';

/** Texto da nota de transcricao do audio `messageId`, ou '' se nao houver. */
export function transcricaoDaNota(messages = [], messageId = null) {
  if (!messageId) return '';
  // Confere so a 1a linha, sem depender do emoji (com ou sem U+FE0F).
  const cabecalho = new RegExp(`Transcrição do áudio #${messageId}(?!\\d)`);
  const nota = [...messages]
    .reverse()
    .find(
      m =>
        m.private &&
        typeof m.content === 'string' &&
        cabecalho.test(m.content.split('\n')[0])
    );
  if (!nota) return '';
  return nota.content.split('\n').slice(1).join('\n').trim();
}

export async function transcreverAudio({ conversationId, messageId }) {
  if (!conversationId || !messageId) {
    return { ok: false, error: 'Áudio sem identificação.' };
  }
  const ctrl = new AbortController();
  // Audio longo + modelo de transcricao: ate ~1 min.
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const ticket = await n8nTicket('transcrever_audio');
    if (!ticket) return { ok: false, error: 'Sem permissão para transcrever.' };
    const r = await fetch(TRANSCREVER_AUDIO_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket,
        conversation_id: conversationId,
        message_id: messageId,
      }),
      signal: ctrl.signal,
    });
    let d = {};
    try {
      d = await r.json();
    } catch (e) {
      d = {};
    }
    if (Array.isArray(d)) d = d[0] || {};
    if (!r.ok || !d.text) {
      return { ok: false, error: d.error || 'Não foi possível transcrever.' };
    }
    return { ok: true, text: String(d.text) };
  } catch (e) {
    return {
      ok: false,
      error:
        e && e.name === 'AbortError'
          ? 'A transcrição demorou demais. Tente de novo.'
          : 'Não foi possível transcrever.',
    };
  } finally {
    clearTimeout(timer);
  }
}
