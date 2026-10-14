# Disparador — contexto (13/10/2026)

Tela nova no menu lateral ("Disparador", só administrador) para mandar mensagem
em lote a conversas que **já existem** no Chatwoot, em qualquer caixa.

## Peças

| Onde | O quê |
|---|---|
| `routes/dashboard/disparador/` | a tela inteira (lista, nova campanha, acompanhamento) |
| `dashboard.routes.js` | +2 linhas: importa e registra as rotas |
| `components-next/sidebar/Sidebar.vue` | +7 linhas: item "Disparador" abaixo do Dashboard IA |
| n8n `DISPARADOR - API (webhook)` (ZVGOuUNQDfslMF2d) | `POST /webhook/disparador-api` — listar, detalhar, criar, pausar, retomar, cancelar, excluir. Valida a sessão do Chatwoot em `GET /api/v1/profile` (conta 1). Na criação calcula o horário de cada envio. |
| n8n `DISPARADOR - Envio (cron)` (JJoKTzSi53fZYn2S) | a cada minuto: reserva os vencidos, espera o horário, confere campanha e etiquetas, posta em `POST /conversations/:id/messages`, grava o resultado e conclui a campanha sem pendentes |
| n8n Data Tables | `disparo_campanhas` (Nv07DUl1SEQrdDdD) e `disparo_destinatarios` (4jy1voKJunOOvuSI) |

Mesmo arranjo do botão Agendar: a tela não guarda nada, o n8n guarda e envia, e
a entrega no WhatsApp sai pelo caminho normal da caixa. O histórico fica na
conversa.

## Regras que importam

- **Só conversas existentes.** Criar conversa em lote dispara o vídeo do BPC
  (`conversation_created`) — ver o incidente de 12/08 no `CONTEXTO-fork.md`.
- **Mensagem de saída não aciona IA.** A IA PREV (`É do cliente?`) e a
  Trabalhista (`mensagem nao e do cliente`) param na mensagem do escritório.
  Conferido nos dois fluxos em 13/10/2026.
- **Caixa da API oficial (`Channel::Whatsapp`) só aceita template aprovado**
  para quem não falou nas últimas 24 h. A tela só oferece template nessas
  caixas e só lista os aprovados e sem cabeçalho de mídia. Os templates vêm de
  `inbox.message_templates` — se a lista estiver vazia, sincronizar na caixa.
- **Um contato recebe uma vez por campanha.** Mais de uma conversa do mesmo
  contato na caixa: fica a de atividade mais recente.
- **Etiquetas de descarte barram duas vezes:** ao montar o público e de novo na
  hora do envio (lead descartado depois de a campanha nascer não recebe).
  Padrão = `CLOSED_LABELS`.
- **Status da linha:** `pendente` → `reservado` (o cron pegou) → `enviado` /
  `erro` / `pulado`; `cancelado` quando a campanha é cancelada. A reserva só
  pega `pendente`, então duas rodadas sobrepostas não enviam em dobro.
- **Excluir (13/10/2026):** botão no detalhe, só em campanha `concluida` ou
  `cancelada`. O n8n recusa se ainda houver linha `reservado` (mensagem saindo
  naquele minuto). Apaga as linhas de `disparo_destinatarios` e
  `disparo_campanhas`; as mensagens já enviadas continuam nas conversas.
- **Code node com "Executar uma vez" ligado recebe só o PRIMEIRO item** — não
  usar essa opção em nó que lê `$input.all()` (foi o bug da contagem vazia na
  lista em 13/10/2026).
- **Linha presa em `reservado`** (execução morreu no meio) não volta sozinha.
  Antes de devolver para `pendente` na tabela, conferir na conversa se saiu.
- **Primeira mensagem numa conversa nunca respondida** grava o
  `first_reply_created_at`, e a conversa sai de "Aberto" no quadro por estado.
- Horários sempre em Fortaleza (UTC-3, sem horário de verão), igual no n8n e na
  tela.

## Mudança junto: BPC agora é a caixa 15

Em 13/10/2026 o número do BPC foi para a API oficial (caixa 15, "BPC API
COEX") e as 1.109 conversas da caixa 9 foram migradas para ela. Trocado junto
neste branch: `inboxId` do funil BPC (`kanban/constants.js`),
`STATE_INBOX_IDS` e `INBOX_NAMES` (`stateConstants.js`) e o descarte por caixa
do `ConversationStatePicker`. O Dashboard IA lê a caixa do funil, então acerta
junto. Sem este deploy o funil BPC e o Dashboard IA ficam sem o BPC.

## Verificado antes do commit

- 7 arquivos `.vue` tocados compilam (`@vue/compiler-sfc`), 59 imports
  internos resolvem, `eslint` limpo na pasta do disparador.
- Funções puras de `helpers.js` testadas com node (público, variáveis,
  templates, estimativa com janela e fim de semana, CSV).
- `vite build` de produção passou.
- n8n: API testada de ponta a ponta com sessão real (6 ações); motor testado
  com o envio ao Chatwoot simulado (reserva, variável, resultado, conclusão).

## Versão 2 (14/10/2026) — mais simples, e envio para uma pessoa

A tela inicial pergunta "O que você quer fazer?" com duas escolhas grandes:

- **Mandar para uma pessoa** (`components/SingleSend.vue`): digita o número em
  qualquer formato, a tela acha o contato (com ou sem o nono dígito) e as
  conversas dele, a pessoa escolhe por qual WhatsApp sai, escreve e manda.
  - "Agora" posta direto na conversa com a sessão do atendente
    (`POST /conversations/:id/messages`), sem n8n. Fica no histórico com o
    nome de quem enviou.
  - "Agendar" cria uma campanha de 1 destinatário no n8n (ritmo
    `SINGLE_CONFIG`, 24/7). **Depende do cron `DISPARADOR - Envio` ligado.**
  - Na API oficial, se o cliente não escreveu nas últimas 24 h
    (`can_reply: false` na conversa), só oferece mensagem aprovada.
  - Número sem conversa no Chatwoot: a tela orienta usar o "Nova conversa" do
    Chatwoot. Criar conversa daqui dispararia o vídeo do BPC
    (`conversation_created`) e, nas caixas da uazapi, exige o formato de
    contato da uazapi.
- **Mandar para várias pessoas** (`components/CampaignForm.vue`), agora em 5
  passos com uma pergunta por tela: WhatsApp → Quem recebe → Mensagem →
  Quando → Revisar.
  - Quem recebe: "Todo mundo", "Por etapa do Kanban" ou "Por etiqueta"; a
    contagem atualiza sozinha; descartados saem automaticamente (lista
    escondida em "ver detalhes").
  - Velocidade e horário em botões prontos (`PACES`, `WINDOWS`); os campos em
    segundos ficam em "Personalizar".
  - O nome da campanha é sugerido no último passo.
- Acompanhamento: textos simples ("Continuar", "Baixar planilha", status
  "Aguardando / Falhou / Não enviada") e botão **Excluir** para campanha
  concluída ou cancelada (ação `excluir` do n8n, criada em 13/10).

Funções novas em `helpers.js`, testadas com node: `canonicalPhone`,
`phoneSearchKey`, `samePhone`, `formatPhone`, `conversationOptions`,
`templateMessageBody`.
