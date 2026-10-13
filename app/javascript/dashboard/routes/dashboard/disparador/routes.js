import { frontendURL } from '../../../helper/URLHelper';
import DisparadorIndex from './Index.vue';

// So administrador: disparo em massa fala em nome do escritorio inteiro e pode
// custar o numero (bloqueio) se for mal configurado.
const meta = {
  permissions: ['administrator'],
};

export const routes = [
  {
    path: frontendURL('accounts/:accountId/disparador'),
    name: 'disparador_index',
    component: DisparadorIndex,
    meta,
  },
];

export default { routes };
