import { frontendURL } from '../../../helper/URLHelper';
import RelatorioEquipeIndex from './Index.vue';

// Mesma regra do Dashboard IA. O backend so aceita administrador, porque o
// CSV traz o texto das mensagens dos clientes.
const meta = {
  permissions: ['administrator', 'report_manage'],
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
