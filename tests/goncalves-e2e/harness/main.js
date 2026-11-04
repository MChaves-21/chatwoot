/**
 * Harness E2E do fork Goncalves & Silva.
 *
 * Monta as TELAS REAIS do fork (Index.vue do Kanban, Dashboard IA, Relatorio
 * da Equipe e Disparador), com as rotas reais (routes.js de cada uma) e a
 * guarda de permissao REAL do Chatwoot (validateLoggedInRoutes). O que e
 * falso: o servidor (Chatwoot em memoria, ver vite.config.mjs) e a casca do
 * app (sidebar, login), que nao sao do fork.
 *
 * O `axios` e o de verdade, com os headers da sessao, apontando para /api do
 * proprio servidor de teste.
 */
import { createApp, h, reactive } from 'vue';
import { createRouter, createWebHistory, RouterView } from 'vue-router';
import { createStore } from 'vuex';
import { createI18n } from 'vue-i18n';
import axios from 'axios';
import FloatingVue from 'floating-vue';
import { emitter } from 'shared/helpers/mitt';
import { frontendURL } from 'dashboard/helper/URLHelper';
import { validateLoggedInRoutes } from 'dashboard/helper/routeHelpers';
import { routes as kanbanRoutes } from 'dashboard/routes/dashboard/kanban/routes';
import { routes as dashboardIaRoutes } from 'dashboard/routes/dashboard/dashboardIa/routes';
import { routes as relatorioRoutes } from 'dashboard/routes/dashboard/relatorioEquipe/routes';
import { routes as disparadorRoutes } from 'dashboard/routes/dashboard/disparador/routes';
import 'floating-vue/dist/style.css';
import 'dashboard/assets/scss/app.scss';

window.axios = axios.create();

const toasts = reactive([]);
emitter.on('newToastMessage', ({ message }) => {
  toasts.push(message);
});

async function boot() {
  const profile = (await window.axios.get('/api/v1/profile')).data;
  const user = {
    ...profile,
    account_id: profile.accounts[0].id,
    accounts: profile.accounts.map(a => ({
      ...a,
      status: 'active',
      permissions: [a.role],
    })),
  };

  const store = createStore({
    state: { inboxes: [], labels: [] },
    getters: {
      isLoggedIn: () => true,
      getCurrentUser: () => user,
      getCurrentAccountId: (_s, _g, rootState) =>
        Number(rootState.route?.params?.accountId) || user.account_id,
      getSelectedChat: () => ({}),
      'inboxes/getInboxes': s => s.inboxes,
      'labels/getLabels': s => s.labels,
    },
    mutations: {
      setInboxes(s, v) {
        s.inboxes = v;
      },
      setLabels(s, v) {
        s.labels = v;
      },
    },
    actions: {
      async 'inboxes/get'({ commit }) {
        const { accountId } = router.currentRoute.value.params;
        const res = await window.axios.get(`/api/v1/accounts/${accountId}/inboxes`);
        commit('setInboxes', res.data.payload);
      },
      async 'labels/get'({ commit }) {
        const { accountId } = router.currentRoute.value.params;
        const res = await window.axios.get(`/api/v1/accounts/${accountId}/labels`);
        commit('setLabels', res.data.payload);
      },
      toggleStatus: () => {},
      markMessagesUnread: () => {},
    },
  });

  const Home = {
    name: 'HarnessHome',
    render: () => h('main', { 'data-testid': 'home' }, 'Início da conta'),
  };

  const router = createRouter({
    history: createWebHistory(),
    routes: [
      ...kanbanRoutes,
      ...dashboardIaRoutes,
      ...relatorioRoutes,
      ...disparadorRoutes,
      {
        path: frontendURL('accounts/:accountId/dashboard'),
        name: 'home',
        component: Home,
        meta: { permissions: ['administrator', 'agent'] },
      },
    ],
  });

  // Mesma decisao do app: rota sem permissao vai para o dashboard da conta.
  router.beforeEach((to, _from, next) => {
    const redirect = validateLoggedInRoutes(to, user);
    return redirect ? next(frontendURL(redirect)) : next();
  });
  router.afterEach(to => {
    store.state.route = { params: to.params, name: to.name };
  });

  const App = {
    render: () =>
      h('div', { class: 'flex flex-col h-screen' }, [
        h('div', { class: 'flex-1 min-h-0' }, [h(RouterView)]),
        h(
          'ul',
          { 'data-testid': 'toasts', class: 'fixed bottom-2 left-2 z-50 text-xs' },
          toasts.map((t, i) => h('li', { key: i, 'data-testid': 'toast' }, t))
        ),
      ]),
  };

  const app = createApp(App);
  app.use(
    createI18n({ legacy: false, locale: 'pt_BR', messages: {}, missingWarn: false, fallbackWarn: false })
  );
  app.use(store);
  app.use(router);
  app.use(FloatingVue);
  await router.isReady();
  app.mount('#app');
  window.__harness = { router, store, toasts };
}

boot();
