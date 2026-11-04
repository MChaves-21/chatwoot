/**
 * Chatwoot falso, em memoria, para os testes de integracao (vitest) e de
 * ponta a ponta (Playwright, via tests/goncalves-e2e/server.mjs).
 *
 * Reproduz SO o pedaco da API que as telas do fork usam, com a semantica do
 * Chatwoot real onde ela importa para o fork:
 *
 *   - GET /conversations       labels[] = QUALQUER uma (tagged_with any),
 *                              inbox_id, status (all = sem filtro), 25 por
 *                              pagina, ordem por ultima atividade, meta.all_count
 *                              ja filtrado. Resposta embrulhada em `data`.
 *   - POST /conversations/filter  labels equal_to/not_equal_to (EXISTS / NOT
 *                              EXISTS), inbox_id, status; AND antes de OR.
 *                              Resposta SEM `data` (jbuilder do filter).
 *   - POST /conversations/:id/labels  SUBSTITUI o conjunto e grava a
 *                              mensagem de atividade "Fulano adicionou x".
 *   - GET /conversations/:id/messages  20 por vez, `before` volta no tempo.
 *   - GET /contacts/search, /contacts/:id/conversations (corta em 20).
 *   - GET/PATCH dashboard_ia e relatorio_equipe: so administrador (403).
 *
 * Nao depende de nada do app: roda no navegador falso do vitest e no node.
 */

/* eslint-disable no-cond-assign, no-use-before-define -- roteador por regex
   (`if ((match = re.exec(rest)))`) e funcoes internas que se chamam. */

export const PAGE_SIZE = 25;
const MESSAGES_PAGE = 20;

const clone = v => JSON.parse(JSON.stringify(v));

export function createFakeChatwoot(seed = {}) {
  const state = {
    accountId: seed.accountId || 1,
    role: seed.role || 'administrator',
    user: seed.user || {
      id: 1,
      name: 'Admin Teste',
      email: 'admin@teste.local',
    },
    users: seed.users || [
      { id: 1, name: 'Admin Teste' },
      { id: 2, name: 'Karol' },
      { id: 3, name: 'Juliana IA' },
    ],
    inboxes: seed.inboxes || [
      { id: 6, name: 'Auxílio Acidente 7035', channel_type: 'Channel::Api' },
      { id: 10, name: 'Trabalhista', channel_type: 'Channel::Api' },
      { id: 11, name: 'LawChat 98641-0300', channel_type: 'Channel::Api' },
      { id: 15, name: 'BPC API COEX', channel_type: 'Channel::Whatsapp' },
      { id: 16, name: 'F&P', channel_type: 'Channel::Api' },
    ],
    labels: seed.labels || [],
    contacts: [],
    conversations: [],
    messages: [],
    accountAttributes: {},
    nextId: 1000,
    nextMessageId: 1,
    failures: [],
    log: [],
    now: seed.now || Math.floor(Date.UTC(2026, 10, 4, 15) / 1000),
  };

  // ------------------------------------------------------------ montagem

  function addContact({ id, name = 'Contato', phone = '' } = {}) {
    state.nextId += 1;
    const contact = { id: id || state.nextId, name, phone_number: phone };
    state.contacts.push(contact);
    return contact;
  }

  /**
   * Conversa com contato. `labels` e a lista de etiquetas; `history` (opcional)
   * e { etiqueta: epoch } — vira mensagem de atividade, como no Chatwoot.
   */
  function addConversation({
    id,
    inboxId = 6,
    labels = [],
    status = 'open',
    name = 'Lead',
    phone = '',
    contactId,
    createdAt = state.now - 86400,
    lastActivityAt,
    assignee = null,
    unread = 0,
    firstReplyAt = null,
    customAttributes = {},
    history = null,
    messages = [],
  } = {}) {
    const contact =
      state.contacts.find(c => c.id === contactId) ||
      addContact({ id: contactId, name, phone });
    state.nextId += 1;
    const conv = {
      id: id || state.nextId,
      display_id: id || state.nextId,
      inbox_id: inboxId,
      status,
      labels: [...labels],
      created_at: createdAt,
      timestamp: lastActivityAt || createdAt,
      last_activity_at: lastActivityAt || createdAt,
      unread_count: unread,
      first_reply_created_at: firstReplyAt,
      custom_attributes: customAttributes,
      can_reply: true,
      meta: {
        sender: {
          id: contact.id,
          name: contact.name,
          phone_number: contact.phone_number,
        },
        assignee,
      },
    };
    state.conversations.push(conv);
    Object.entries(history || {}).forEach(([label, at]) => {
      addMessage(conv.id, {
        message_type: 2,
        content: `Karol adicionou ${label}`,
        created_at: at,
      });
    });
    messages.forEach(m => addMessage(conv.id, m));
    return conv;
  }

  function addMessage(
    conversationId,
    {
      content,
      message_type = 0,
      created_at,
      sender = null,
      private: priv = false,
    }
  ) {
    const m = {
      id: state.nextMessageId,
      conversation_id: conversationId,
      content,
      message_type,
      created_at: created_at || state.now,
      private: priv,
      sender,
    };
    state.nextMessageId += 1;
    state.messages.push(m);
    return m;
  }

  /** A proxima chamada que casar falha com `status`. */
  function failNext(method, pathPattern, status = 500, times = 1) {
    state.failures.push({
      method: method.toUpperCase(),
      re: new RegExp(pathPattern),
      status,
      times,
    });
  }

  // ------------------------------------------------------------ regras

  const byActivity = (a, b) =>
    b.last_activity_at - a.last_activity_at || b.id - a.id;

  function paginate(list, page) {
    const p = Math.max(1, Number(page) || 1);
    return list.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }

  function matchCondition(conv, cond) {
    const values = cond.values || [];
    switch (cond.attribute_key) {
      case 'labels': {
        const hit = conv.labels.some(l => values.includes(l));
        if (cond.filter_operator === 'equal_to') return hit;
        if (cond.filter_operator === 'not_equal_to') return !hit;
        if (cond.filter_operator === 'is_present')
          return conv.labels.length > 0;
        if (cond.filter_operator === 'is_not_present')
          return conv.labels.length === 0;
        throw new Error(
          `operador ${cond.filter_operator} nao suportado em labels`
        );
      }
      case 'inbox_id':
      case 'status': {
        const v =
          cond.attribute_key === 'inbox_id' ? conv.inbox_id : conv.status;
        const hit = values.map(String).includes(String(v));
        return cond.filter_operator === 'not_equal_to' ? !hit : hit;
      }
      default:
        throw new Error(`atributo ${cond.attribute_key} nao suportado no fake`);
    }
  }

  /** AND antes de OR, como o SQL que o FilterService monta. */
  function matchPayload(conv, payload) {
    const groups = [[]];
    payload.forEach((cond, i) => {
      groups[groups.length - 1].push(matchCondition(conv, cond));
      const op = (cond.query_operator || '').toLowerCase();
      if (op === 'or' && i < payload.length - 1) groups.push([]);
    });
    return groups.some(g => g.every(Boolean));
  }

  function validateFilterPayload(payload) {
    // O Chatwoot real devolve 422 quando o ultimo item tem query_operator.
    if (!Array.isArray(payload) || !payload.length) return 'payload vazio';
    const last = payload[payload.length - 1];
    if (last.query_operator) return 'ultimo item com query_operator';
    for (let i = 0; i < payload.length - 1; i += 1) {
      if (!payload[i].query_operator) return `item ${i} sem query_operator`;
    }
    return null;
  }

  function listConversations(query) {
    const status = query.get('status') || 'open';
    const labels = query.getAll('labels[]');
    const inboxId = query.get('inbox_id');
    let list = state.conversations.slice();
    if (status !== 'all') list = list.filter(c => c.status === status);
    if (labels.length)
      list = list.filter(c => c.labels.some(l => labels.includes(l)));
    if (inboxId)
      list = list.filter(c => String(c.inbox_id) === String(inboxId));
    list.sort(byActivity);
    return list;
  }

  function isAdmin() {
    return state.role === 'administrator';
  }

  function forbidden(msg) {
    return { status: 403, data: { error: msg } };
  }

  function addedLabelsText(labels) {
    return `${state.user.name} adicionou ${labels.join(', ')}`;
  }

  // ----------------------------------------------------- dashboard_ia (Ruby)

  function ddd(phone) {
    const text = String(phone || '').trim();
    let d = text.replace(/\D/g, '');
    if (d.startsWith('55') && d.length >= 12 && d.length <= 13) d = d.slice(2);
    else if (text.startsWith('+')) return null;
    if (d.length < 10 || d.length > 11) return null;
    return d.slice(0, 2);
  }

  function dashboardIa(query) {
    if (!isAdmin())
      return forbidden('Apenas administradores acessam o Dashboard IA');
    const ids = query
      .getAll('inbox_ids[]')
      .map(Number)
      .filter(id => state.inboxes.some(i => i.id === id));
    const convs = state.conversations.filter(c => ids.includes(c.inbox_id));
    const rows = convs.map(c => [
      c.display_id,
      c.inbox_id,
      c.labels,
      c.created_at,
      c.last_activity_at,
      c.meta.assignee ? c.meta.assignee.id : null,
      ddd(c.meta.sender.phone_number),
    ]);
    const agents = {};
    convs.forEach(c => {
      if (c.meta.assignee) agents[c.meta.assignee.id] = c.meta.assignee.name;
    });
    const stages = {};
    state.messages
      .filter(
        m => m.message_type === 2 && convs.some(c => c.id === m.conversation_id)
      )
      .forEach(m => {
        const match = /\s(?:adicionou|added)\s+(.+)$/.exec(m.content);
        if (!match) return;
        const conv = convs.find(c => c.id === m.conversation_id);
        stages[conv.display_id] = stages[conv.display_id] || {};
        const seen = stages[conv.display_id];
        match[1]
          .split(',')
          .map(s => s.trim())
          .forEach(l => {
            if (seen[l] === undefined || m.created_at < seen[l])
              seen[l] = m.created_at;
          });
      });
    const signedRe =
      /(^|,)\s*(bpc_)?(contrato_assinado|analise_medica|analise_juridica|efetivado|pegar_senha|pos_juridica|reprovado_dr_gerardo|aprovado_repescagem)\s*(,|$)/;
    const closings = convs
      .filter(
        c =>
          c.custom_attributes.fechado_por || signedRe.test(c.labels.join(','))
      )
      .map(c => [
        c.display_id,
        c.inbox_id,
        c.meta.sender.name,
        c.custom_attributes.fechado_por || null,
        c.custom_attributes.assinado_em || null,
        c.custom_attributes.assinado_hora || null,
        c.custom_attributes.horario_assinatura || null,
      ]);
    return {
      status: 200,
      data: {
        rows,
        agents,
        stages,
        goals: state.accountAttributes.dashboard_ia_goals || {},
        closings,
        generated_at: state.now,
      },
    };
  }

  function saveGoals(body) {
    if (!isAdmin())
      return forbidden('Apenas administradores acessam o Dashboard IA');
    const clean = {};
    Object.entries((body && body.goals) || {}).forEach(([k, v]) => {
      const n = Number.parseInt(v, 10);
      if (/^[a-z0-9_]{1,40}$/.test(k) && n >= 1 && n <= 100000) clean[k] = n;
    });
    state.accountAttributes.dashboard_ia_goals = {
      ...(state.accountAttributes.dashboard_ia_goals || {}),
      ...clean,
    };
    return {
      status: 200,
      data: { goals: state.accountAttributes.dashboard_ia_goals },
    };
  }

  // ------------------------------------------------- relatorio_equipe (Ruby)

  function relatorio(query) {
    if (!isAdmin())
      return forbidden('Apenas administradores acessam o Relatório da Equipe');
    const since = query.get('since') || '2026-10-29';
    const until = query.get('until') || '2026-11-04';
    const iaIds = state.accountAttributes.relatorio_equipe_ia_users || [];
    const inRange = m => {
      const ymd = new Date((m.created_at - 3 * 3600) * 1000)
        .toISOString()
        .slice(0, 10);
      return ymd >= since && ymd <= until;
    };
    const cat = m => {
      if (m.message_type === 0) return 'recebida';
      if (
        m.sender &&
        (m.sender.type === 'AgentBot' || iaIds.includes(m.sender.id))
      )
        return 'ia';
      if (m.sender && m.sender.type === 'User') return 'humano';
      return 'sem_autor';
    };
    const msgs = state.messages.filter(
      m => !m.private && [0, 1, 3].includes(m.message_type) && inRange(m)
    );
    const days = [];
    for (
      let d = new Date(`${since}T00:00:00Z`);
      d <= new Date(`${until}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      days.push(d.toISOString().slice(0, 10));
    }
    const perDay = days.map(date => {
      const row = { date, recebida: 0, humano: 0, ia: 0, sem_autor: 0 };
      msgs.forEach(m => {
        const ymd = new Date((m.created_at - 3 * 3600) * 1000)
          .toISOString()
          .slice(0, 10);
        if (ymd === date) row[cat(m)] += 1;
      });
      return row;
    });
    const totals = { recebida: 0, humano: 0, ia: 0, sem_autor: 0 };
    msgs.forEach(m => {
      totals[cat(m)] += 1;
    });
    const perUser = state.users
      .map(u => {
        const mine = msgs.filter(
          m =>
            m.message_type !== 0 &&
            m.sender &&
            m.sender.type === 'User' &&
            m.sender.id === u.id
        );
        return {
          id: u.id,
          tipo: 'User',
          name: u.name,
          ia: iaIds.includes(u.id),
          mensagens: mine.length,
          conversas: new Set(mine.map(m => m.conversation_id)).size,
        };
      })
      .filter(u => u.mensagens > 0)
      .sort((a, b) => b.conversas - a.conversas || b.mensagens - a.mensagens);
    const convIds = new Set(msgs.map(m => m.conversation_id));
    return {
      status: 200,
      data: {
        period: { since, until, tz: 'America/Fortaleza' },
        totals: {
          mensagens: totals,
          conversas: convIds.size,
          conversas_com_cliente: new Set(
            msgs.filter(m => m.message_type === 0).map(m => m.conversation_id)
          ).size,
          conversas_equipe: 0,
          conversas_ia: 0,
          conversas_sem_resposta: 0,
        },
        per_day: perDay,
        per_user: perUser,
        users: state.users.map(u => ({ id: u.id, name: u.name })),
        ia_user_ids: iaIds,
        generated_at: state.now,
      },
    };
  }

  // ------------------------------------------------------------- roteador

  /**
   * Atende uma requisicao. `url` pode ser relativa (/api/v1/...) ou absoluta.
   * Devolve { status, data, headers }.
   */
  function handle({ method = 'GET', url, body = null }) {
    const m = method.toUpperCase();
    const u = new URL(url, 'http://fake.local');
    const path = u.pathname;
    state.log.push({
      method: m,
      path,
      query: u.search,
      body: body ? clone(body) : null,
    });

    const fail = state.failures.find(
      f => f.method === m && f.re.test(path + u.search)
    );
    if (fail) {
      fail.times -= 1;
      if (fail.times <= 0)
        state.failures.splice(state.failures.indexOf(fail), 1);
      return { status: fail.status, data: { error: 'falha simulada' } };
    }

    const acc = /^\/api\/v1\/accounts\/(\d+)(\/.*)?$/.exec(path);
    if (path === '/api/v1/profile') {
      return {
        status: 200,
        data: {
          ...state.user,
          accounts: [{ id: state.accountId, role: state.role }],
        },
      };
    }
    if (!acc)
      return { status: 404, data: { error: `rota ${path} fora da conta` } };
    if (Number(acc[1]) !== state.accountId) {
      return { status: 401, data: { error: 'conta errada' } };
    }
    const rest = acc[2] || '/';
    const q = u.searchParams;
    let match;

    if (m === 'GET' && rest === '/conversations') {
      const list = listConversations(q);
      return {
        status: 200,
        data: {
          data: {
            meta: {
              all_count: list.length,
              mine_count: 0,
              unassigned_count: 0,
            },
            payload: clone(paginate(list, q.get('page'))),
          },
        },
      };
    }
    if (m === 'POST' && rest === '/conversations/filter') {
      const payload = (body && body.payload) || [];
      const invalid = validateFilterPayload(payload);
      if (invalid) return { status: 422, data: { error: invalid } };
      const list = state.conversations
        .filter(c => matchPayload(c, payload))
        .sort(byActivity);
      return {
        status: 200,
        data: {
          meta: { all_count: list.length },
          payload: clone(paginate(list, q.get('page'))),
        },
      };
    }
    if ((match = /^\/conversations\/(\d+)$/.exec(rest)) && m === 'GET') {
      const conv = state.conversations.find(c => c.id === Number(match[1]));
      return conv
        ? { status: 200, data: clone(conv) }
        : { status: 404, data: {} };
    }
    if (
      (match = /^\/conversations\/(\d+)\/labels$/.exec(rest)) &&
      m === 'POST'
    ) {
      const conv = state.conversations.find(c => c.id === Number(match[1]));
      if (!conv) return { status: 404, data: {} };
      const next = [...new Set((body && body.labels) || [])];
      const added = next.filter(l => !conv.labels.includes(l));
      conv.labels = next;
      conv.last_activity_at = state.now;
      if (added.length) {
        addMessage(conv.id, {
          message_type: 2,
          content: addedLabelsText(added),
          created_at: state.now,
        });
      }
      return { status: 200, data: { payload: next } };
    }
    if (
      (match = /^\/conversations\/(\d+)\/toggle_status$/.exec(rest)) &&
      m === 'POST'
    ) {
      const conv = state.conversations.find(c => c.id === Number(match[1]));
      if (!conv) return { status: 404, data: {} };
      conv.status = body.status;
      return {
        status: 200,
        data: { payload: { success: true, current_status: conv.status } },
      };
    }
    if ((match = /^\/conversations\/(\d+)\/messages$/.exec(rest))) {
      const id = Number(match[1]);
      if (m === 'POST') {
        const msg = addMessage(id, {
          content: body.content,
          message_type: body.message_type === 'outgoing' ? 1 : 0,
          private: !!body.private,
          sender: { id: state.user.id, type: 'User', name: state.user.name },
        });
        return { status: 200, data: clone(msg) };
      }
      const before = Number(q.get('before')) || Infinity;
      const all = state.messages
        .filter(x => x.conversation_id === id && x.id < before)
        .sort((a, b) => a.id - b.id);
      return {
        status: 200,
        data: { meta: {}, payload: clone(all.slice(-MESSAGES_PAGE)) },
      };
    }
    if (m === 'GET' && rest === '/contacts/search') {
      const term = (q.get('q') || '').toLowerCase();
      const hits = state.contacts.filter(
        c =>
          c.name.toLowerCase().includes(term) || c.phone_number.includes(term)
      );
      return {
        status: 200,
        data: { meta: { count: hits.length }, payload: clone(hits) },
      };
    }
    if (
      (match = /^\/contacts\/(\d+)\/conversations$/.exec(rest)) &&
      m === 'GET'
    ) {
      const list = state.conversations
        .filter(c => c.meta.sender.id === Number(match[1]))
        .sort(byActivity)
        .slice(0, 20);
      return { status: 200, data: { payload: clone(list) } };
    }
    if (m === 'GET' && rest === '/dashboard_ia') return dashboardIa(q);
    if (m === 'PATCH' && rest === '/dashboard_ia/goals') return saveGoals(body);
    if (m === 'GET' && rest === '/relatorio_equipe') return relatorio(q);
    if (m === 'PATCH' && rest === '/relatorio_equipe/ia_users') {
      if (!isAdmin()) return forbidden('Apenas administradores');
      const ids = ((body && body.user_ids) || [])
        .map(Number)
        .filter(id => state.users.some(user => user.id === id));
      state.accountAttributes.relatorio_equipe_ia_users = ids;
      return { status: 200, data: { ia_user_ids: ids } };
    }
    if (m === 'GET' && rest === '/inboxes')
      return { status: 200, data: { payload: clone(state.inboxes) } };
    if (m === 'GET' && rest === '/labels')
      return { status: 200, data: { payload: clone(state.labels) } };
    if (m === 'GET' && rest === '/agents')
      return { status: 200, data: clone(state.users) };

    return { status: 404, data: { error: `fake nao conhece ${m} ${rest}` } };
  }

  /** Cliente no formato do axios (o `window.axios` do dashboard). */
  function axiosAdapter() {
    const call = (method, url, body, config = {}) => {
      const res = handle({ method, url, body });
      if (res.status >= 400) {
        const err = new Error(`Request failed with status code ${res.status}`);
        err.response = res;
        return Promise.reject(err);
      }
      let data = res.data;
      if (config.responseType === 'blob') {
        data = new Blob([
          typeof data === 'string' ? data : JSON.stringify(data),
        ]);
      }
      return Promise.resolve({
        status: res.status,
        data,
        headers: res.headers || {},
      });
    };
    return {
      get: (url, config) => call('GET', url, null, config),
      delete: (url, config) => call('DELETE', url, null, config),
      post: (url, body, config) => call('POST', url, body, config),
      patch: (url, body, config) => call('PATCH', url, body, config),
      put: (url, body, config) => call('PUT', url, body, config),
    };
  }

  const conversation = id => state.conversations.find(c => c.id === id);
  const calls = (method, re) =>
    state.log.filter(l => l.method === method && re.test(l.path + l.query));

  return {
    state,
    addContact,
    addConversation,
    addMessage,
    failNext,
    handle,
    axiosAdapter,
    conversation,
    calls,
  };
}
