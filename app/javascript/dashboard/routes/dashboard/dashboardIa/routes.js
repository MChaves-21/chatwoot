import { frontendURL } from '../../../helper/URLHelper';
import DashboardIaIndex from './Index.vue';

// Mesma regra dos Relatorios do Chatwoot: administrador ou cargo com
// report_manage. O painel mostra numeros comerciais do escritorio inteiro.
const meta = {
  permissions: ['administrator', 'report_manage'],
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
