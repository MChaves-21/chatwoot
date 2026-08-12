# Contexto — o fork do Chatwoot da Gonçalves & Silva

**Data:** 12/08/2026 (revisto às 16h35, depois do deploy da rodada 4)
**Estado:** `7f0bad2fe` no ar e conferido em tela. Nada pendente de deploy.
**Para:** qualquer rodada futura de desenvolvimento neste fork.

> Documento auto-suficiente e de propósito geral. Quem abrir conversa nova
> trabalha sem o histórico. Para o que é específico da auditoria da IA, ver
> `CONTEXTO-auditoria-ia.md` — é outro assunto e vive no n8n, não aqui.

---

## 0. Onde as coisas pararam (leia primeiro)

**Nada pendente de deploy.** A rodada 4 foi commitada, construída e implantada
em 12/08/2026 às 16h27, e conferida em tela logo depois. `7f0bad2fe` é o que
está rodando.

O que entrou: matriz departamento/agente × estado na aba "Por estado", seletor
de 4 estados + "Marcar como não lida" no cabeçalho da conversa, coluna Tags em
Criados/Atualizados, resumo escondido no BPC, fusão de "Lead potencial" em
"Comercial", desqualificar passa a resolver a conversa, e **a correção do
descarte do BPC** (ver seção 6 — foi o achado que justificou a rodada).

O que foi conferido em tela, e não só deduzido:

- a matriz somando 534 conversas, com linhas e colunas fechando com o TOTAL;
- o aviso de "nenhuma equipe cadastrada" no lugar do grupo Departamentos;
- "Murilo (teste)" aparecendo com cinco zeros — a semeadura de agente sem
  conversa funciona;
- o seletor no cabeçalho da conversa #699 (caixa 9, `open`, com
  `bpc_desqualificado`) mostrando **"Fechado (desqualificado)"** — o caso exato
  que estava errado antes;
- a coluna Fechado em **31**, contra 19 na versão anterior.

**Ainda em 12/08, depois do deploy, a migração do ChatGuru foi executada:** 428
leads processados, 389 criados, zero erros. A base foi de 534 para 848 conversas
e de 687 para 1.102 contatos. Detalhes e a receita da API na seção 8.

**As pendências que sobraram são de processo, não de código:** atribuir
conversas (58% sem responsável, e agora sobre uma base bem maior) e,
opcionalmente, criar as Equipes. Ver seção 8.

**Não implante às 12h nem às 17h30** — é quando a equipe fotografa a tabela.

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
cadastrada, e as 534 conversas estão todas sem equipe.** Reconferido em 12/08
às 16h35, depois do deploy.

Agentes: 4.

| id | Nome | Papel | Conversas atribuídas |
|---:|---|---|---:|
| 1 | Gonçalves & Silva Advogados Associados | administrator | 76 |
| 2 | Juliana Fernandes | agent | 146 |
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

**Resolução de imports — dá para verificar sem `node_modules`, e vale muito.**
Era o furo real do método: o parser aceita `import X from './naoExiste'` sem
reclamar, e o erro só aparecia no build. Basta varrer os `import ... from '...'`
dos arquivos tocados, resolver os relativos e os apelidos do Vite (`dashboard`,
`shared`, `components`, `helpers`, `next`, `@` → `app/javascript/...`), e testar
a existência do arquivo com as extensões `.js .ts .vue .json` e `/index.*`.
Pacote de npm se ignora. Em 12/08 isso rodou sobre 101 imports internos.

**ATENÇÃO — o build do Actions NÃO roda lint.** Corrigido em 12/08 depois de
ler o `build-goncalves.yml`: o workflow faz checkout, ajusta a edição para
`ee`, loga no GHCR e chama `docker/build-push-action`. Só isso. Não há passo de
`eslint`, `prettier` nem teste. **O que ele de fato verifica é o Vite compilando
dentro do Dockerfile** — ou seja, imports e templates, que são exatamente as
duas coisas que dá para checar antes. Não conte com ele para pegar estilo.

**O que só o navegador pega:** arrastar, o comportamento em tela, e os números
contra a base real.

### Um clone paralelo no Linux resolve quase tudo

O jeito mais rápido de verificar de verdade, sem depender do clone do Windows:
clonar o repositório num ambiente Linux com rede (`git clone --filter=blob:none`
é rápido), copiar por cima os arquivos alterados e rodar ali o parser, a
resolução de imports e o teste das funções puras. O repositório é **público**,
então o clone não precisa de credencial. Foi assim que a rodada 4 foi conferida.

Dois detalhes que economizam tempo: use `git sparse-checkout disable` antes de
checar imports (com sparse ligado, metade dos caminhos "não existe" e você
persegue falso positivo), e a **API do GitHub pode estar bloqueada** no
ambiente — nesse caso o status do build se lê na página pública de Actions, ou,
melhor ainda, perguntando ao registro se a imagem existe:

```bash
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:mchaves-21/chatwoot:pull" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -sI -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.oci.image.index.v1+json" \
  https://ghcr.io/v2/mchaves-21/chatwoot/manifests/<sha> | grep -i digest
```

Se o digest de `:<sha novo>` for igual ao de `:goncalves`, o build terminou e
publicou. Se for igual ao do sha ANTIGO, você está olhando para a imagem velha.

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

E as bordas que já quase passaram batido:

- **equipe ou agente semeado sem nenhuma conversa aparece com zero** — é o
  ponto da semeadura, e some sem ninguém notar se a linha for criada só quando
  há contagem;
- **responsável que saiu da conta continua contado.** As conversas dele existem;
  se a linha não for criada, o TOTAL para de fechar e ninguém sabe por quê;
- **base vazia e `teams: []` não quebram** — é o estado real de hoje;
- a linha "Sem departamento"/"Não atribuídas" vem no topo, o resto por volume.

Uma base sintética pequena cobre tudo isso: o produto cartesiano de status ×
com/sem `first_reply` × faixas de tempo × combinações de etiqueta × equipe ×
responsável dá ~2.500 conversas e roda em menos de um segundo. Vale incluir um
caso sem timestamp nenhum (`idleDays` = Infinity) e um responsável que não está
na lista de agentes.

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

**Como saber se a tela está velha, sem olhar o Easypanel.** O jeito confiável é
a impressão digital do bundle: o Vite põe um hash no nome do arquivo, então o
nome muda a cada build. Rode no console do Chatwoot **antes** de implantar e
de novo depois:

```js
(await (await fetch('/app/accounts/1/dashboard', {cache:'no-store'})).text())
  .match(/\/vite\/assets\/dashboard-[A-Za-z0-9_-]+\.js/)[0]
```

Se o nome não mudou, o deploy não aconteceu — não importa o que o Easypanel
disse. Em 12/08 o bundle foi de `dashboard-D8n-t4aM.js` para
`dashboard-B5iXhEh5.js`. Dá para ir além e conferir se um recurso específico
entrou, baixando os chunks e procurando uma string dele (por exemplo
`bpc_fechado_sem_resposta`, `Sem departamento`, `Fechado (desqualificado)`).

Sinais mais antigos, que continuam valendo: se a coluna "Contrato enviado"
aparece no funil de Auxílio, a versão é anterior a `2b5a78b`; se a aba "Por
estado" não tem a matriz no topo, é anterior a `7f0bad2f`.

### Armadilha 2: git no clone do Windows é lento e deixa lock preso

Comandos git rodando de fora do Windows (por sandbox/WSL) demoram minutos e
podem estourar timeout, deixando `.git/index.lock` para trás — e sem permissão
para apagá-lo.

**Medido em 12/08: `git status --porcelain` no clone montado não termina em 40
segundos** (`exit 124`, saída vazia). Repare no modo de falha: ele devolve
**vazio**, que é indistinguível de "árvore limpa". Quem confiar nessa saída
conclui que não há nada para commitar — exatamente o oposto da verdade.

**Se precisar mesmo de git de fora, use `git --no-optional-locks`**, que evita
tomar o lock do índice em comandos de leitura. Resolve o lock preso, não a
lentidão.

**O jeito confiável de saber o que está por commitar, sem git no Windows:**
comparar hashes. Clone o repositório num Linux, faça checkout do sha que está
no ar, e compare `sha256sum` arquivo a arquivo com os do clone (passando
`tr -d '\r'` antes, para o final de linha não poluir). O que diferir está
alterado; o que existe só de um lado é arquivo novo. Foi assim que os 15
arquivos da rodada 4 foram identificados.

**Se aparecer `Unable to create '.git/index.lock': File exists`:** apague
`C:\Users\assis\Documents\GitHub\chatwoot\.git\index.lock` pelo Explorer e
commite pelo GitHub Desktop.

**Na prática: commitar pelo GitHub Desktop, sempre.** É nativo e instantâneo.

### Rollback

Apontar a imagem para um sha anterior e Implantar:

| sha | O que é |
|---|---|
| `7f0bad2fe48195821e8075d35588075a8dd6a5b9` | **atual no ar** — matriz por estado, seletor na conversa, correção do descarte BPC |
| `aa4b4ac289dbf354c94c9097525c26c32a9a41b8` | tabela por estado + funil de 12 colunas |
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
- **Duas listas com o mesmo sentido divergem. Sempre.** O erro mais caro achado
  em 12/08: `CLOSED_LABELS` (stateConstants.js, usada pelo quadro por estado)
  tinha só `desqualificado` e `descarte_sdr`, enquanto `DISQUALIFIED_LABELS`
  (constants.js, usada pelos funis) tinha essas duas **mais** as três do BPC.
  Nasceram separadas; quando o funil BPC foi criado em 07/08, só uma foi
  atualizada. Resultado, medido contra a base real: **14 conversas com
  `bpc_desqualificado` não contavam como Fechado** — 8 caíam em Resolvido, 3 em
  "Em atendimento · até 2d" e 1 em Aberto. Ou seja, lead descartado aparecendo
  como trabalho em andamento, e a conta de perdas do BPC zerada. A coluna
  Fechado foi de 19 para 31 quando corrigiu. **Hoje `CLOSED_LABELS` é a fonte
  única e `constants.js` reexporta como `DISQUALIFIED_LABELS`.** A direção
  importa: `constants.js` já importa `stateConstants.js`, então inverter cria
  import circular e a lista chega `undefined` na inicialização do módulo.
- **Ao ler estado, leia amplo; ao escrever, escreva específico.** O mesmo dia,
  o mesmo bug em outro lugar: o `currentKey` do `ConversationStatePicker`
  testava só a etiqueta de descarte DA CAIXA, então 8 conversas com
  `descarte_sdr` apareciam como "Fechado" no quadro e como "Em atendimento" no
  seletor. Ao fechar, só uma etiqueta faz sentido (a do funil da conversa, senão
  o card vai para a coluna do outro funil); ao ler, qualquer etiqueta de
  descarte já significa fechado, venha do arrasto, do n8n ou de outra caixa.
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
- **Descartar um lead aplica `atendimento_humanizado`** (ver `CLOSED_LABELS`,
  reexportada como `DISQUALIFIED_LABELS`), o que desliga o robô do n8n. Só
  acrescenta, nunca remove.
- **Descartar agora também RESOLVE a conversa** (12/08). É o que tira o lead da
  lista de conversas sem mexer na lista do Chatwoot original. Duas consequências:
  ela continua visível para quem filtrar por "Todas", e **se o cliente responder,
  o Chatwoot reabre a conversa sozinho** e ela volta para a lista.
- **A chave de identidade do contato é o `identifier`, não o telefone.** Achado
  em 12/08, e sem ele a migração do ChatGuru teria criado 400 contatos-fantasma.
  O `identifier` é o JID do WhatsApp (`558581053558@s.whatsapp.net`) e é por ele
  que o n8n/Evolution casa quem escreve. O detalhe traiçoeiro: **o JID e o
  `phone_number` não têm o mesmo número de dígitos**. Na base, 558 contatos têm
  telefone com 13 dígitos e JID com 12 (sem o nono), e 110 têm 13 nos dois. Não
  dá para derivar um do outro — é histórico de quando a linha foi registrada.
  Ao importar, use o número da origem **literal** como JID e derive só o
  `phone_number` (inserindo o 9 quando faltar). Conferido contra os 19 leads que
  existiam nos dois lados: 19 de 19 com `identifier` idêntico, zero divergência.
- **Antes de acreditar num "N combinações distintas", olhe o separador.** O
  export do ChatGuru concatena tags com hífen — só que `Auxilio-acidente` tem
  hífen no próprio nome, e o split ingênuo criava as tags fantasma `Auxilio` e
  `acidente`. Somando isso às variantes de caixa e acento (`pedido em analise` /
  `Pedido em Análise`), as "96 combinações" eram **24 tags reais**. A diferença
  entre 96 e 24 é a diferença entre "precisa de um projeto" e "mapeia à mão em
  dez minutos".
- **Duas tags que nunca aparecem juntas provavelmente são a mesma, renomeada.**
  `potencial` (93) e `potencial/demanda boa` (57): zero co-ocorrência em 431
  leads, e janelas de uso que se sobrepõem. Foram tratadas como uma só. O mesmo
  teste mostrou que `autismo` (214) e `pedido em analise` (118) também nunca
  coexistem — mas ali significa o contrário: são as duas demandas da base, e foi
  isso que definiu o roteamento entre os dois funis.
- **Depois de importar, varra atrás de conversa sem etiqueta de etapa.** No
  funil de Auxílio ela fica **invisível** (não há coluna "Sem etapa"). Na
  varredura de 12/08 apareceram 11 — dez pré-existentes ou orgânicas, e uma que
  tinha entrado sozinha durante a própria migração e por isso foi pulada pelo
  guard. Vale rodar essa checagem sempre que criar conversa em lote.

---

## 7. Números da base (12/08/2026)

> **Estes números são de ANTES da migração do ChatGuru**, medidos às 16h35 de
> 12/08, logo depois do deploy. Ficam aqui porque é contra eles que a correção
> do descarte BPC foi verificada. Depois da migração (17h15): **848 conversas ·
> 1.102 contatos · caixa 6 com 483 · caixa 9 com 365**, e a coluna BPC "Lead
> novo" saltou de 136 para 335. As contagens por estado abaixo não foram
> remedidas — a migração entrou toda como conversa aberta e sem responsável,
> então "Em atendimento" e "Não atribuídas" cresceram na mesma proporção.

**534 conversas · 687 contatos.** Eram 518 em 11/08. Caixa 6: 371. Caixa 9: 163.

| Por status | |
|---|---:|
| open | 488 |
| resolved | 44 |
| pending | 2 |
| snoozed | 0 |

| Pelo quadro "Por estado" | |
|---|---:|
| Aberto | 3 |
| Em atendimento (3 faixas somadas) | 473 |
| Aguardando | 2 |
| Resolvido | 25 |
| **Fechado** | **31** |

A coluna Fechado era 19 antes da correção de 12/08 (ver seção 6).

| Etiqueta | Conversas |
|---|---:|
| sdr | 299 |
| comercial | 36 |
| bpc_desqualificado | **14** |
| desqualificado | 12 |
| aguardando_assinatura | 7 |
| descarte_sdr | 7 |
| lead_potencial | **3** (as 3 já têm outra etapa) |
| bpc_cancelado | 0 |
| bpc_fechado_sem_resposta | 0 |
| contrato_enviado | **0** |
| autismo | 0 |

Etiquetas fora dos funis que valem conhecer: `atendimento_humanizado` (240,
desliga o robô) e `manual` (177, marca movimento feito por pessoa). As duas
cresceram ~18 e ~39 em um dia — é o sinal de que a equipe está mexendo à mão.

**A maior parte da base ainda está na primeira coluna do seu funil.** O funil
existe, mas não está sendo percorrido — isso é processo, não código.

---

## 8. O que está pendente

Nada de código. Tudo o que segue depende de decisão de processo ou de dado.

### Decisões de processo que travam telas prontas

1. **Criar as Equipes no Chatwoot.** A matriz por departamento está pronta e
   escondida: com `GET /teams` vazio, o grupo "Departamentos" não aparece e no
   lugar vai um aviso. Criar Comercial, SDR, Closer e Suporte em Configurações →
   Equipes e passar a atribuir faz as linhas surgirem **sem novo deploy**.
   *(12/08: o Murilo optou por não criar agora — cria se achar necessário. Não
   é bloqueio para nada, só mantém metade da matriz escondida.)*
2. **Atribuir conversas.** Era 311 de 534 (58%) antes da migração, com essa
   linha sozinha carregando 272 das 473 "Em atendimento". **A migração do
   ChatGuru piorou muito isso**: os 325 leads novos entraram sem responsável,
   então a proporção passou de ~58% para ~75%. A matriz por agente continua
   correta, só que quase toda concentrada em "Não atribuídas". Enquanto não
   houver rotina de atribuição, a tela mostra um número só.
3. **As conversas paradas há +7 dias.** A tela escancara; falta decidir o que a
   equipe faz com elas.

### Migração do ChatGuru — EXECUTADA em 12/08/2026, 17h

Dois CSVs exportados do ChatGuru, ambos com as **mesmas 6 colunas**:
`Nome, Whatsapp, Link, Tags, Cadastro, Data_Última_Msg`. 431 linhas (SDR 164 +
Closer 267), **zero repetidos** dentro de cada arquivo ou entre os dois.

Resultado: **428 processados** (3 telefones inválidos ficaram de fora), **389
criados, 0 erros, 7min52s**. Base foi de 534 para 848 conversas e de 687 para
1.102 contatos, **sem nenhum `identifier` duplicado**.

| Destino | Leads |
|---|---:|
| Funil BPC, caixa 9, em `bpc_lead_novo` | 214 |
| Funil Auxílio, caixa 6, em `sdr` | 111 |
| Só contato, sem conversa | 101 |
| Pulados (19 já existiam + 20 do piloto) | 39 |

**Não há histórico de mensagens nos arquivos.** Entrou: nome, telefone, tags,
e nada mais. Se o histórico for necessário, precisa sair de outro export.

#### Como importar aqui (a receita que funcionou)

Três chamadas por lead, nesta ordem:

1. `POST /contacts` com `{name, phone_number, identifier, inbox_id}` — devolve o
   contato **e** o `contact_inbox` com `source_id`. `inbox_id` e `source_id` são
   lidos direto de `params`, fora do `permit`, então não aparecem em
   `permitted_params` — mas funcionam.
2. `POST /conversations` com `{source_id, inbox_id, contact_id, status}`.
3. `POST /conversations/{id}/labels` com a lista completa.

Sem `inbox_id` no passo 1 não nasce `contact_inbox`, e aí o lead entra só como
contato — que é o caminho certo para quem não é lead ativo. Nesse caso as
etiquetas vão em `POST /contacts/{id}/labels`.

Carga **sequencial**, ~250 ms entre leads. E atenção: o `devise_token_auth`
**rotaciona o token no meio de uma carga longa** — depois de ~1.200 chamadas o
`access-token` guardado numa variável começou a dar 401. Reler o cookie
`cw_d_session_info` resolve; vale reler a cada poucas centenas de chamadas.

#### Etiquetas criadas para receber a migração

`pedido_em_analise` (118 leads), `nao_respondeu` (21), `agendado` (21),
`ads` (16), `indicacao` (9), `nao_tem_laudo` (6), `discovery` (4).
A conta foi de 51 para 58 etiquetas.

#### Mapeamentos decididos, e por quê

- `Auxilio-acidente` → **nenhuma etiqueta**, só roteia para a caixa 6. Auxílio-
  acidente não é acidente de trabalho, e `acidente_trabalho` afirmaria algo
  juridicamente diferente sobre 4 casos.
- `não tem interesse`, `não tem direito`, `Cliente`, `Conseguiu o benefício`,
  `Trabalhista` → **só contato**. Ou já passaram do funil, ou disseram não.
  Mapear os dois primeiros para `descarte_sdr` teria **resolvido a conversa e
  desligado o robô** — efeito colateral real em cima de dado importado.
- `Agendado` → etiqueta própria, não `quer_reuniao` nem `pericia_agendada`:
  são etapas diferentes e o CSV não diz qual.
- `BPC geral` → caixa 9 sem `autismo`.

#### O que sobrou pendente

- **As 18 conversas que já existiam não receberam as etiquetas do ChatGuru.**
  Foi deliberado: aplicar `bpc_lead_novo`/`sdr` em conversa que já está em etapa
  adiantada **empurra o card para trás**, porque `convStageLabel` devolve a
  primeira etiqueta de etapa que casa. As etiquetas que NÃO são etapa (`meta`,
  `lead_potencial`, origem) dariam para aplicar sem risco.
- O link do ChatGuru, a data de cadastro e a data da última mensagem **não
  foram importados**. Caberiam em `additional_attributes` do contato.

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

- **Nenhum teste automatizado no repositório, e o build não roda lint.** É o
  risco de fundo, e o que mais convida a repetir o erro do BPC: nada no
  caminho commit → produção compara duas listas que deveriam ser iguais. A
  verificação continua sendo manual — parser, resolução de imports, teste
  ad-hoc das funções puras e olho na tela.
- **Ainda há pares de constantes que podem divergir.** `CLOSED_LABELS` foi
  unificada em 12/08, mas o padrão "a mesma ideia escrita em dois lugares"
  aparece em outros pontos (as cores de STATE_COLUMNS × MATRIX_CELL_COLORS, os
  rótulos das colunas × os do seletor). Divergir não quebra nada — só faz duas
  telas contarem histórias diferentes, que é pior porque ninguém percebe.
- **A coluna Fechado depende do n8n.** Falha silenciosa.
- **Atribuição não é rotina** — depois da migração do ChatGuru, ~75% das
  conversas estão sem responsável. A tabela por agente virou quase uma linha só.
- **O funil agora tem 325 leads que ninguém trabalhou ainda.** A migração
  encheu a primeira coluna dos dois funis (BPC "Lead novo" foi de 136 para 335).
  Isso é dado real, não erro — mas se ninguém percorrer o funil, o efeito
  prático é que o quadro fica menos legível do que antes, não mais.
- **~107 commits atrás do upstream.** Agora com um arquivo do upstream a mais
  (`MoreActions.vue`), embora de uma linha só.

---

## 10. Resumo de uma linha

> Fork do Chatwoot 4.16.2 com um Kanban Comercial numa pasta própria, tocando
> ~10 linhas de três arquivos do upstream — merge barato de propósito.
> **`7f0bad2fe` no ar, nada pendente de deploy.** Build automático no push
> (~4 min), deploy manual no Easypanel com ~1 min de queda, e **confira a tag
> antes de implantar** — o campo Imagem já ficou preso num sha antigo duas
> vezes. Sem `node_modules` no clone, mas dá para verificar quase tudo num
> clone Linux paralelo: parser, resolução de imports e as funções puras de
> `stateBoard.js`. **Não conte com o build para pegar lint — ele só constrói a
> imagem.** A **migração do ChatGuru foi feita** em 12/08 (389 leads criados,
> zero erros) — a chave é o `identifier`/JID, não o telefone (seção 6). O que
> sobra é processo: **atribuir conversas**, agora ~75% sem responsável, e
> opcionalmente **criar Equipes**.
