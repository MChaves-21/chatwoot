/**
 * Disparador — funcoes puras (sem Vue e sem rede), para poderem ser testadas
 * com node. Ver constants.js para o desenho geral.
 */

/**
 * Conversas da API do Chatwoot -> destinatarios da campanha.
 *
 * - descarta conversa com etiqueta da lista `exclude`;
 * - um contato recebe UMA vez: se tiver mais de uma conversa na caixa, fica a
 *   de atividade mais recente;
 * - devolve tambem quantas sairam e por que, para a tela explicar o numero.
 */
export function buildRecipients(conversations, { exclude = [] } = {}) {
  const barradas = new Set(exclude);
  const porContato = new Map();
  let excluidas = 0;
  let semContato = 0;

  conversations.forEach(c => {
    const labels = c.labels || [];
    if (labels.some(l => barradas.has(l))) {
      excluidas += 1;
      return;
    }
    const sender = (c.meta && c.meta.sender) || {};
    const contactId = Number(sender.id) || 0;
    if (!contactId) {
      semContato += 1;
      return;
    }
    const atual = porContato.get(contactId);
    const atividade = Number(c.last_activity_at || c.timestamp || 0);
    if (!atual || atividade > atual.atividade) {
      porContato.set(contactId, {
        atividade,
        conversation_id: Number(c.id),
        contact_id: contactId,
        nome: String(sender.name || '').trim(),
        telefone: String(sender.phone_number || ''),
      });
    }
  });

  const vistas = conversations.length - excluidas - semContato;
  const recipients = [...porContato.values()].map(({ atividade, ...r }) => r);
  return {
    recipients,
    excluidas,
    semContato,
    duplicadas: vistas - recipients.length,
  };
}

/** Primeiro nome com a primeira letra maiuscula, sem o "~" do WhatsApp. */
export function firstName(nome) {
  const limpo = String(nome || '')
    .replace(/^~/, '')
    .trim();
  const p = limpo.split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
}

/** O mesmo que o n8n faz na hora do envio, para a previa bater. */
export function renderText(text, nome) {
  const vars = {
    nome: String(nome || '')
      .replace(/^~/, '')
      .trim(),
    primeiro_nome: firstName(nome),
  };
  return String(text || '').replace(
    /\{\{\s*(nome|primeiro_nome)\s*\}\}/g,
    (_, k) => vars[k] || ''
  );
}

/**
 * Template da Meta como o Chatwoot guarda (inbox.message_templates) -> o que a
 * campanha precisa: corpo e quantos parametros {{n}} ele tem.
 *
 * So templates APROVADOS e sem cabecalho de midia: cabecalho de imagem ou
 * documento pede uma URL por envio, que esta versao nao monta.
 */
export function usableTemplates(templates) {
  return (templates || [])
    .filter(t => String(t.status || '').toLowerCase() === 'approved')
    .map(t => {
      const comps = t.components || [];
      const body = comps.find(c => c.type === 'BODY') || {};
      const header = comps.find(c => c.type === 'HEADER');
      const text = String(body.text || '');
      const nums = [
        ...new Set(
          [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => Number(m[1]))
        ),
      ].sort((a, b) => a - b);
      return {
        key: `${t.name}|${t.language}`,
        name: t.name,
        language: t.language,
        category: t.category,
        namespace: t.namespace || '',
        body_text: text,
        params: nums.map(String),
        mediaHeader: !!(header && header.format && header.format !== 'TEXT'),
      };
    })
    .filter(t => !t.mediaHeader);
}

export function renderTemplate(bodyText, params, nome) {
  return String(bodyText || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) =>
    renderText(params[n] || '', nome)
  );
}

/**
 * Estimativa da duracao, com o intervalo MEDIO. O horario exato de cada envio
 * e sorteado pelo n8n; isto so serve para a tela dizer "termina por volta de".
 * Mesma regra de janela e dias do n8n, em horario de Fortaleza (UTC-3).
 */
export function estimateEnd(count, cfg, startMs = Date.now()) {
  if (!count) return null;
  const OFF = -3 * 3600000;
  const toMin = s => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  const ini = toMin(cfg.janela_inicio);
  const fim = toMin(cfg.janela_fim);
  const dias = (cfg.dias || []).map(Number);
  if (!(ini < fim) || !dias.length) return null;

  const ajusta = t0 => {
    let t = t0;
    for (let g = 0; g < 400; g += 1) {
      const d = new Date(t + OFF);
      const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      const min = d.getUTCHours() * 60 + d.getUTCMinutes();
      const meiaNoite =
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - OFF;
      if (dias.includes(wd) && min >= ini && min < fim) return t;
      if (dias.includes(wd) && min < ini) return meiaNoite + ini * 60000;
      t = meiaNoite + 86400000 + ini * 60000;
    }
    return NaN;
  };

  const passo =
    ((Number(cfg.intervalo_min) + Number(cfg.intervalo_max)) / 2) * 1000;
  const cada = Number(cfg.pausa_a_cada) || 0;
  const pausa = (Number(cfg.pausa_minutos) || 0) * 60000;
  let t = startMs;
  let first = null;
  let last = null;
  for (let i = 0; i < count; i += 1) {
    t = ajusta(t);
    if (Number.isNaN(t)) return null;
    if (first === null) first = t;
    last = t;
    t += passo;
    if (cada > 0 && (i + 1) % cada === 0) t += pausa;
  }
  return { first, last };
}

export function formatDateTime(value, timeZone = 'America/Fortaleza') {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** CSV com ";" e BOM, para o Excel em portugues abrir sem quebrar acento. */
export function toCsv(rows, columns) {
  const esc = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(c => esc(c.label)).join(';');
  const body = rows.map(r => columns.map(c => esc(c.value(r))).join(';'));
  return `\uFEFF${[head, ...body].join('\r\n')}`;
}

/** Soma da contagem por status que o n8n devolve na lista. */
export function progressOf(campanha) {
  const c = campanha.contagem || {};
  const total = Number(campanha.total) || 0;
  const enviados = c.enviado || 0;
  const erros = c.erro || 0;
  const pulados = c.pulado || 0;
  const cancelados = c.cancelado || 0;
  const feitos = enviados + erros + pulados + cancelados;
  return {
    total,
    enviados,
    erros,
    pulados,
    cancelados,
    pendentes: (c.pendente || 0) + (c.reservado || 0),
    pct: total ? Math.round((feitos / total) * 100) : 0,
  };
}
