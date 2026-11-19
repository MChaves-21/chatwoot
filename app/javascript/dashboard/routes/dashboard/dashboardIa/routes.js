import { frontendURL } from '../../../helper/URLHelper';
import {
  ROLES,
  CONVERSATION_PERMISSIONS,
} from 'dashboard/constants/permissions';
import DashboardIaIndex from './Index.vue';

// 19/11/2026 (Flavio): liberado para o time. Mesma lista do Kanban — com
// custom_role a string 'agent' nao aparece nas permissoes. O endpoint do fork
// libera o GET para todos; so salvar meta exige administrador.
const meta = {
  permissions: [...ROLES, ...CONVERSATION_PERMISSIONS],
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
