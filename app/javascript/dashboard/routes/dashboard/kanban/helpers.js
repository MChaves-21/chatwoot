/**
 * Kanban Comercial — funcoes puras.
 *
 * Nenhuma delas toca no DOM nem faz requisicao: da para testar sem montar
 * componente. A funcao esc() do arquivo original nao foi portada — o Vue
 * escapa por padrao, e era ela que segurava o XSS na versao com innerHTML.
 */

import {
  STAGE_EMOJI,
  STATUS_LABELS,
  LEAD_FLAGS,
  UNSTAGED_LABEL,
} from './constants';

// ---------------------------------------------------------------- primitivas

export function isTrue(v) {
  return v === true || v === 'true' || v === 't' || v === 1 || v === '1';
}

export function toMs(v) {
  if (v === null || v === undefined) return null;
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function trim1(t, max = 180) {
  const s = String(t || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

// -------------------------------------------------------------- conversa

export function convSender(conv) {
  return (conv && conv.meta && conv.meta.sender) || {};
}

export function convPhone(conv) {
  return (convSender(conv).phone_number || '').trim();
}

export function convName(conv) {
  const sn = convSender(conv);
  return sn.name || sn.phone_number || `Conversa #${conv.id}`;
}

/** Nome sem os til que o WhatsApp prefixa em contatos sem agenda. */
export function convDisplayName(conv) {
  return convName(conv).replace(/^~+/, '');
}

export function convAssignee(conv) {
  return (
    (conv && conv.meta && conv.meta.assignee && conv.meta.assignee.name) || ''
  );
}

export function convCreatedRaw(conv) {
  return conv.created_at !== null && conv.created_at !== undefined
    ? conv.created_at
    : conv.timestamp;
}

export function convUpdatedRaw(conv) {
  if (conv.last_activity_at !== null && conv.last_activity_at !== undefined)
    return conv.last_activity_at;
  if (conv.timestamp !== null && conv.timestamp !== undefined)
    return conv.timestamp;
  return conv.created_at;
}

export function convCreatedMs(conv) {
  return toMs(convCreatedRaw(conv));
}

export function convUpdatedMs(conv) {
  return toMs(convUpdatedRaw(conv));
}

export function convLabels(conv) {
  return Array.isArray(conv && conv.labels) ? conv.labels : [];
}

/** Em qual etapa do funil a conversa esta, dado o conjunto de colunas. */
export function convStageLabel(conv, stageLabels) {
  return convLabels(conv).find(l => stageLabels.includes(l)) || null;
}

export function situacaoBR(status) {
  return STATUS_LABELS[status] || 'Em andamento';
}

// ------------------------------------------------------------------- datas

export function fmtDate(v) {
  if (v === null || v === undefined) return '';
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Data completa no fuso de Sao Paulo, para o Excel. */
export function fmtBR(sec) {
  if (sec === null || sec === undefined) return '';
  const dt = typeof sec === 'number' ? new Date(sec * 1000) : new Date(sec);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(dt)
    .replace(',', '');
}

export function isoSP(sec) {
  if (sec === null || sec === undefined) return '';
  const dt = typeof sec === 'number' ? new Date(sec * 1000) : new Date(sec);
  if (Number.isNaN(dt.getTime())) return '';
  const p = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(dt)
    .forEach(x => {
      p[x.type] = x.value;
    });
  const ms = String(dt.getUTCMilliseconds()).padStart(3, '0');
  const hh = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hh}:${p.minute}:${p.second}.${ms}-03:00`;
}

/** YYYY-MM-DD no fuso de Sao Paulo. */
export function ymdSP(dt) {
  if (Number.isNaN(dt.getTime())) return '';
  const p = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(dt)
    .forEach(x => {
      p[x.type] = x.value;
    });
  return `${p.year}-${p.month}-${p.day}`;
}

export function todaySP() {
  return ymdSP(new Date());
}

export function dateStrSP(sec) {
  if (sec === null || sec === undefined) return '';
  const dt = typeof sec === 'number' ? new Date(sec * 1000) : new Date(sec);
  return ymdSP(dt);
}

/**
 * Soma dias a uma string YYYY-MM-DD sem passar por UTC. Fazer isso via
 * Date.parse desloca um dia perto da meia-noite.
 */
export function shiftYmd(ymd, delta) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function ymdToBR(ymd) {
  return String(ymd).split('-').reverse().join('/');
}

export function dayStart(str) {
  if (!str) return null;
  const d = new Date(`${str}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function dayEnd(str) {
  if (!str) return null;
  const d = new Date(`${str}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

// ---------------------------------------------------------------- telefone

export function fmtPhoneBR(raw) {
  let d = String(raw || '').replace(/[^0-9]/g, '');
  if (d.indexOf('55') === 0 && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw || '';
}

// ----------------------------------------------------------------- filtros

export const EMPTY_FILTERS = {
  q: '',
  tag: '',
  flag: '',
  // Timestamps usados na comparacao.
  cDe: null,
  cAte: null,
  aDe: null,
  aAte: null,
  // Texto YYYY-MM-DD dos inputs type=date, para o campo nao esvaziar sozinho.
  criadoDeText: '',
  criadoAteText: '',
  atualDeText: '',
  atualAteText: '',
  naoLidas: false,
};

export function filtersActive(f) {
  return Boolean(
    f.q || f.tag || f.flag || f.cDe || f.cAte || f.aDe || f.aAte || f.naoLidas
  );
}

export function activeFilterCount(f) {
  let n = 0;
  if (f.q) n += 1;
  if (f.tag) n += 1;
  if (f.flag) n += 1;
  if (f.cDe || f.cAte) n += 1;
  if (f.aDe || f.aAte) n += 1;
  if (f.naoLidas) n += 1;
  return n;
}

/**
 * Os filtros atuam sobre o que ja foi carregado — a API do Chatwoot nao
 * recebe esses criterios. Mesma semantica da versao original.
 */
export function passesFilter(conv, f, leadCache = {}) {
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = `${convName(conv)} ${convPhone(conv)} #${conv.id}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.tag && !convLabels(conv).includes(f.tag)) return false;

  if (f.cDe !== null || f.cAte !== null) {
    const c = convCreatedMs(conv);
    if (c === null) return false;
    if (f.cDe !== null && c < f.cDe) return false;
    if (f.cAte !== null && c > f.cAte) return false;
  }
  if (f.aDe !== null || f.aAte !== null) {
    const u = convUpdatedMs(conv);
    if (u === null) return false;
    if (f.aDe !== null && u < f.aDe) return false;
    if (f.aAte !== null && u > f.aAte) return false;
  }
  if (f.naoLidas && !(conv.unread_count > 0)) return false;

  if (f.flag) {
    const lead = leadCache[convPhone(conv)];
    if (!lead || !isTrue(lead[f.flag])) return false;
  }
  return true;
}

// ---------------------------------------------------------------- mensagens

export function msgItems(msgs) {
  const list = (msgs && msgs.payload) || msgs || [];
  return list.filter(
    m => (m.message_type === 0 || m.message_type === 1) && (m.content || '').trim()
  );
}

export function msgsToArr(msgs) {
  return msgItems(msgs).map(m => ({
    who: m.message_type === 1 ? 'atendente' : 'cliente',
    content: m.content,
    at: m.created_at,
  }));
}

export function convText(msgs) {
  return msgItems(msgs)
    .map(m => m.content)
    .join(' ')
    .toLowerCase();
}

// -------------------------------------------------------- tags sugeridas

/**
 * Heuristica por regex sobre o texto da conversa. Erra com negacao
 * ("nao foi acidente de trabalho" casa acidente + trabalho), entao o
 * resultado e sugestao para o atendente confirmar, nunca classificacao.
 */
export function suggestTags(conv, lead, msgs, tagList) {
  const t = convText(msgs);
  const has = re => re.test(t);
  const out = {};

  if (
    (lead && isTrue(lead.SEGURADO)) ||
    has(/receb\w*\s+(o\s+)?benef|aposentad|bpc|loas|auxilio.doen|encostad/)
  )
    out.recebendo_beneficio = 1;

  if (has(/n[aã]o\s+tenho\s+advogad|sem\s+advogad|n[aã]o\s+tenho\s+adv\b/))
    out.sem_advogado = 1;
  else if (has(/\badvogad|\badv\b|tenho\s+advogad|meu\s+advogad/))
    out.ja_tem_advogado = 1;

  if (has(/acidente/) && has(/trabalh|servi[cç]o|empresa|emprego/))
    out.acidente_trabalho = 1;
  if (has(/laudo|atestad|exame|cid\b/)) out.tem_laudo_medico = 1;
  if (has(/negad|indeferid|cortad|cessad/)) out.auxilio_negado = 1;
  if (has(/peric/) && has(/agendad|marcad|dia\s+\d|remarcad/))
    out.pericia_agendada = 1;
  if (has(/contribu|carn[eê]|gps\b|guia\s+da\s+previd/)) out.contribuinte_inss = 1;
  if (has(/document/) && has(/falta|pendent|enviar|mandar|preciso\s+de/))
    out.documentos_pendentes = 1;
  if (has(/urgent|urg[eê]ncia|o\s+quanto\s+antes|correndo/)) out.urgente = 1;

  const valid = tagList.map(x => x.label);
  const applied = convLabels(conv);
  return Object.keys(out).filter(
    l => valid.includes(l) && !applied.includes(l)
  );
}

// ------------------------------------------------------------------ resumo

export function nextSteps(label) {
  const m = {
    // ------------------------------------------- Auxilio Acidente (caixa 6)
    sdr: 'Qualificar o lead e agendar a conversa comercial.',
    lead_potencial: 'Confirmar o interesse e passar para o comercial.',
    comercial: 'Apresentar proposta e enviar o contrato.',
    contrato_em_elaboracao:
      'Concluir a elaboracao e enviar o contrato para assinatura.',
    contrato_enviado: 'Confirmar o recebimento e cobrar a assinatura.',
    aguardando_assinatura: 'Cobrar a assinatura do contrato.',
    contrato_assinado: 'Encaminhar para analise medica/juridica.',
    analise_medica: 'Aguardar/cobrar o parecer medico.',
    analise_juridica: 'Aguardar/cobrar o parecer juridico.',
    efetivado: 'Caso efetivado - acompanhar o andamento.',
    desqualificado: 'Lead desqualificado - sem acao.',
    descarte_sdr: 'Lead descartado no SDR - sem acao.',
    aguardando_tempo: 'Retomar o contato no periodo definido.',

    // ------------------------------------------------------ BPC (caixa 9)
    //
    // cancelado e desqualificado sao coisas diferentes e o proximo passo
    // muda por causa disso (confirmado pelo Murilo em 07/08/2026):
    //
    //   cancelado      o cliente desistiu. Tinha caso; escolheu nao seguir.
    //                  Nao se reaborda por iniciativa nossa.
    //   desqualificado nao preenche o requisito do BPC (renda familiar por
    //                  pessoa acima de 1/4 do salario minimo, ou nao se
    //                  enquadra em deficiencia nem em 65 anos ou mais).
    //                  Nao vira caso por insistencia.
    //
    // Trocar os dois textos faz a equipe cobrar quem desistiu e ignorar quem
    // so precisava de um documento a mais.
    [UNSTAGED_LABEL]:
      'Card ainda sem etapa - classificar arrastando para a coluna correta.',
    bpc_lead_novo: 'Fazer o primeiro contato e iniciar a qualificacao.',
    bpc_aguardando_requisito:
      'Confirmar renda familiar por pessoa e o enquadramento (deficiencia ou 65+).',
    bpc_qualificado: 'Apresentar a proposta e fechar os honorarios.',
    bpc_documentos_iniciais: 'Cobrar os documentos iniciais do cliente.',
    bpc_aguardando_assinatura: 'Cobrar a assinatura do contrato.',
    bpc_contrato_assinado: 'Encaminhar para pegar a senha do Meu INSS.',
    bpc_pegar_senha: 'Obter a senha do Meu INSS com o cliente.',
    bpc_analise_medica: 'Aguardar/cobrar o parecer medico.',
    bpc_analise_juridica: 'Aguardar/cobrar o parecer juridico.',
    bpc_pos_juridica:
      'Retomar quando o prazo vencer ou os documentos que faltam chegarem.',
    bpc_efetivado: 'Caso efetivado - acompanhar o andamento.',
    bpc_desqualificado:
      'Nao preenche o requisito do BPC - sem acao. Reabrir so se a renda ou o quadro mudar.',
    bpc_cancelado:
      'Cliente desistiu - sem acao. Retomar apenas se ele procurar de novo.',
    bpc_fechado_sem_resposta:
      'Nunca respondeu - candidato a campanha de reativacao, nao a cobranca.',
  };
  return m[label] || '';
}

export function stageEmoji(label) {
  return STAGE_EMOJI[label] || '';
}

// ------------------------------------------- resumo previdenciario (ficha)

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const NAO_INFORMADO = 'Não informado';
const NAO_PERGUNTADO = 'Não perguntado';

/** Frases do cliente, com a caixa preservada, para servir de trecho citavel. */
function clientSentences(msgs) {
  return msgItems(msgs)
    .filter(m => m.message_type === 0)
    .flatMap(m =>
      String(m.content || '')
        .split(/(?<=[.!?\n])\s+/)
        .map(s => s.trim())
        .filter(Boolean)
    );
}

function firstSentence(sentences, re) {
  return sentences.find(s => re.test(s.toLowerCase())) || null;
}

/**
 * Sim / Não / Não perguntado para uma pergunta fechada.
 * Considera negacao ate 40 caracteres antes do termo, que e onde ela cabe em
 * fala natural ("nunca recebi auxilio", "nao tenho advogado").
 */
function simNao(text, termRe) {
  const m = text.match(termRe);
  if (!m) return NAO_PERGUNTADO;
  const idx = m.index || 0;
  const janela = text.slice(Math.max(0, idx - 40), idx + m[0].length + 20);
  if (/\b(n[aã]o|nunca|jamais|nenhum|sem)\b/.test(janela)) return 'Não';
  return 'Sim';
}

const PROFISSOES = [
  'faxineira',
  'faxineiro',
  'diarista',
  'pedreiro',
  'servente',
  'motorista',
  'entregador',
  'vendedor',
  'vendedora',
  'cozinheira',
  'cozinheiro',
  'auxiliar',
  'operador',
  'operadora',
  'costureira',
  'lavrador',
  'agricultor',
  'porteiro',
  'seguranca',
  'segurança',
  'enfermeira',
  'enfermeiro',
  'professor',
  'professora',
  'mecanico',
  'mecânico',
  'soldador',
  'eletricista',
  'pintor',
  'carpinteiro',
  'garcom',
  'garçom',
  'atendente',
  'caixa',
  'domestica',
  'doméstica',
  'babá',
  'baba',
  'cuidadora',
  'cuidador',
  'zelador',
  'jardineiro',
  'açougueiro',
  'padeiro',
];

function acharProfissao(text) {
  const m = text.match(
    /(?:trabalhav[ao]|trabalho|sou|era|fui|atuo|atuav[ao])\s+(?:como\s+|de\s+|a\s+|o\s+)?([a-zà-ú]{4,20})/
  );
  if (m && PROFISSOES.includes(m[1])) return capitalize(m[1]);
  const achada = PROFISSOES.find(p => new RegExp(`\\b${p}\\b`).test(text));
  return achada ? capitalize(achada) : NAO_INFORMADO;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function acharAnoMes(text, sentences) {
  const anoAtual = new Date().getFullYear();
  const contexto = sentences
    .filter(s => /acidente|ca[ií]|aconteceu|machuqu|fratur/i.test(s))
    .join(' ')
    .toLowerCase();

  const anosNoContexto = (contexto.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
  const anosNoTexto = (text.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
  const candidatos = (anosNoContexto.length ? anosNoContexto : anosNoTexto).filter(
    a => a >= 1980 && a <= anoAtual
  );
  const ano = candidatos.length ? String(Math.max(...candidatos)) : NAO_INFORMADO;

  const alvo = contexto || text;
  const mes = MESES.find(m => new RegExp(`\\b${m}\\b`).test(alvo));

  return { ano, mes: mes ? capitalize(mes) : NAO_INFORMADO };
}

function acharSituacao(text) {
  if (/desempregad/.test(text)) return 'Desempregada(o)';
  if (/carteira\s+assinada|\bclt\b|registrad[ao]\s+em\s+carteira/.test(text))
    return 'Com carteira assinada (CLT)';
  if (/aut[oô]nom|conta\s+pr[oó]pria|informal|by[ií]a|bico/.test(text))
    return 'Autônoma(o) / informal';
  if (/rural|lavoura|ro[cç]a|agricultor/.test(text)) return 'Rural';
  if (/aposentad/.test(text)) return 'Aposentada(o)';
  return NAO_INFORMADO;
}

/**
 * Ficha do lead no formato usado pelo time. As respostas saem da conversa por
 * palavra-chave, entao valem como rascunho: o que nao foi dito vira "Não
 * informado" e entra na lista de problemas, que e justamente o ponto — a
 * ficha serve para mostrar o que ainda falta perguntar.
 *
 * Quando o webhook de resumo por IA esta configurado, quem manda e ele; esta
 * versao e o fallback.
 */
export function buildPrevSummary({ conv, full, lead, msgs, columns, tags }) {
  const stageLabels = columns.map(c => c.label);
  // Mesma razao do appliedLabels no ContactPopup: `full` e uma copia congelada
  // na carga, `conv` e o objeto vivo do quadro.
  const labels = convLabels(conv).length ? convLabels(conv) : convLabels(full);
  const stageLbl = labels.find(l => stageLabels.includes(l));
  const stageTitle = (columns.find(c => c.label === stageLbl) || {}).title || '-';

  const items = msgItems(msgs);
  const sentences = clientSentences(msgs);
  const text = convText(msgs);

  const { ano, mes } = acharAnoMes(text, sentences);
  const profissao = acharProfissao(text);

  // Duas passadas: o mecanismo concreto ("tropecei", "cai da escada") descreve
  // melhor que a frase generica que so diz "sofri um acidente".
  const comoFrase =
    firstSentence(
      sentences,
      /tropec|escorreg|ca[ií]\b|cai\s|bati|atropel|cortei|queimei|prensou|prensei|torci|fratur/
    ) || firstSentence(sentences, /acidente|machuqu|me\s+acidentei/);
  const como = comoFrase ? trim1(comoFrase, 120) : NAO_INFORMADO;

  const sequelaFrase = firstSentence(
    sentences,
    /sequela|limita|n[aã]o\s+consigo|dificuldade|dor|movimento|for[cç]a/
  );
  const sequela = sequelaFrase ? `Sim - ${trim1(sequelaFrase, 90)}` : NAO_INFORMADO;

  const situacao = acharSituacao(text);
  const auxDoenca = simNao(text, /aux[ií]lio.?doen[çc]a|encostad|benef[ií]cio\s+por\s+doen/);
  const docs = /laudo|atestad|exame|relat[óo]rio\s+m[ée]dico|raio.?x|ressonanc|ressonânc/.test(
    text
  )
    ? 'Sim'
    : NAO_INFORMADO;
  const advogado = simNao(text, /advogad|\badv\b/);

  const L = [];
  L.push(`📅 Ano do acidente: ${ano}`);
  L.push(`📅 Mês do acidente: ${mes}`);
  L.push(`👷 Profissão na época: ${profissao}`);
  L.push(`📍 Como aconteceu: ${como}`);
  L.push(`💥 Sequela/limitação: ${sequela}`);
  L.push(`💼 Situação na época: ${situacao}`);
  L.push(`🩺 Recebeu auxílio-doença: ${auxDoenca}`);
  L.push(`📄 Tem documentos médicos: ${docs}`);
  L.push(`⚖️ Tem advogado na causa: ${advogado}`);

  // Desqualificacao: so aparece quando a etapa diz isso.
  const desqualificado = ['desqualificado', 'descarte_sdr'].includes(stageLbl);
  if (desqualificado) {
    const motivos = [];
    if (/n[aã]o.{0,30}(carteira|clt|registr)/.test(text))
      motivos.push('sem registro em carteira (CLT)');
    if (/n[aã]o.{0,30}(contribu|inss)/.test(text))
      motivos.push('sem contribuição ao INSS');
    if (/n[aã]o.{0,30}rural/.test(text)) motivos.push('sem vínculo rural comprovado');
    L.push('');
    L.push('🚫 MOTIVO DA DESQUALIFICAÇÃO:');
    L.push(
      motivos.length
        ? `${capitalize(motivos.join('; '))}. Sem vínculo válido com o INSS para análise de direito ao benefício.`
        : 'Não registrado na conversa. Confirmar com quem desqualificou.'
    );
  }

  // Lacunas — o valor real da ficha.
  const problemas = [];
  if (ano === NAO_INFORMADO) problemas.push('Não informado o ano do acidente');
  if (mes === NAO_INFORMADO) problemas.push('Não informado o mês do acidente');
  if (profissao === NAO_INFORMADO)
    problemas.push('Não informada a profissão na época');
  if (como === NAO_INFORMADO) problemas.push('Não informado como o acidente ocorreu');
  if (sequela === NAO_INFORMADO)
    problemas.push('Não informada a sequela ou limitação');
  if (situacao === NAO_INFORMADO)
    problemas.push('Não informado o vínculo/situação na data do acidente');
  if (auxDoenca === NAO_PERGUNTADO)
    problemas.push('Pergunta sobre auxílio-doença não foi feita');
  if (docs === NAO_INFORMADO)
    problemas.push('Não informado se possui documentos médicos');
  if (advogado === NAO_PERGUNTADO)
    problemas.push('Pergunta sobre advogado não foi feita');
  if (!/demiss|sa[ií].{0,10}(do\s+)?emprego|desliga/.test(text))
    problemas.push('Não informado o ano/mês da última demissão');
  if (!/seguro.?desemprego/.test(text))
    problemas.push('Não informado se recebeu seguro-desemprego');

  if (problemas.length) {
    L.push('');
    L.push('⚠️ PROBLEMAS IDENTIFICADOS:');
    problemas.forEach(p => L.push(`- ${p}`));
  }

  L.push('');
  if (desqualificado) L.push('📌 Status: ❌ DESQUALIFICADO para o Auxílio-Acidente');
  else if (stageLbl === 'efetivado') L.push('📌 Status: ✅ EFETIVADO');
  else L.push(`📌 Status: ${stageTitle}`);

  // Rodape operacional: o que o quadro sabe e a conversa nao diz.
  const tgs = labels
    .map(l => tags.find(x => x.label === l))
    .filter(Boolean)
    .map(x => x.title);
  const flags = lead
    ? LEAD_FLAGS.filter(f => isTrue(lead[f.key])).map(f => f.label)
    : [];

  L.push('');
  L.push('———');
  L.push(
    `Etapa: ${stageTitle} · Responsável: ${convAssignee(full) || '-'} · Situação: ${situacaoBR(
      full.status
    )}`
  );
  L.push(
    `Mensagens: ${items.length}${
      items.length
        ? ` · Primeiro contato: ${fmtDate(items[0].created_at)} · Última: ${fmtDate(
            items[items.length - 1].created_at
          )}`
        : ''
    }`
  );
  if (tgs.length) L.push(`Tags: ${tgs.join(', ')}`);
  if (flags.length) L.push(`Lead (Supabase): ${flags.join(', ')}`);

  const ns = nextSteps(stageLbl);
  if (ns) L.push(`Próximo passo: ${ns}`);

  return L.join('\n');
}
