# Contexto — melhorias no kanban

**Data:** 11/08/2026 (v1 em 10/08)
**Estado:** v1 em produção (`976c64c`). Rodada 2 **escrita no clone, não
implantada** — falta commit, build e troca de tag no Easypanel.
**Para:** próxima rodada de trabalho

> Documento auto-suficiente. Quem abrir conversa nova trabalha sem o histórico.

---

## 1. Onde estamos

### 1.1 O que subiu hoje

Commit `976c64ccde5a76fe22c3683d78ddccd33aec7113`, branch `goncalves-main`,
imagem `ghcr.io/mchaves-21/chatwoot:976c64c…` apontada no Easypanel
(projeto `n8n`, serviço `chatwoot`, aba **Fonte**).

- **3º quadro "Por estado"** — 7 colunas, somente leitura, cruza as caixas 6 e 9.
- **Tabela de atendimentos** — modal com dois blocos (hoje / estoque) e botão
  **Copiar imagem**, que gera PNG no clipboard para colar no WhatsApp.

**Rollback:** trocar a tag para `296d2bc781b7a379aa3c1f0dc14d92ff55bfa9c7` e
clicar em Implantar.

### 1.2 Verificação de regressão (feita em 10/08 12:05)

| Quadro | Resultado |
|---|---|
| Auxílio Acidente | 88 cards arrastáveis, `cursor-grab` presente, 6 botões do topo de volta |
| BPC | 144 cards arrastáveis, coluna sintética "Sem etapa" intacta |
| Por estado | 513 cards, **0** arrastáveis (correto — é read-only) |
| Console | zero erros em qualquer um dos três |

Nada quebrou.

### 1.3 Números em produção agora

503 conversas na base · 58 com atividade hoje.

| Coluna | Cards |
|---|---:|
| Aberto | 30 |
| Em atendimento · até 2d | 53 |
| Em atendimento · 2 a 7d | 115 |
| Em atendimento · +7d | ~268 |
| Aguardando | 2 |
| Resolvido | 23 |
| Fechado | 12 |

Na tabela do dia: **Sem resposta hoje = 39** de 58. Continua sendo o número que
mais pede ação.

---

## 2. O que o usuário pediu

Três itens, na ordem em que ele falou:

1. **Filtro ou botão para exibir só as informações do dia** no quadro por estado.
2. **Trocar os cards por tabela** no quadro por estado — não gostou do visual de
   cards.
3. **Modernizar o visual dos outros dois quadros** (Auxílio Acidente e BPC).

> O usuário avisou que tem mais observações sobre a tela "Por estado". Este
> documento deve ser atualizado quando elas chegarem — as seções 3 e 4 são o
> lugar delas.

---

## 3. Análise de cada pedido

### 3.1 Filtro do dia — barato, e já dá para fazer mais

**Custo: quase zero.** O `useStateBoard` já carrega a base inteira e já expõe
`todayConversations` (é o que alimenta a tabela do dia). Filtrar é trocar a
lista que alimenta as colunas — sem uma requisição a mais, resposta instantânea.

Onde mexer: `useStateBoard.js`, um `ref` de escopo (`'tudo' | 'hoje'`) que
escolhe entre `conversations` e `todayConversations` antes de chamar
`classifyAll`. O `StateBoard.vue` ganha o botão.

**Ponto a decidir:** o filtro do dia é "teve atividade hoje"
(`last_activity_at >= hoje`) ou "criada hoje" (`created_at >= hoje`)? São
números bem diferentes: **58** contra **10**. A tabela usa o primeiro. Manter
os dois conceitos com o mesmo botão vai confundir.

**Sugestão de ir além:** já que o filtro é de graça, valeria um seletor de
período — Hoje · 7 dias · 30 dias · Tudo — em vez de só um botão. Resolve
também o problema da coluna "+7d", que hoje tem ~268 cards e é onde a tela
trava de fato.

### 3.2 Cards → tabela: é a mudança certa, e resolve mais que estética

Concordo com o pedido, e o motivo técnico é mais forte que o visual: **513
cards no DOM**. É isso que deixa a tela pesada. Uma tabela com linhas finas
mostra 30–40 registros na mesma altura em que hoje cabem 5 cards, e permite
ordenar.

**Mas há uma decisão de fundo aqui.** Se vira tabela, as 7 colunas deixam de
ser colunas visuais. Duas formas:

| Opção | Como fica | A favor | Contra |
|---|---|---|---|
| **A. Tabela única com filtro de estado** | Uma tabela de 503 linhas; o estado vira uma coluna colorida + chips de filtro no topo com a contagem de cada um | Vê tudo junto, ordena por dias parado, acha cliente rápido | Perde a leitura visual de "quanto tem em cada estado" de relance |
| **B. Seções empilhadas** | Uma tabela por estado, com cabeçalho colorido e contador, uma embaixo da outra, recolhíveis | Mantém a noção de agrupamento; dá para recolher "+7d" e sumir com o ruído | Rolagem longa; menos bom para comparar |

**Recomendo a A**, com os chips de contagem no topo cumprindo o papel de "ver
quantos tem em cada estado" — que era o pedido original — e a tabela cumprindo
o de trabalhar a fila.

**Colunas sugeridas para a tabela:** Cliente · Telefone · Estado (chip
colorido) · Caixa (Auxílio/BPC) · Responsável · Última atividade · Dias parado
· abrir.

**Ordenação padrão:** dias parado, decrescente. O que está apodrecendo aparece
primeiro.

**Atenção técnica:** com 503 linhas, renderizar tudo de uma vez volta ao mesmo
problema dos cards. Ou pagina (50 por vez), ou virtualiza. Paginação é mais
simples e suficiente.

### 3.3 Visual dos outros dois quadros

Aqui vale um aviso de escopo: `KanbanCard.vue` e `KanbanColumn.vue` são
**compartilhados** pelos três quadros. Mexer no visual deles mexe nos três — o
que é bom (consistência), mas significa que "melhorar Auxílio Acidente e BPC"
não é uma mudança isolada. Se o quadro por estado virar tabela (3.2), aí sim
esses dois componentes passam a servir só aos funis de etiqueta e ficam livres.

**Ordem sugerida:** fazer 3.2 primeiro (libera os componentes), depois 3.3.

O que dá para melhorar sem inventar moda, mantendo os tokens do design system
do Chatwoot (`n-slate-*`, `n-brand`, `n-alpha-*` — importante, senão o modo
claro/escuro quebra):

- **Cabeçalho de coluna:** hoje é bolinha + título + número solto. Ganharia uma
  faixa fina da cor da etapa e o contador em pill.
- **Densidade do card:** hoje 4 linhas com espaçamento largo. Nome + telefone
  na mesma linha e data em cinza menor economiza ~30% de altura.
- **Estado de coluna vazia:** hoje é "Nenhuma conversa" em texto plano.
- **Feedback de arrastar:** hoje o card fica com `opacity-40`. Falta destacar a
  coluna de destino quando o card passa por cima.
- **Barra de rolagem horizontal:** com 13 colunas no Auxílio Acidente, navegar
  é ruim. Um indicador ou navegação por etapa ajudaria.
- **Contador durante o filtro:** hoje vira `12/34`, que não é óbvio.

---

## 4. Decisões fechadas (10/08, com o usuário)

| # | Decisão | Observação |
|---|---|---|
| 1 | **Seletor de período**, não botão único: Hoje · 7d · 30d · Tudo | Custo praticamente zero, os dados já estão em memória |
| 2 | **"Hoje" = teve atividade hoje** (`last_activity_at`), não "criada hoje" | 58 conversas contra 10. Escolhido para **bater com a tabela** que já está em produção e é fotografada duas vezes por dia — quadro e tabela discordarem seria pior que qualquer imprecisão. Fácil de inverter se a equipe preferir |
| 3 | **Tabela única com chips de filtro por estado** (opção A da 3.2) | Os chips com contagem cumprem o "ver quantos tem em cada estado"; a tabela cumpre o trabalhar a fila |
| 4 | **A tabela substitui os cards** no "Por estado" — sem alternador | Manter os dois modos significaria manter os componentes compartilhados presos ao caso genérico, que é justamente o que se quer eliminar |
| 5 | **Ordem: tabela primeiro, redesenho do card depois** | Ver seção 4.1 |

### 4.1 Por que a ordem importa — o argumento completo

Hoje `KanbanColumn.vue` e `KanbanCard.vue` desenham os **três** quadros:

```
KanbanColumn + KanbanCard
  ├── Auxílio Acidente   13 colunas · arrasta · tags · "carregar mais"
  ├── BPC                15 colunas · arrasta · tags · "carregar mais"
  └── Por estado          7 colunas · NÃO arrasta · sem tags · sem paginação
```

Foi por isso que a prop `draggable` precisou nascer no `KanbanCard`: mesmo card,
dois comportamentos.

**O custo de redesenhar antes:** toda decisão de layout teria de servir aos dois
usos. Exemplo concreto — dar destaque aos chips de tag melhora o card do funil,
mas no quadro por estado não existe tag nenhuma (`tags: []`) e o card fica com
um buraco. Um indicador de "arrastável" idem: no quadro por estado não pode
aparecer. Cada escolha vira meio-termo.

**Depois da tabela, o segundo uso desaparece:**

```
KanbanColumn + KanbanCard
  ├── Auxílio Acidente
  └── BPC                    ← só funis de etiqueta

StateTable.vue (novo)
  └── Por estado             ← não usa nenhum dos dois
```

Os componentes passam a servir **um caso só** e o redesenho pode ser opinativo
em vez de genérico. De quebra, a prop `draggable` some — não tem mais razão de
existir.

### 4.2 O que do visual sobrevive à mudança (pode ser feito já)

Estas quatro não dependem do layout do card e **não** serão retrabalho:

- cabeçalho de coluna: faixa fina da cor da etapa + contador em pill;
- estado de coluna vazia (hoje é "Nenhuma conversa" em texto plano);
- destaque da coluna de destino durante o arrasto (hoje só o card muda de
  opacidade);
- navegação horizontal com 13–15 colunas, que hoje é ruim.

Fica adiado só o **layout interno do card**, que é onde tags e drag mandam no
desenho.

---

## 4.3 Ainda em aberto

1. ~~Quais colunas exatamente na tabela~~ — **confirmadas em 11/08/2026**: as 8
   da proposta 3.2, sem alteração.
2. ~~As observações que o usuário ainda vai trazer sobre a tela "Por estado"~~ —
   **nenhuma**, confirmado em 11/08/2026. Se aparecerem depois, entram aqui.

---

## 4.4 Rodada 2 — o que foi escrito (11/08/2026)

Ainda **não implantado**: código no clone, sem commit e sem build. Ver 4.5.

### Arquivos novos

| Arquivo | O quê |
|---|---|
| `components/StateTable.vue` | A tabela. Chips de estado, busca, ordenação, paginação de 50 |

### Arquivos alterados

| Arquivo | O quê |
|---|---|
| `stateConstants.js` | `INBOX_NAMES`, `STATE_SCOPES`, `DEFAULT_STATE_SCOPE`, `STATE_TABLE_PAGE_SIZE` |
| `stateBoard.js` | `scopeCutoffTs(days, now)` — corte de janela em dias inteiros |
| `useStateBoard.js` | `scope` + `scoped` + `scopedTotal`; `buckets`/`unclassified` viraram `computed` |
| `components/StateBoard.vue` | Seletor de período; corpo virou `StateTable`, não mais colunas |
| `components/KanbanColumn.vue` | Faixa de cor, contador em pill, vazio tracejado, destaque de drop; prop `draggable` removida |
| `components/KanbanCard.vue` | Prop `draggable` removida — sempre arrastável |
| `Index.vue` | Setas de navegação horizontal sobre os quadros de etiqueta |

### Decisões tomadas durante a escrita

- **`buckets` deixou de ser `reactive` e virou `computed`.** Com o período
  mudando sem recarregar, havia duas entradas para manter em sincronia na mão.
  Derivar elimina a classe inteira de bug em que o contador do topo discorda da
  lista de baixo.
- **A janela de período conta dias inteiros**, não 24h deslizantes:
  `scopeCutoffTs(1)` devolve exatamente `startOfDayTs()`, o mesmo corte da
  tabela que vai para o grupo. Verificado por teste (ver 4.5). Janela
  deslizante mudaria o número a cada minuto — quem confere a mesma tela duas
  vezes na mesma tarde veria valores diferentes sem nada ter acontecido.
- **`stockTable` continua sobre a base inteira**, de propósito. "Estoque"
  sempre significou tudo; se seguisse o seletor, a mesma foto teria significados
  diferentes conforme o botão ativo na hora do "Copiar imagem".
- **`overDepth` em vez de booleano** no destaque de drop: `dragleave` dispara a
  cada troca de filho, e com booleano o destaque piscava enquanto o card
  atravessava a coluna.
- **Uma coisa a mais que não estava combinada: campo de busca na tabela.**
  A seção 3.2 lista "acha cliente rápido" como vantagem da opção A, e com 503
  linhas em páginas de 50 isso não acontece só com ordenação. Busca por nome,
  telefone (cru e formatado) e `#id`. **Se não quiser, é só apagar o `<input>`
  e o trecho de `query` — nada mais depende deles.**

### 4.5 Verificação feita (11/08/2026, antes do commit)

Não há `node_modules` no clone, então lint e build não rodam. O que deu para
fazer, num sandbox à parte:

- `node --check` nos quatro `.js` — sem erro de sintaxe.
- `@vue/compiler-sfc` compilando os cinco `.vue` tocados (`parse` +
  `compileScript` + `compileTemplate`) — os cinco passam.
- Teste das funções puras contra base sintética:
  - `scopeCutoffTs(1) === startOfDayTs()` — o quadro e a tabela usam o mesmo
    corte, que era a razão da decisão 2;
  - 7d e 30d recuam 6 e 29 dias inteiros;
  - o corte não muda ao ser recalculado horas depois no mesmo dia;
  - **soma dos chips + não classificadas == linhas da tabela**, nos quatro
    períodos. Esta é a invariante que importa: é ela que impede a tabela de
    discordar do contador logo acima;
  - `desqualificado` + `resolved` continua caindo em Fechado (a precedência da
    seção 5, que já custou caro uma vez).

**O que a verificação NÃO cobre**, e só o navegador cobre: lint do projeto,
comportamento real do arrasto, e os números contra a base de produção.

---

## 4.6 Consulta à base para as dúvidas de 11/08 (etapas de finalizado, agendamento)

Números lidos da API de produção com a sessão do gestor, em 11/08/2026.
**Base: 518 conversas** (eram 503 em 10/08).

### Onde as conversas realmente estão

| Auxílio Acidente (caixa 6) | | BPC (caixa 9) | |
|---|---:|---|---:|
| sdr | **295** | bpc_lead_novo | **95** |
| comercial | 36 | bpc_aguardando_requisito | 9 |
| contrato_em_elaboracao | 8 | bpc_desqualificado | 11 |
| contrato_enviado | 7 | bpc_qualificado | 3 |
| aguardando_assinatura | 6 | bpc_analise_medica | 1 |
| lead_potencial | 3 | bpc_efetivado | **0** |
| contrato_assinado | 1 | bpc_contrato_assinado | 0 |
| analise_medica | **0** | bpc_documentos_iniciais | 0 |
| analise_juridica | **0** | bpc_aguardando_assinatura | 0 |
| efetivado | **2** | bpc_pegar_senha | 0 |
| desqualificado | 11 | bpc_analise_juridica | 0 |
| descarte_sdr | 7 | bpc_pos_juridica | 0 |
| aguardando_tempo | 0 | bpc_cancelado | 0 |
| | | bpc_fechado_sem_resposta | 0 |

**390 das 518 (75%) estão na PRIMEIRA coluna** do seu funil. As etapas de
finalizado somam 31 (6%), e `efetivado` tem 2 em toda a base.

### Três coisas que a consulta revelou

1. **As etapas de finalizado já existem nos dois funis** — e estão vazias. O
   gargalo não é falta de coluna de destino, é que o card não é movido. Criar
   coluna nova num funil que não é trabalhado só acrescenta coluna vazia.
   O que **não** existe é etapa DEPOIS de `efetivado`: hoje o caso sai do radar
   assim que o contrato fecha. Isso é um funil jurídico/processual novo, não
   mais uma coluna no comercial.
2. **As duas caixas são `Channel::Api`**, não `Whatsapp`. Isso mata o
   agendamento nativo do Chatwoot — ver 4.7.
3. **Nenhuma das 10 `DEFAULT_TAGS` existe como etiqueta na conta.** Nem
   `recebendo_beneficio`, nem `urgente`, nenhuma. Consequência: os chips de tag
   no card nunca aparecem, o filtro por tag tem 10 opções que não casam com
   nada, e `suggestTags` sugere etiqueta inexistente. Etiquetas de verdade que
   o kanban ignora: `contrato_fechado` (0), `atendimento_humanizado` (222),
   `meta`, `recebendo_31`, `autismo`, `caps`, `quer_*`, `notificado_*` (todas
   as `quer_`/`notificado_` estão em 0 — cheiram a fluxo n8n morto).
   `manual` tem 138, ou seja, o quadro está sendo usado para mover card.

## 4.6.1 Regra nova: descartou, robô para (11/08/2026)

Decidido com o usuário: **quando a pessoa é desqualificada, o atendimento
automático tem de parar para ela.**

Como estava antes da mudança — das 31 conversas finalizadas:

| Etapa | com `atendimento_humanizado` | sem |
|---|---:|---:|
| desqualificado | 7 | **4** |
| descarte_sdr | 6 | **1** |
| bpc_desqualificado | 11 | 0 |
| efetivado | 2 | 0 |

Ou seja, a equipe põe quase sempre, mas 5 escaparam — e essas 5 pessoas já
descartadas seguiam elegíveis ao fluxo do robô. Depender de alguém lembrar não
funcionou.

**Implementado:** `moveToStage` agora aplica `NO_AUTOMATION_LABEL`
(`atendimento_humanizado`) junto quando o card cai em qualquer
`DISQUALIFIED_LABELS` (`desqualificado`, `descarte_sdr`, `bpc_desqualificado`,
`bpc_cancelado`, `bpc_fechado_sem_resposta`).

Duas escolhas deliberadas:

- **Só acrescenta, nunca remove.** Tirar o card de uma etapa de descarte não
  religa o robô. A etiqueta está em 222 conversas e é usada fora do quadro;
  removê-la por engano mandaria mensagem automática para quem já estava em
  atendimento humano.
- **`efetivado`/`bpc_efetivado` ficaram de fora.** As duas de `efetivado` já
  tinham a etiqueta, mas "virou cliente" é decisão de processo diferente de
  "foi descartado", e só a segunda foi pedida. Se a regra valer para os dois, é
  acrescentar duas linhas em `DISQUALIFIED_LABELS`.

**Resolvido em 11/08:** as 5 conversas antigas (#465, #309, #581, #479 em
`desqualificado`; #545 em `descarte_sdr`) receberam a etiqueta pela API.
Conferido depois: **29 conversas nas cinco etapas de descarte, 0 sem
`atendimento_humanizado`.**

## 4.6.2 "Contrato enviado" fundida em "Aguardando Assinatura" (11/08/2026)

Pedido do usuário: tirar a fase "Contrato enviado" do funil de Auxílio
Acidente, deixando só "Aguardando Assinatura".

**O que a consulta mostrou antes de mexer** — e que mudou o serviço:

| | |
|---|---:|
| Conversas em `contrato_enviado` | 7 |
| Dessas, que já tinham **também** `aguardando_assinatura` | **6** |
| Só com `contrato_enviado` | 1 (#49) |

As duas colunas já estavam sobrepostas. Como `convStageLabel` devolve a
**primeira** etiqueta de etapa que casa, esses 6 cards apareciam numa coluna ou
na outra conforme a ordem em que a etiqueta foi gravada — resultado
imprevisível. Unificar não foi só simplificar: consertou isso.

Apagar a coluna sem migrar teria deixado a #49 **invisível**, porque o funil de
Auxílio não tem a coluna sintética "Sem etapa" (só o BPC tem). É o mesmo erro
de 07/08 com `lead_potencial`.

**Executado, nesta ordem:**

1. Dados: as 7 conversas perderam `contrato_enviado` e ficaram com
   `aguardando_assinatura`; o resto das etiquetas foi preservado.
   Conferido: `contrato_enviado` = **0**, `aguardando_assinatura` = **7**.
2. Código: a coluna saiu de `AUXILIO_COLUMNS` (13 → 12 colunas).

**Risco registrado:** se algum fluxo do n8n voltar a aplicar
`contrato_enviado`, a conversa fica invisível no quadro — não cai em coluna
nenhuma. O conserto seria o n8n passar a aplicar `aguardando_assinatura`.

## 4.6.3 As 10 tags passaram a existir (11/08/2026)

As `DEFAULT_TAGS` nunca existiram como etiqueta na conta, então os chips nunca
apareciam e o filtro por tag não achava nada. As 10 foram criadas via API
(`recebendo_beneficio`, `ja_tem_advogado`, `sem_advogado`, `acidente_trabalho`,
`tem_laudo_medico`, `auxilio_negado`, `pericia_agendada`, `contribuinte_inss`,
`documentos_pendentes`, `urgente`), com `show_on_sidebar: true`. Conferido:
10/10 presentes.

Começam vazias — quem der valor a elas é a equipe aplicando, e `suggestTags`
agora sugere etiqueta que existe de verdade.

## 4.7 Mensagens agendadas — por que não sai de graça

Verificado no código do fork e na base:

- O **único** mecanismo nativo de agendamento no Chatwoot é a campanha
  `one_off` com `scheduled_at` (`app/jobs/trigger_scheduled_items_job.rb`).
- `app/models/campaign.rb` valida:
  `unless ['Website', 'Twilio SMS', 'Sms', 'Whatsapp'].include? inbox.inbox_type`
  → **as caixas 6 e 9 são `Channel::Api`, então campanha nem é aceita.**
  Não é questão de flag: `whatsapp_campaign` (`config/features.yml`, default
  `false`) também não ajudaria, porque o tipo da caixa não é `Whatsapp`.
- O que existe de tempo, e não serve: `snoozed_until` (Adiar — reabre a
  conversa na hora marcada, **não manda mensagem**) e as regras de automação,
  que disparam em evento, nunca com atraso.

**Conclusão:** agendar mensagem tem de ser construído fora do Chatwoot. O n8n,
que a equipe já roda, é o lugar natural — a caixa é `Channel::Api`, então o
envio é um POST em
`/api/v1/accounts/1/conversations/{id}/messages`. Falta a fila de pendentes e o
gatilho de horário, que o Chatwoot não vai dar.

---

## 5. Mapa do código (para não reabrir a investigação)

Tudo em `app/javascript/dashboard/routes/dashboard/kanban/`.

| Arquivo | Papel | Mexe em quê |
|---|---|---|
| `stateConstants.js` | Colunas, prioridades, caixas, nomes, tetos | 3.1, 3.2 |
| `stateBoard.js` | Classificação e montagem das tabelas. Funções puras, testáveis | 3.1 |
| `stateApi.js` | Varredura das duas caixas + leitura de mensagens | — |
| `useStateBoard.js` | Estado da tela por estado, recorte do dia, "quem atendeu" | 3.1, 3.2 |
| `tableImage.js` | PNG da tabela no canvas | — |
| `components/StateBoard.vue` | Quadro por estado | 3.1, 3.2 |
| `components/DailyTableModal.vue` | Tabela do dia + estoque | 3.2 |
| `constants.js` | Funis dos dois quadros de etiqueta | — |
| `useKanbanBoard.js` | Estado dos quadros de etiqueta | — |
| `Index.vue` | Cabeçalho, seletor de funil, roteia entre os dois modos | 3.1, 3.3 |
| `components/KanbanCard.vue` | Card — **compartilhado pelos 3 quadros** | 3.3 |
| `components/KanbanColumn.vue` | Coluna — **compartilhada pelos 3 quadros** | 3.3 |

### Coisas que já custaram caro e não devem ser reaprendidas

- **A ordem de prioridade das colunas importa de verdade.** Das 12 conversas em
  Fechado, 6 estão `resolved` e 6 `open`. Sem a precedência, metade cairia em
  Resolvido e metade em Em atendimento, e a contagem de perdas zeraria.
- **Não somar as linhas para achar o TOTAL.** Uma conversa atendida por duas
  pessoas aparece em duas linhas. O TOTAL conta conversas distintas; a tela
  mostra uma nota quando as linhas somam mais.
- **"Quem atendeu" vem do remetente da mensagem, não do `assignee`.** Das 58
  conversas de hoje, 4 têm responsável. Custa uma requisição por conversa —
  só rodar sobre o recorte do dia, nunca sobre as 503.
- **Não dá para separar pessoas na caixa 6.** 100% das mensagens de saída saem
  da conta da empresa. Nenhum código resolve isso.
- **Cores e fundos têm que usar os tokens do Chatwoot** (`n-slate-*`,
  `n-brand`, `n-alpha-*`). Cor fixa quebra o modo claro/escuro. Exceção
  deliberada: a imagem PNG do `tableImage.js`, que é sempre clara porque vai
  para o WhatsApp.
- **Carga sequencial, nunca paralela.** Em paralelo as colunas esbarram no rate
  limit do Chatwoot. Está comentado no código.

---

## 6. Riscos que continuam de pé

- **Coluna Fechado depende do n8n.** As etiquetas `desqualificado` e
  `descarte_sdr` são mantidas pelo workflow `Kanban Sync - Supabase -> Labels
  Chatwoot` (`yzmFpTjkUiJXWNrl`), que já ficou 175 execuções em erro entre 06 e
  10/08/2026. Se parar, a coluna congela em silêncio. Mitigação pendente:
  mostrar no quadro a data do último sync bem-sucedido.
- **268 conversas paradas há +7 dias.** Abertas, sem atividade, ninguém
  encerrou. É problema de processo, mas a tela agora escancara.
- **Atribuição não é rotina.** 370 de 503 sem responsável. Enquanto for assim,
  o bloco "Estoque por responsável" da tabela é quase só uma linha.
- **Divergência com o upstream.** O fork está 17 commits à frente e 95 atrás de
  `chatwoot/chatwoot:develop`. Quanto mais se mexe em `KanbanCard`/
  `KanbanColumn`/`Index.vue`, mais caro fica o merge. O código novo do quadro
  por estado é todo em arquivos que o upstream não tem — isso foi de propósito.

---

## 6.1 Plano das próximas rodadas

### Rodada 2 (escrita em 11/08/2026 — falta commit, build e deploy)

1. **Seletor de período** no quadro por estado — Hoje · 7d · 30d · Tudo.
   `useStateBoard.js` ganha um `ref` de escopo que escolhe a lista antes do
   `classifyAll`; `StateBoard.vue` ganha o controle. Sem requisição nova.
2. **`StateTable.vue`** substituindo os cards: tabela paginada (50 por vez),
   ordenável, ordem padrão por dias parado decrescente, chips de estado com
   contagem no topo servindo de filtro.
   Colunas propostas: Cliente · Telefone · Estado · Caixa · Responsável ·
   Última atividade · Dias parado · abrir.
3. **Subconjunto seguro do visual** (4.2) nos dois quadros de etiqueta.

Ao fim da rodada 2, `KanbanColumn`/`KanbanCard` só servem Auxílio Acidente e
BPC — e a prop `draggable` pode ser removida. **Feito: a prop saiu dos dois
componentes.**

### Rodada 3

4. Redesenho do layout interno do card, agora livre para ser opinativo.
5. Pendências antigas, se entrarem no escopo: data do último sync do n8n no
   quadro (ver seção 6) e o que fazer com as 268 conversas paradas há +7 dias.

---

## 7. Resumo de uma linha

> v1 no ar. Rodada 2 escrita em 11/08 e **ainda não implantada**: seletor de
> período (Hoje/7d/30d/Tudo, "hoje" = teve atividade hoje, mesmo corte da
> tabela — verificado por teste), os 513 cards trocados por `StateTable.vue`
> paginada e ordenável com chips de estado, e o subconjunto do visual que não
> depende do layout do card. `KanbanCard`/`KanbanColumn` já servem só aos dois
> funis de etiqueta e a prop `draggable` saiu. Falta commit, build (~5 min) e
> troca da tag no Easypanel — o restart derruba o atendimento por ~1 min, então
> depende de confirmação. Rodada 3 (redesenho do card) segue de pé.
