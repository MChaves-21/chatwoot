# Contexto — o fork do Chatwoot da Gonçalves & Silva

**Data:** 12/08/2026
**Estado:** `aa4b4ac28` no ar. **Rodada 4 escrita no clone, NÃO commitada, NÃO
implantada.**
**Para:** qualquer rodada futura de desenvolvimento neste fork.

> Documento auto-suficiente e de propósito geral. Quem abrir conversa nova
> trabalha sem o histórico. Para o que é específico da auditoria da IA, ver
> `CONTEXTO-auditoria-ia.md` — é outro assunto e vive no n8n, não aqui.

---

## 0. O que está pendente AGORA (leia primeiro)

A rodada 4 (12/08/2026) está **escrita no clone e verificada, mas não
commitada**. Os arquivos já estão em
`C:\Users\assis\Documents\GitHub\chatwoot`, prontos para o GitHub Desktop.

**Os próximos passos, em ordem:**

1. Commitar pelo GitHub Desktop e dar push na `goncalves-main`.
2. Esperar o build do GitHub Actions (~4–5 min) — **é ele que pega o que o
   parser não pega**.
3. Easypanel → projeto `n8n` → serviço `chatwoot` → aba **Fonte** → trocar a
   imagem para o sha novo → **Salvar** → **Implantar**.
4. Conferir na tela: a aba Kanban → "Por estado" deve mostrar a matriz nova.

**Não implante às 12h nem às 17h30** — é quando a equipe fotografa a tabela.

O que foi verificado antes de entregar: parser dos 15 arquivos (`node --check`
nos `.js`, `compileScript`+`compileTemplate` nos `.vue`) e as regras puras de
`stateBoard.js` contra base sintética, incluindo a invariante nova (a soma das
linhas de cada grupo da matriz bate exatamente com o TOTAL, em todas as cinco
colunas). O que **não** foi verificado: o build do Actions e o comportamento em
tela.

---

## 1. O que é este projeto

Um **fork do Chatwoot** (`github.com/MChaves-21/chatwoot`, branch
`goncalves-main`), baseado na **versão 4.16.2**, com uma tela nova: o **Kanban
Comercial**, que não existe no Chatwoot original.

Não é aplicação separada, não é plugin, não é iframe. É uma rota Vue dentro do
próprio dashboard, usando a sessão do agente que já está logado.

### O fork é quase todo aditivo — e isso foi de propósito

Fora da pasta do kanban, o fork toca **três arquivos**, e nos três só
acrescenta ou troca uma linha:

| Arquivo | O que mudou |
|---|---|
| `components-next/sidebar/Sidebar.vue` | +7 linhas: o item "Kanban" no menu lateral |
| `routes/dashboard/dashboard.routes.js` | +2 linhas: importa e registra as rotas do kanban |
| `components/widgets/conversation/MoreActions.vue` | **12/08** — 1 linha de import trocada: o botão Resolver dá lugar ao `ConversationStatePicker` do kanban |

Mais o workflow de build, que é arquivo novo
(`.github/workflows/build-goncalves.yml`).

**Todo o resto vive em `app/javascript/dashboard/routes/dashboard/kanban/`, uma
pasta que o upstream não tem.** Foi escolha consciente: mantém o conflito de
merge perto de zero.

**A troca em `MoreActions.vue` foi desenhada para ser barata.** O
`buttons/ResolveAction.vue` do upstream continua no repositório e **intacto** —
reverter aquela única linha de import devolve o botão Resolver original. Todo o
comportamento novo mora em
`kanban/components/ConversationStatePicker.vue`. Se um merge futuro conflitar
ali, resolva pegando a versão do upstream e reaplicando a linha.

**Consequência prática:** atualizar o Chatwoot continua viável. O fork está
~107 commits atrás do `upstream/develop`, e o atrito possível são aquelas ~10
linhas. Se o merge doer, quase certamente é porque alguém mexeu em arquivo do
upstream — evite, e quando não der para evitar, registre aqui.

---

## 2. Acessos e infraestrutura

| O quê | Onde | Observação |
|---|---|---|
| Repositório | `github.com/MChaves-21/chatwoot`, branch `goncalves-main` | Clonado em `C:\Users\assis\Documents\GitHub\chatwoot`, usado pelo GitHub Desktop |
| Produção | `https://chatwoot.goncalvesesilva.cloud` | account_id **1** |
| Painel | `easypanel.goncalvesesilva.cloud` | projeto `n8n`, serviço `chatwoot`, aba **Fonte** |
| n8n | `n8n.goncalvesesilva.cloud` | 61 workflows. É onde vive a IA e o sync de etiquetas |
| Registro de imagem | `ghcr.io/mchaves-21/chatwoot` | tags `:goncalves` (móvel) e `:<sha>` (fixa) |

Serviços no mesmo projeto do Easypanel: `chatwoot`, `chatwoot-db`,
`chatwoot-redis`, `chatwoot-sidekiq`, `evolution-api` (+db, +redis), `n8n`
(+postgres, +redis), `nocodb` (+db, +redis).

### As duas caixas de entrada

| id | Nome | Tipo | Conversas (12/08) |
|---:|---|---|---:|
| 6 | Auxílio acidente | `Channel::Api` | 370 |
| 9 | BPC | `Channel::Api` | 163 |

**São `Channel::Api`, não WhatsApp nativo.** Isso importa mais do que parece:

- **Campanhas do Chatwoot não funcionam nessas caixas.** `app/models/campaign.rb`
  valida `inbox_type` contra `['Website', 'Twilio SMS', 'Sms', 'Whatsapp']` e
  rejeita o resto. Não é flag, é o tipo da caixa. Qualquer pedido de "mensagem
  agendada" esbarra aqui — o caminho é n8n.
- **Não dá para criar conversa por importação de contato.** Contato importado
  por CSV entra sem `contact_inbox`; a conversa precisa de uma chamada à API.
  Ver seção 8, item da migração do ChatGuru.
- O envio de mensagem para fora passa por Evolution API + n8n.
- Do lado do Chatwoot, mandar mensagem é
  `POST /api/v1/accounts/1/conversations/{id}/messages`.

### Equipes e agentes (12/08/2026)

**`GET /api/v1/accounts/1/teams` devolve lista vazia. Não existe nenhuma equipe
cadastrada, e as 533 conversas estão todas sem equipe.**

Agentes: 4.

| id | Nome | Papel | Conversas atribuídas |
|---:|---|---|---:|
| 1 | Gonçalves & Silva Advogados Associados | administrator | 76 |
| 2 | Juliana Fernandes | agent | 145 |
| 3 | Gabriel | agent | 1 |
| 4 | Murilo (teste) | agent | 0 |
| — | *sem responsável* | — | **311** |

Isso é o que limita a tabela nova por departamento: ela está pronta, mas só
ganha linha de departamento depois que alguém criar os times em Configurações →
Equipes e passar a atribuir. É processo, não código.

---

## 3. Como trabalhar neste repositório

### Não há `node_modules` no clone

Lint e build locais **não rodam**. Isso é limitação real e muda o método.

**O que dá para fazer sem `node_modules`** (e vale sempre fazer antes de
commitar):

```bash
# sintaxe dos .js
node --input-type=module --check < arquivo.js

# os .vue de verdade — parse + script + template
npm install @vue/compiler-sfc@3        # numa pasta temporária, fora do repo
# depois compileScript() e compileTemplate() em cada arquivo tocado
```

**O que só o build do GitHub Actions pega:** lint do projeto, resolução de
imports, e o Vite compilando para valer. O build leva ~4–5 min e é a
verificação real. Já pegou coisa que o parser não pegava.

**O que só o navegador pega:** arrastar, o comportamento em tela, e os números
contra a base real.

### Testar as regras puras vale a pena

`stateBoard.js` é de funções puras, sem Vue e sem rede, exatamente para poder
ser testado assim. Basta copiar `stateBoard.js` e `stateConstants.js` para uma
pasta, trocar o import para `'./stateConstants.js'` (com extensão) e rodar com
node.

As invariantes que valem checar sempre:

- soma dos estados + não classificadas == total da base;
- **soma das linhas de CADA grupo da matriz == TOTAL, em todas as colunas** —
  vale para os dois grupos porque equipe e responsável são campos únicos, ao
  contrário de "quem atendeu";
- `condensedKeyOf()` devolve algo para todas as 7 colunas detalhadas.

### Consultar a base real em vez de assumir

A API do Chatwoot responde com a sessão do gestor logado no navegador. Ela usa
`devise_token_auth`, então **cookie sozinho dá 401** — é preciso mandar os
cabeçalhos que estão no cookie `cw_d_session_info`:

```js
const raw = decodeURIComponent(document.cookie.split('; ')
  .find(s => s.startsWith('cw_d_session_info=')).split('=').slice(1).join('='));
const s = JSON.parse(raw);
const H = { 'access-token': s['access-token'], client: s.client, uid: s.uid };
const get = async u => (await fetch(u, { headers: H })).json();

await get('/api/v1/accounts/1/inboxes');
await get('/api/v1/accounts/1/labels');
await get('/api/v1/accounts/1/teams');
await get('/api/v1/accounts/1/agents');
await get('/api/v1/accounts/1/contacts?page=1');          // meta.count
await get('/api/v1/accounts/1/conversations?status=all&labels[]=sdr&page=1');
// meta.all_count tem a contagem
```

Praticamente toda decisão boa deste projeto veio de olhar o número antes. Na
rodada 4 isso evitou uma migração de dados inteira (ver seção 6).

---

## 4. Build e deploy — com as armadilhas

### O caminho feliz

1. Commit e push na `goncalves-main` (GitHub Desktop).
2. O GitHub Actions dispara sozinho e leva ~4–5 min. Publica **duas** tags:
   `ghcr.io/mchaves-21/chatwoot:goncalves` e `…:<sha completo>`.
3. Easypanel → projeto `n8n` → serviço `chatwoot` → aba **Fonte** → conferir a
   imagem → **Salvar** → **Implantar**.
4. O restart derruba o atendimento por **cerca de 1 minuto**.

### Armadilha 1: o Easypanel fica preso no sha antigo

**Aconteceu em 11/08 e custou uma rodada inteira.** O campo Imagem estava
fixado em `…:976c64c…`. Clicar em Implantar reinstalava a mesma versão,
indefinidamente, dando a impressão de que o deploy tinha acontecido.

**Antes de implantar, confira a tag na aba Fonte.** Se estiver num sha antigo,
troque, **clique em Salvar** (só digitar não basta) e só então Implantar.

**Como saber se a tela está velha, sem olhar o Easypanel:** se a coluna
"Contrato enviado" ainda aparece no funil de Auxílio, a versão no ar é anterior
a `2b5a78b`. A etiqueta `contrato_enviado` está em **0 conversas** desde 11/08 —
conferido de novo em 12/08. Se a coluna aparece, é imagem antiga, não dado.

### Armadilha 2: git no clone do Windows é lento e deixa lock preso

Comandos git rodando de fora do Windows (por sandbox/WSL) demoram minutos e
podem estourar timeout, deixando `.git/index.lock` para trás — e sem permissão
para apagá-lo.

**Se aparecer `Unable to create '.git/index.lock': File exists`:** apague
`C:\Users\assis\Documents\GitHub\chatwoot\.git\index.lock` pelo Explorer e
commite pelo GitHub Desktop.

**Na prática: commitar pelo GitHub Desktop, sempre.** É nativo e instantâneo.

### Rollback

Apontar a imagem para um sha anterior e Implantar:

| sha | O que é |
|---|---|
| *(a commitar)* | rodada 4 — matriz por estado, seletor na conversa, tags em Criados |
| `aa4b4ac289dbf354c94c9097525c26c32a9a41b8` | atual no ar — tabela por estado + funil de 12 colunas |
| `2b5a78b3008a3be2260a52d7c1abdf729a6152bb` | tabela por estado, ainda com "Contrato enviado" |
| `976c64ccde5a76fe22c3683d78ddccd33aec7113` | v1: quadro por estado em cards |

### Horário

A equipe fotografa a tabela de atendimentos às **12h e às 17h30** e manda no
grupo. Evite implantar em cima desses horários.

---

## 5. Mapa do código

Tudo em `app/javascript/dashboard/routes/dashboard/kanban/`, exceto onde dito.

### Os três quadros

| Quadro | Fonte das colunas | Caixa | Arrasta? |
|---|---|---|---|
| Auxílio Acidente | etiquetas de etapa (**11 colunas** desde 12/08) | 6 | sim |
| BPC | etiquetas de etapa (15 colunas) | 9 | sim |
| Por estado | `status` + tempo parada (7 estados, condensados em 5) | 6 e 9 juntas | não — é tabela |

### Arquivos

| Arquivo | Papel |
|---|---|
| `Index.vue` | Cabeçalho, seletor de funil, navegação horizontal, roteia entre os modos |
| `constants.js` | Funis de etiqueta, tags, etapas de descarte, `BPC_FUNNEL_ID`, prefs locais |
| `helpers.js` | Funções puras: datas, telefone, filtros, ficha do lead |
| `api.js` | Chamadas do quadro de etiquetas + `toggleStatus` |
| `useKanbanBoard.js` | Estado dos dois funis de etiqueta; `moveToStage` e `toggleTag` |
| `components/KanbanColumn.vue` | Coluna — **só** dos funis de etiqueta |
| `components/KanbanCard.vue` | Card — **só** dos funis de etiqueta |
| `stateConstants.js` | Colunas por estado, períodos, nomes das caixas, cores da matriz, tetos |
| `stateBoard.js` | Classificação, tabelas e **`buildStateMatrix`**. Funções puras, testáveis |
| `stateApi.js` | Varredura das duas caixas, leitura de mensagens e `directory()` (times+agentes) |
| `useStateBoard.js` | Estado da tela por estado, período, "quem atendeu", **matriz e filtros** |
| `components/StateBoard.vue` | Cabeçalho do quadro por estado |
| **`components/StateMatrix.vue`** | **NOVO 12/08** — a matriz departamento/agente × estado. É também o controle de filtro da lista |
| `components/StateTable.vue` | A lista paginada. **Não tem mais chips** — quem filtra é a matriz |
| **`components/ConversationStatePicker.vue`** | **NOVO 12/08** — seletor de 4 estados + "Marcar como não lida" no cabeçalho da CONVERSA (não do kanban) |
| `components/DailyTableModal.vue` | Tabela do dia + estoque, com "Copiar imagem" |
| `tableImage.js` | Gera o PNG da tabela no canvas, para o WhatsApp |
| `excel.js` | Exportação |
| `components/ContactPopup.vue` | Ficha do contato, resumo (escondido no BPC), sugestão de tags |
| `components/DayViewModal.vue` | Criados / Atualizados do dia, **com coluna Tags desde 12/08** |
| `components/FiltersModal.vue`, `SettingsModal.vue`, `BaseModal.vue` | Modais |
| `routes.js` | Registro da rota |

`KanbanColumn` e `KanbanCard` servem só aos dois funis de etiqueta. O quadro por
estado é tabela e não usa nenhum dos dois.

---

## 6. Coisas que já custaram caro — não reaprender

- **"Aberto" e "Em atendimento" são o MESMO status no Chatwoot.** Só existem 4
  status: `open`, `pending`, `snoozed`, `resolved`. A diferença entre Aberto e
  Em atendimento é `first_reply_created_at`, um carimbo que o servidor grava na
  primeira resposta e que **não tem endpoint para apagar**. Por isso o seletor
  na conversa tem 4 opções e não 5 — um botão "Aberto" só pareceria funcionar.
  "Fechado" também não é status: é a etiqueta de descarte.
- **A ordem de prioridade das colunas do quadro por estado importa.** Fechado
  vence Resolvido de propósito. Sem a precedência, metade dos desqualificados
  cairia em Resolvido e a conta de perdas zeraria. **O seletor da conversa
  repete essa mesma precedência** — se as duas telas divergirem, a mesma
  conversa aparece em estados diferentes em cada uma.
- **Não somar as linhas para achar o TOTAL na tabela de atendimentos** (a do
  modal, por "quem atendeu"). Uma conversa atendida por duas pessoas aparece em
  duas linhas. **Na matriz nova isso NÃO acontece**: equipe e responsável são
  campos únicos, então a soma bate — e é por isso que ela não tem nota de
  rodapé, ao contrário da outra.
- **"Quem atendeu" vem do remetente da mensagem, não do `assignee`.** Custa uma
  requisição por conversa — rodar só sobre o recorte do dia, **nunca** sobre a
  base inteira.
- **Não dá para separar pessoas na caixa 6.** 100% das mensagens de saída saem
  da conta da empresa.
- **Cores e fundos têm que usar os tokens do Chatwoot** (`n-slate-*`, `n-brand`,
  `n-alpha-*`). Exceções deliberadas: o PNG do `tableImage.js`, e as cores de
  ESTADO (`STATE_COLUMNS`, `MATRIX_CELL_COLORS`) — essas são cor de dado, não de
  interface, e precisam significar a mesma coisa no tema claro e no escuro.
- **Carga sequencial, nunca paralela.** Em paralelo as colunas esbarram no rate
  limit do Chatwoot.
- **A API de etiquetas SUBSTITUI o conjunto, não acrescenta.** Quem chama monta
  a lista final completa.
- **`convStageLabel` devolve a PRIMEIRA etiqueta de etapa que casa.** Se uma
  conversa tiver duas etapas do mesmo funil, ela aparece numa coluna ou noutra
  conforme a ordem de gravação.
- **O funil de Auxílio NÃO tem coluna "Sem etapa"** (só o BPC tem). Conversa com
  etiqueta de etapa que não é coluna fica **invisível** ali. Vale para
  `contrato_enviado` e, desde 12/08, para `lead_potencial`.
- **Antes de migrar dado, olhe se a migração é mesmo necessária.** Em 12/08 a
  fusão de "Lead potencial" em "Comercial" parecia exigir migração das 3
  conversas. Ao olhar cada uma, as 3 já tinham outra etiqueta de etapa (#342 e
  #572 com `aguardando_assinatura`, #345 já com `comercial`), então remover a
  coluna bastou — **zero escrita em produção**. Cinco minutos de consulta
  pouparam uma migração e o risco dela.
- **Se o período/escopo muda sem recarregar, derive — não armazene.**
- **Filtro compartilhado por dois componentes mora no composable.** Os chips do
  `StateTable` viraram a matriz; se cada componente guardasse a própria cópia do
  recorte, a contagem de cima passaria a discordar da lista de baixo. Foi por
  isso que `stateFilter` e `rowFilter` subiram para o `useStateBoard`.
- **A matriz filtra por coluna CONDENSADA, a lista carrega a DETALHADA.**
  `condensedKeyOf()` faz a tradução. Sem ela, clicar em "Em atend." não casaria
  com linha nenhuma e a lista abriria vazia — parecendo que os dados sumiram.
- **Descartar um lead aplica `atendimento_humanizado`** (ver
  `DISQUALIFIED_LABELS`), o que desliga o robô do n8n. Só acrescenta, nunca
  remove.
- **Descartar agora também RESOLVE a conversa** (12/08). É o que tira o lead da
  lista de conversas sem mexer na lista do Chatwoot original. Duas consequências:
  ela continua visível para quem filtrar por "Todas", e **se o cliente responder,
  o Chatwoot reabre a conversa sozinho** e ela volta para a lista.

---

## 7. Números da base (12/08/2026)

**533 conversas · 687 contatos.** Eram 518 em 11/08.

| Por status | |
|---|---:|
| open | 489 |
| resolved | 42 |
| pending | 2 |
| com mensagem não lida | 159 |

| Etiqueta | Conversas |
|---|---:|
| sdr | 300 |
| comercial | 36 |
| desqualificado | 12 |
| aguardando_assinatura | 7 |
| descarte_sdr | 7 |
| lead_potencial | **3** (as 3 já têm outra etapa) |
| contrato_enviado | **0** |
| autismo | 0 |

Etiquetas fora dos funis que valem conhecer: `atendimento_humanizado` (~222,
desliga o robô) e `manual` (~138, marca movimento feito por pessoa).

**A maior parte da base ainda está na primeira coluna do seu funil.** O funil
existe, mas não está sendo percorrido — isso é processo, não código.

---

## 8. O que está pendente

### Da rodada 4 (feito, aguardando deploy)

Ver seção 0.

### Decisões de processo que travam telas prontas

1. **Criar as Equipes no Chatwoot.** A matriz por departamento está pronta e
   escondida: com `GET /teams` vazio, o grupo "Departamentos" não aparece e no
   lugar vai um aviso. Criar Comercial, SDR, Closer e Suporte em Configurações →
   Equipes e passar a atribuir faz as linhas surgirem **sem novo deploy**.
2. **Atribuir conversas.** 311 de 533 (58%) estão sem responsável. Enquanto
   isso, a maior linha da tabela é "Não atribuídas".
3. **As conversas paradas há +7 dias.** A tela escancara; falta decidir o que a
   equipe faz com elas.

### Migração do ChatGuru (analisada em 12/08, NÃO executada)

Dois CSVs exportados do ChatGuru, ambos com as **mesmas 6 colunas**:
`Nome, Whatsapp, Link, Tags, Cadastro, Data_Última_Msg`.

| Arquivo | Linhas | Já existem no Chatwoot | Novos |
|---|---:|---:|---:|
| `ChatGuru__Base_CRM_…csv` (Closer) | 267 | 4 | 263 |
| `Guru sdr.csv` (SDR) | 164 | 14 | 150 |
| **Total** | **431** (zero repetidos entre os dois) | 18 | **413** |

**Não há histórico de mensagens nos arquivos.** O máximo importável é: nome,
telefone, tags, data de cadastro, data da última mensagem e o link do ChatGuru.
Se o histórico for necessário, ele precisa sair de outro export do ChatGuru —
não destes.

Achados que mudam o desenho:

- **As tags são strings concatenadas com hífen, não uma lista.** 91 combinações
  distintas no Closer; ex.: `Meta-Autismo-Não respondeu-Potencial/Demanda Boa`.
  Precisam ser quebradas e mapeadas para etiquetas do Chatwoot antes de entrar.
  As mais frequentes: `Meta` (origem), `Autismo` / `pedido em analise` /
  `Auxilio-acidente` (produto), `Potencial/Demanda Boa`, `Não respondeu`,
  `Não tem laudo`, `Agendado`.
- **`Autismo` aparece em 196 dos 431 leads e não existe como funil aqui.** A
  etiqueta `autismo` existe no Chatwoot com 0 conversas. Decidir se vira o funil
  BPC, um funil novo, ou só uma tag — antes de importar, não depois.
- **184 dos 267 telefones do Closer têm 12 dígitos**, ou seja, sem o nono
  dígito. Importar sem normalizar cria contato duplicado quando a pessoa
  escrever pelo número com o 9.
- **55 leads do Closer estão sem tag nenhuma.**
- Importar contato por CSV **não cria conversa** e portanto **não faz o lead
  aparecer no kanban** — o quadro lê conversas. Para aparecer no funil é preciso
  um script contra a API criando `contact_inbox` + conversa + etiqueta.

### Fora do kanban, levantado e não resolvido

4. **Mensagens agendadas.** Impossível pelo Chatwoot com caixas `Channel::Api`
   (ver seção 2). Se for prioridade, o desenho é no n8n.
5. **Data do último sync bem-sucedido do n8n no quadro.** A coluna Fechado
   depende do workflow `Kanban Sync - Supabase → Labels Chatwoot`
   (`yzmFpTjkUiJXWNrl`), que já ficou 175 execuções em erro entre 06 e 10/08. Se
   parar, a coluna congela **em silêncio**.
6. **Redesenho do layout interno do card.** Agora é seguro: `KanbanCard` e
   `KanbanColumn` servem um caso só.
7. **Etapas de "finalizado" pós-venda.** Hoje o caso some do radar quando o
   contrato fecha. Seria um funil jurídico novo. Decisão de processo antes de
   virar código.
8. **Auditoria da IA.** Documento próprio: `CONTEXTO-auditoria-ia.md`. **É
   trabalho no n8n, não neste repositório.**

---

## 9. Riscos que continuam de pé

- **A rodada 4 não passou pelo build do Actions nem por olho humano na tela.**
  É o risco mais imediato.
- **A coluna Fechado depende do n8n.** Falha silenciosa.
- **Atribuição não é rotina** — 58% das conversas sem responsável esvazia
  metade da tabela nova.
- **~107 commits atrás do upstream.** Agora com um arquivo do upstream a mais
  (`MoreActions.vue`), embora de uma linha só.
- **Nenhum teste automatizado no repositório.** A verificação é manual: parser,
  build do Actions, navegador, e o teste ad-hoc das funções puras.

---

## 10. Resumo de uma linha

> Fork do Chatwoot 4.16.2 com um Kanban Comercial numa pasta própria, tocando
> ~10 linhas de três arquivos do upstream — merge barato de propósito.
> `aa4b4ac28` no ar; a **rodada 4 está escrita no clone e não commitada** (ver
> seção 0). Build automático no push (~4 min), deploy manual no Easypanel com
> ~1 min de queda, e **confira a tag antes de implantar**. Sem `node_modules` no
> clone: a verificação é parser + build do Actions + navegador, e as regras
> puras de `stateBoard.js` dão para testar isoladamente. As duas telas novas
> dependem de decisão de processo para virar úteis: **criar Equipes** e
> **atribuir conversas**.
