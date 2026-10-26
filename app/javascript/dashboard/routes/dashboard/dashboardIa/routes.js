import { frontendURL } from '../../../helper/URLHelper';
import DashboardIaIndex from './Index.vue';

// So administrador: o endpoint do fork (controller) so responde a
// administrador. Com `report_manage` aqui, a tela abria, o endpoint negava e
// o painel caia calado no plano B, com outros numeros (26/10/2026).
const meta = {
  permissions: ['administrator'],
};

export const routes = [
  {
    path: frontendURL('accounts/:accountId/dashboard-ia'),
    name: 'dashboard_ia_index',
    component: DashboardIaIndex,
    meta,
  },
];

export default { routes };
