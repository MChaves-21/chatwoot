/**
 * Fases do kanban dentro do filtro de conversas do Chatwoot — 28/08/2026.
 *
 * As etapas dos dois funis ja sao etiquetas do Chatwoot, entao "filtrar por
 * fase" e, no fundo, filtrar por `labels`. Antes disso, achar as conversas de
 * uma etapa exigia abrir "Etiquetas" e caçar a etiqueta certa no meio de todas
 * as outras da conta (tags de qualificacao, controle do n8n, etc), lembrando de
 * cor a diferenca entre `analise_medica` e `bpc_analise_medica`. Aqui a lista
 * ja vem curada, com o nome que aparece na coluna do quadro.
 *
 * Sao DOIS atributos e nao um so por decisao do usuario: os funis nao se
 * cruzam, e uma lista unica com 25 etapas — cinco delas com nome identico nos
 * dois funis — devolveria o problema que este filtro existe para resolver.
 *
 * ─── Por que uma chave propria e nao `labels` ───
 *
 * O ConditionRow acha o tipo de filtro por `attributeKey`
 * (`filterTypes.find(f => f.attributeKey === key)`). Tres entradas com
 * `labels` colidiriam: as duas novas resolveriam para "Etiquetas", a primeira
 * da lista, e abririam todas as etiquetas da conta. Entao cada uma tem chave
 * propria, e a traducao para `labels` acontece na fronteira com o backend:
 *
 *   - `helper/filterQueryGenerator.js` — o payload que vai para a API
 *     (filtro aplicado na hora E pasta salva);
 *   - `store/modules/conversations/helpers/filterHelpers.js` — a checagem
 *     local, que decide se uma conversa que chega por websocket entra na
 *     lista aberta.
 *
 * O estado da tela guarda a chave nossa, entao reabrir o painel (ou uma pasta
 * salva) volta mostrando "Fases Kanban BPC", nao "Etiquetas".
 */

import { AUXILIO_COLUMNS, BPC_COLUMNS, UNSTAGED_LABEL } from './constants';

export const KANBAN_STAGE_ATTRIBUTES = {
  AUXILIO: 'kanban_stage_auxilio',
  BPC: 'kanban_stage_bpc',
};

/** Toda chave de fase vira `labels` na hora de falar com o servidor. */
export const KANBAN_STAGE_KEYS = Object.values(KANBAN_STAGE_ATTRIBUTES);

/**
 * Chave de atributo que o backend entende.
 *
 * Recebe tanto camelCase quanto snake_case porque os dois formatos circulam:
 * o painel de filtros trabalha em camelCase e o payload da API em snake_case.
 */
export const resolveFilterAttributeKey = key =>
  KANBAN_STAGE_KEYS.includes(key) ? 'labels' : key;

/**
 * "Sem etapa" fica de fora: e coluna sintetica do BPC (conversa sem nenhuma
 * etiqueta de etapa), nao uma etiqueta que exista na base. Como opcao de filtro
 * ela nunca casaria com nada.
 */
const stages = columns => columns.filter(c => c.label !== UNSTAGED_LABEL);

/**
 * Este arquivo nao importa nada do Vue de proposito: ele e lido tambem pelo
 * `store/modules/conversations/helpers/filterHelpers.js` e pelo
 * `helper/filterQueryGenerator.js`, que rodam fora de componente. Quem monta a
 * bolinha colorida da opcao e o provider, que ja tem o `h` em maos.
 */
export const KANBAN_STAGE_FILTERS = [
  {
    attributeKey: KANBAN_STAGE_ATTRIBUTES.AUXILIO,
    attributeName: 'Fases Kanban · Auxílio Acidente',
    stages: stages(AUXILIO_COLUMNS),
  },
  {
    attributeKey: KANBAN_STAGE_ATTRIBUTES.BPC,
    attributeName: 'Fases Kanban · BPC',
    stages: stages(BPC_COLUMNS),
  },
];
