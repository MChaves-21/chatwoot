import { frontendURL } from '../../../helper/URLHelper';
import {
  ROLES,
  CONVERSATION_PERMISSIONS,
} from 'dashboard/constants/permissions';
import KanbanIndex from './Index.vue';

const meta = {
  // Mesma lista das rotas de conversa do upstream. Nao basta ['administrator',
  // 'agent']: quando a conta tem custom_role_id, getUserPermissions devolve as
  // permissoes do cargo (conversation_manage e afins) e a string 'agent' nao
  // aparece — o guarda de rota redirigiria o agente de volta ao dashboard.
  //
  // Quem enxerga qual conversa continua sendo decidido pela API do Chatwoot,
  // no PermissionFilterService. Isto aqui so libera a tela.
  permissions: [...ROLES, ...CONVERSATION_PERMISSIONS],
};

export const routes = [
  {
    path: frontendURL('accounts/:accountId/kanban'),
    component: KanbanIndex,
    meta,
    children: [
      {
        path: '',
        name: 'kanban_index',
        component: KanbanIndex,
        meta,
      },
    ],
  },
];

export default { routes };
