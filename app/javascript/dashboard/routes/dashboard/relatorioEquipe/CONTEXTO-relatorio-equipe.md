# Relatório da Equipe (fork Gonçalves & Silva) — 16/10/2026

Item no menu lateral, abaixo do Dashboard IA. Responde a dois pedidos:

1. **Relatório de mensagens**: recebidas x enviadas por dia; enviadas separadas
   em equipe / IA / sem autor; mensagens por usuário; lista exportável em CSV.
2. **Quantidade de conversas por usuário**: conversas em que o usuário enviou
   ao menos uma mensagem no período (não importa quem é o responsável).

Filtros: período, caixa, usuário, etapa do Kanban/etiqueta.

## Arquivos
- `app/services/relatorio_equipe/report.rb` — consultas e CSV (só leitura).
- `app/controllers/api/v1/accounts/relatorio_equipe_controller.rb` — só administrador.
- `config/routes.rb` — `resource :relatorio_equipe` (`show`, `mensagens`, `ia_users`).
- `app/javascript/dashboard/routes/dashboard/relatorioEquipe/` — tela.
- `Sidebar.vue` e `dashboard.routes.js` — item de menu e rota.

## Regras
- Notas privadas e mensagens de atividade não contam.
- IA = remetente AgentBot/Captain **ou** usuário marcado em "Quem conta como IA"
  (o n8n responde pela Juliana com o token de um usuário do Chatwoot). A lista
  fica em `accounts.custom_attributes.relatorio_equipe_ia_users`.
- "Sem autor" = mensagem enviada sem remetente (direto do celular/integração).
- Filtro de usuário = as conversas que ele respondeu no período.
- Dias contados no fuso America/Fortaleza. Período máximo: 366 dias.
- CSV: até 50 mil linhas (cabeçalho `X-Relatorio-Truncado`), `;` como separador,
  BOM UTF-8 para o Excel, células que começam com = + - @ recebem `'` na frente.
- LGPD: o CSV traz o texto das mensagens dos clientes; por isso só administrador.
