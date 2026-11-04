/**
 * "Fases Kanban" no filtro de conversas (28/08/2026).
 *
 * Unitario: o mapeamento das chaves. Integracao leve: o gerador de payload
 * (o que vai para a API e para a pasta salva) e a checagem local (conversa
 * que chega por websocket) usando a mesma chave.
 */
import {
  KANBAN_STAGE_ATTRIBUTES,
  KANBAN_STAGE_FILTERS,
  KANBAN_STAGE_KEYS,
  resolveFilterAttributeKey,
} from 'dashboard/routes/dashboard/kanban/conversationFilters';
import {
  AUXILIO_COLUMNS,
  BPC_COLUMNS,
  TRABALHISTA_COLUMNS,
  UNSTAGED_LABEL,
} from 'dashboard/routes/dashboard/kanban/constants';
import generatePayload from 'dashboard/helper/filterQueryGenerator';
import { matchesFilters } from 'dashboard/store/modules/conversations/helpers/filterHelpers';

describe('kanban/conversationFilters', () => {
  it('tres chaves proprias, uma por funil', () => {
    expect(KANBAN_STAGE_KEYS).toEqual([
      'kanban_stage_auxilio',
      'kanban_stage_bpc',
      'kanban_stage_trabalhista',
    ]);
  });

  it.each(Object.values(KANBAN_STAGE_ATTRIBUTES))(
    '%s vira `labels` na fronteira com o backend',
    key => {
      expect(resolveFilterAttributeKey(key)).toBe('labels');
    }
  );

  it.each(['labels', 'status', 'inbox_id', 'kanban', '', undefined])(
    'chave comum (%p) passa intacta',
    key => {
      expect(resolveFilterAttributeKey(key)).toBe(key);
    }
  );

  it('as chaves nao colidem com `labels` (o ConditionRow acha o tipo pela chave)', () => {
    KANBAN_STAGE_FILTERS.forEach(f =>
      expect(f.attributeKey).not.toBe('labels')
    );
  });

  it.each([
    [KANBAN_STAGE_ATTRIBUTES.AUXILIO, AUXILIO_COLUMNS],
    [KANBAN_STAGE_ATTRIBUTES.BPC, BPC_COLUMNS],
    [KANBAN_STAGE_ATTRIBUTES.TRABALHISTA, TRABALHISTA_COLUMNS],
  ])('%s lista as colunas do funil, menos "Sem etapa"', (key, columns) => {
    const filter = KANBAN_STAGE_FILTERS.find(f => f.attributeKey === key);
    const expected = columns.filter(c => c.label !== UNSTAGED_LABEL);
    expect(filter.stages).toEqual(expected);
    expect(filter.stages.map(s => s.label)).not.toContain(UNSTAGED_LABEL);
    expect(filter.attributeName).toMatch(/^Fases Kanban · /);
  });
});

describe('filterQueryGenerator com fase do kanban', () => {
  it('troca a chave por `labels` e mantem as etiquetas escolhidas', () => {
    const { payload } = generatePayload([
      {
        attribute_key: 'kanban_stage_bpc',
        filter_operator: 'equal_to',
        values: [
          { id: 'bpc_lead_novo', name: 'Lead novo' },
          { id: 'bpc_qualificado', name: 'Lead qualificado' },
        ],
        query_operator: 'and',
      },
      {
        attribute_key: 'status',
        filter_operator: 'equal_to',
        values: [{ id: 'open', name: 'Aberta' }],
        query_operator: 'and',
      },
    ]);
    expect(payload).toEqual([
      {
        attribute_key: 'labels',
        filter_operator: 'equal_to',
        values: ['bpc_lead_novo', 'bpc_qualificado'],
        query_operator: 'and',
      },
      {
        attribute_key: 'status',
        filter_operator: 'equal_to',
        values: ['open'],
        query_operator: undefined,
      },
    ]);
  });

  it('nao altera o objeto de origem (estado da tela guarda a chave nossa)', () => {
    const data = [
      {
        attribute_key: 'kanban_stage_auxilio',
        filter_operator: 'equal_to',
        values: ['sdr'],
        query_operator: 'and',
      },
    ];
    generatePayload(data);
    expect(data[0].attribute_key).toBe('kanban_stage_auxilio');
  });
});

describe('filterHelpers (checagem local) com fase do kanban', () => {
  const conversation = labels => ({ id: 1, status: 'open', labels });
  const filter = (key, values, op = 'equal_to') => [
    { attribute_key: key, filter_operator: op, values, query_operator: 'and' },
  ];

  it('conversa com a etiqueta entra na lista filtrada', () => {
    expect(
      matchesFilters(
        conversation(['bpc_lead_novo', 'manual']),
        filter('kanban_stage_bpc', ['bpc_lead_novo'])
      )
    ).toBe(true);
  });

  it('conversa sem a etiqueta fica fora', () => {
    expect(
      matchesFilters(
        conversation(['sdr']),
        filter('kanban_stage_bpc', ['bpc_lead_novo'])
      )
    ).toBe(false);
  });

  it('qualquer uma das fases escolhidas basta (OU, como no SQL)', () => {
    expect(
      matchesFilters(
        conversation(['comercial']),
        filter('kanban_stage_auxilio', ['sdr', 'comercial'])
      )
    ).toBe(true);
  });

  it('not_equal_to exclui quem esta na fase', () => {
    expect(
      matchesFilters(
        conversation(['sdr']),
        filter('kanban_stage_auxilio', ['sdr'], 'not_equal_to')
      )
    ).toBe(false);
    expect(
      matchesFilters(
        conversation(['comercial']),
        filter('kanban_stage_auxilio', ['sdr'], 'not_equal_to')
      )
    ).toBe(true);
  });

  it('fase do kanban combinada com status', () => {
    const filters = [
      {
        attribute_key: 'kanban_stage_trabalhista',
        filter_operator: 'equal_to',
        values: ['trab_objecao'],
        query_operator: 'and',
      },
      {
        attribute_key: 'status',
        filter_operator: 'equal_to',
        values: ['open'],
        query_operator: null,
      },
    ];
    expect(matchesFilters(conversation(['trab_objecao']), filters)).toBe(true);
    expect(
      matchesFilters(
        { ...conversation(['trab_objecao']), status: 'resolved' },
        filters
      )
    ).toBe(false);
  });
});
