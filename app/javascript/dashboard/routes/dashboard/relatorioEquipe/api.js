/* global axios */
/**
 * Relatorio da Equipe — acesso a API do fork
 * (app/controllers/api/v1/accounts/relatorio_equipe_controller.rb).
 *
 * So a API do proprio Chatwoot, com a sessao de quem esta logado. Nada sai
 * para n8n ou terceiros.
 */
import ApiClient from '../../../api/ApiClient';

function toQuery({ since, until, inboxId, userId, label }) {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  if (until) params.set('until', until);
  params.set('tz', 'America/Fortaleza');
  if (inboxId) params.append('inbox_ids[]', String(inboxId));
  if (userId) params.append('user_ids[]', String(userId));
  if (label) params.append('labels[]', label);
  return params.toString();
}

class RelatorioEquipeAPI extends ApiClient {
  constructor() {
    super('relatorio_equipe', { accountScoped: true });
  }

  async summary(filters) {
    const res = await axios.get(`${this.url}?${toQuery(filters)}`);
    const data = res.data || {};
    if (!Array.isArray(data.per_day) || !Array.isArray(data.per_user)) {
      throw new Error('Resposta inesperada do servidor.');
    }
    return data;
  }

  /** Baixa o CSV da lista de mensagens. Devolve { truncated }. */
  async downloadCsv(filters) {
    const res = await axios.get(`${this.url}/mensagens?${toQuery(filters)}`, {
      responseType: 'blob',
    });
    const name = `mensagens_${filters.since}_${filters.until}.csv`;
    const href = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return { truncated: (res.headers || {})['x-relatorio-truncado'] === '1' };
  }

  async saveIaUsers(userIds) {
    const res = await axios.patch(`${this.url}/ia_users`, {
      user_ids: userIds,
    });
    return (res.data || {}).ia_user_ids || [];
  }
}

export default new RelatorioEquipeAPI();
