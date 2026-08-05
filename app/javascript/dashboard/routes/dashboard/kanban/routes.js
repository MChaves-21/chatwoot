import { frontendURL } from '../../../helper/URLHelper';
import KanbanIndex from './Index.vue';

const meta = {
  // Administrador e agente. Cada um enxerga apenas as conversas das caixas
  // de que e membro — quem aplica isso e a propria API do Chatwoot.
  permissions: ['administrator', 'agent'],
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
