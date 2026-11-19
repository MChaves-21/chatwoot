import { frontendURL } from '../../../helper/URLHelper';
import {
  ROLES,
  CONVERSATION_PERMISSIONS,
} from 'dashboard/constants/permissions';
import RelatorioEquipeIndex from './Index.vue';

// 19/11/2026 (Flavio): liberado para o time (mesma lista do Kanban). O CSV,
// que traz o texto das mensagens dos clientes, e "Quem conta como IA"
// continuam so com administrador — no backend e escondidos na tela.
const meta = {
  permissions: [...ROLES, ...CONVERSATION_PERMISSIONS],
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
