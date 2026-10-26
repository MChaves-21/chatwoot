import { frontendURL } from '../../../helper/URLHelper';
import RelatorioEquipeIndex from './Index.vue';

// So administrador, igual ao backend: o CSV traz o texto das mensagens dos
// clientes. Com `report_manage` aqui, a tela abria e o endpoint negava.
const meta = {
  permissions: ['administrator'],
};

export const routes = [
  {
    path: frontendURL('accounts/:accountId/relatorio-equipe'),
    name: 'relatorio_equipe_index',
    component: RelatorioEquipeIndex,
    meta,
  },
];

export default { routes };
