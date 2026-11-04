# Testes do fork Gonçalves & Silva

Bateria de testes das telas e endpoints que o fork acrescenta ao Chatwoot
(Kanban, Dashboard IA, Relatório da Equipe, Disparador). Roda na esteira do
GitHub (`.github/workflows/build-goncalves.yml`): o build e o deploy só saem
se os quatro jobs passarem — Verificar, Testes JS, Testes Ruby e Testes de
ponta a ponta.

| Camada | Onde | Como roda |
| --- | --- | --- |
| Unitários JS | `app/javascript/goncalves-specs/unit` | `pnpm test:goncalves` |
| Integração JS | `app/javascript/goncalves-specs/integration` | `pnpm test:goncalves` |
| Unitários e API (Ruby) | `spec/services/{dashboard_ia,relatorio_equipe}`, `spec/services/whatsapp/oneoff_campaign_service_goncalves_spec.rb`, `spec/controllers/api/v1/accounts/{dashboard_ia,relatorio_equipe}_controller_spec.rb` | `bundle exec rspec <arquivos>` (precisa de Postgres e Redis) |
| Ponta a ponta | `tests/goncalves-e2e` (esta pasta) | `pnpm test:goncalves:e2e` |

## Como funciona o ponta a ponta

As **telas reais** do fork (os `Index.vue`, as rotas `routes.js` e a guarda
de permissão do Chatwoot) sobem num Chromium pelo Vite, com um **Chatwoot
falso em memória** servindo `/api`
(`app/javascript/goncalves-specs/support/fakeChatwoot.js`). O mesmo servidor
falso é usado nos testes de integração JS.

O que o falso reproduz do Chatwoot real, porque o fork depende disso:
filtro `labels[]` com "qualquer uma", `POST /conversations/filter` com
`not_equal_to` (a coluna "Sem etapa"), paginação de 25 com `all_count`,
`labels` que substitui o conjunto e grava a atividade "Fulano adicionou x",
e os endpoints do fork só para administrador (403 para agente).

O backend de verdade dos endpoints do fork é coberto pelos specs Ruby.

Cada teste escolhe um cenário (`scenarios.mjs`), age na tela e confere a tela
**e** o que ficou gravado no servidor (`GET /__fake/state`).

```bash
pnpm install                       # na raiz
cd tests/goncalves-e2e
npm ci
npx playwright install chromium    # uma vez
npx playwright test                # sobe o Vite sozinho na porta 5199
npx playwright test --headed       # vendo o navegador
```

## Achados registrados como `it.fails`

Comportamentos que hoje estão errados ficam marcados com `it.fails`: o teste
passa enquanto o defeito existir e começa a falhar quando ele for corrigido —
aí é só trocar `it.fails` por `it`.

- `formatPhone` do Disparador mostra telefone fixo com 9 na frente.
- No Dashboard IA, contrato assinado e depois descartado conta em
  "Contratos" mas some de "Quem fechou" quando o n8n não gravou `fechado_por`.

E listas de pendência em `unit/kanban/helpers.spec.js`: colunas sem texto de
"Próximo passo" (`bpc_finalizado`) e sem emoji (`reprovado_dr_gerardo`,
`aprovado_repescagem`).
