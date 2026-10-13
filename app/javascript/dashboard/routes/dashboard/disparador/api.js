/* global axios */
/**
 * Disparador — acesso a API.
 *
 * Duas pontas:
 *
 *   1. callDisparador(acao, dados): o webhook do n8n. Autentica com a SESSAO
 *      de quem esta logado (cookie cw_d_session_info), o mesmo arranjo do botao
 *      Agendar e do Dashboard IA. Nao ha segredo no codigo.
 *   2. loadAudience(): as conversas da caixa pela API do proprio Chatwoot, com
 *      o cliente axios do dashboard. So leitura.
 */
import Cookies from 'js-cookie';
import ApiClient from '../../../api/ApiClient';
import {
  AUDIENCE_CONCURRENCY,
  DISPARADOR_URL,
  MAX_AUDIENCE_PAGES,
} from './constants';

function sessionAuth() {
  const raw = JSON.parse(Cookies.get('cw_d_session_info') || '{}');
  return {
    'access-token': raw['access-token'],
    client: raw.client,
    uid: raw.uid,
  };
}

/**
 * Devolve o JSON do n8n ou LANCA com a mensagem que o n8n mandou. Escrita que
 * falha em silencio aqui viraria "criei a campanha" sem campanha nenhuma.
 */
export async function callDisparador(acao, dados = {}) {
  const auth = sessionAuth();
  if (!auth['access-token']) {
    throw new Error('Sessão do Chatwoot não encontrada. Saia e entre de novo.');
  }
  let res;
  try {
    res = await fetch(DISPARADOR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, auth, ...dados }),
    });
  } catch (e) {
    throw new Error('Não foi possível falar com o n8n. Confira a conexão.');
  }
  const txt = await res.text();
  let data = {};
  try {
    data = txt ? JSON.parse(txt) : {};
  } catch (e) {
    data = {};
  }
  if (Array.isArray(data)) data = data[0] || {};
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `O n8n respondeu ${res.status}.`);
  }
  return data;
}

class AudienceAPI extends ApiClient {
  constructor() {
    super('conversations', { accountScoped: true });
  }

  /**
   * Uma pagina (25) de conversas da caixa. Com mais de uma etiqueta, o
   * ConversationFinder devolve as que tem QUALQUER uma delas.
   */
  async page({ inboxId, labels = [], status = 'all', page = 1 }) {
    const params = new URLSearchParams();
    params.set('inbox_id', String(inboxId));
    params.set('status', status || 'all');
    params.set('page', String(page));
    labels.forEach(l => params.append('labels[]', l));
    const res = await axios.get(`${this.url}?${params.toString()}`);
    const body = res.data || {};
    const data = body.data || body;
    const meta = data.meta || {};
    return {
      payload: data.payload || [],
      total: Number(meta.all_count ?? meta.count ?? 0),
    };
  }
}

const audienceApi = new AudienceAPI();

/**
 * Todas as conversas da caixa que passam no filtro, em paginas paralelas.
 * `onProgress(lidas, total)` alimenta a barra da tela.
 */
export async function loadAudience({ inboxId, labels, status, onProgress }) {
  const first = await audienceApi.page({ inboxId, labels, status, page: 1 });
  const total = first.total;
  const pages = Math.min(
    Math.max(1, Math.ceil(total / 25)),
    MAX_AUDIENCE_PAGES
  );
  const all = [...first.payload];
  if (onProgress) onProgress(all.length, total);

  let next = 2;
  const worker = async () => {
    while (next <= pages) {
      const p = next;
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      const r = await audienceApi.page({ inboxId, labels, status, page: p });
      all.push(...r.payload);
      if (onProgress) onProgress(all.length, total);
    }
  };
  await Promise.all(
    Array.from({ length: AUDIENCE_CONCURRENCY }, () => worker())
  );
  return { conversations: all, total, truncated: total > pages * 25 };
}
