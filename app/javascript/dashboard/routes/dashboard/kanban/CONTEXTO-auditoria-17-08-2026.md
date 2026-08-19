# Auditoria e correções — 17/08/2026

Contexto de uma sessão de trabalho sobre o funil PREV, o Kanban e o Chatwoot.
Escrito para quem pegar isso depois sem ter acompanhado a conversa.

---

## 1. Áudios e vídeos da IA

### O que foi feito

13 áudios regravados substituíram os antigos no fluxo **1. COMERCIAL - PREV**
(`kpTwWVsvVYjyhGon`). Os arquivos novos foram para a pasta
`IA PREV/2026-08-14/` no Supabase Storage; **nenhum arquivo antigo foi apagado**
— eles continuam na raiz do bucket.

| Tag | Nó | Arquivo |
|---|---|---|
| `[audio_beneficio]` | Baixar Explicar Beneficio | `2026-08-14/beneficio.ogg` |
| `[audio_honorarios]` | Baixar Explicacao Honorarios | `2026-08-14/honorarios.ogg` |
| `[audio_medo_golpe]` | Baixar Medo de Golpe | `2026-08-14/medo-golpe.ogg` |
| `[audio_distancia]` | Baixar Distancia | `2026-08-14/distancia.ogg` |
| `[audio_caro]` | Baixar Esta Caro | `2026-08-14/caro.ogg` |
| `[audio_desistir]` | Baixar Quero Desistir | `2026-08-14/desistir.ogg` |
| `[audio_pensar]` | Baixar Preciso Pensar | `2026-08-14/pensar.ogg` |
| `[audio_demora]` | Baixar Demora | `2026-08-14/demora.ogg` |
| `[audio_inseguro]` | Baixar Estou Inseguro | `2026-08-14/inseguro.ogg` |
| `[audio_negaram]` | Baixar Negaram | `2026-08-14/negaram.ogg` |
| `[audio_sem_tempo]` | Baixar Nao Tenho Tempo | `2026-08-14/sem-tempo.ogg` |
| `[audio_assinatura]` | Baixar Assinatura | `2026-08-14/assinatura.ogg` |
| `[audio_pos_assinatura]` | Baixar Pos Assinatura | `2026-08-14/pos-assinatura.ogg` |

Vídeo novo (`2026-08-14/apresentacao.mp4`, 3,6 MB, H.264/AAC, 21s, vertical) em
**dois** lugares, apontando para o mesmo objeto:

- `1. COMERCIAL - PREV` → nó **Baixar Video apresentação1** (dispara após `Criar Cliente1`)
- `BPC - Video de primeira mensagem` (`fgjnI5PRzCI5zQZz`) → nó **Baixar Video do Supabase**

### Armadilha registrada: content-type

Os arquivos subiram no Storage como `application/octet-stream`, enquanto os
antigos serviam `audio/ogg`. Isso provavelmente faria o Chatwoot entregar como
anexo de arquivo em vez de áudio/vídeo. Corrigido reenviando cada objeto com o
content-type certo.

**Se subir áudio novo pelo painel do Supabase, confira o content-type.** O jeito
que funciona é `PUT /storage/v1/object/<bucket>/<path>` com `FormData` cujo
`Blob` tenha `{type:'audio/ogg'}` — passar só o header `Content-Type` não basta,
o tipo do Blob vence.

### Trava anti-duplicidade do vídeo

Como o mesmo vídeo roda nos dois canais e eles não se enxergavam, um contato que
passasse pelos dois receberia duas vezes. Foi criada uma trava por **label do
contato** (não da conversa — label de conversa não cruza caixas):

- `video-apresentacao-enviado` — gravado pelos dois fluxos
- `video-bpc-enviado` — legado, ainda checado para não reenviar a quem já recebeu

No PREV a cadeia virou:

```
Criar Cliente1 → Ler Etiquetas do Contato (video) → Ja recebeu o video?
                    ├─ sim → Buscar Contato CW2        (pula o vídeo)
                    └─ não → Baixar → Enviar → Marcar Video Apresentacao Enviado
```

Os dois nós novos estão com `neverError` + `onError: continueRegularOutput`.
**Degradação escolhida de propósito:** se o token do Chatwoot estiver errado, o
fluxo não quebra — volta a enviar o vídeo, como antes. O sintoma de credencial
errada é duplicidade voltar a acontecer, não atendimento parar.

> **Pendência:** a credencial desses dois nós foi atribuída como
> "Chatwoot Token (Retomada/FUP + Etiquetas)" sem poder ser verificada (a API do
> n8n redige credenciais). Confirmar que é a mesma do nó "Ler Etiquetas CW".

### Espaçamento após o vídeo

O `Wait` do loop `Envio em Lote1` virou expressão: **18s antes da primeira
mensagem da IA quando houve vídeo**, 5s no resto.

```js
={{ (() => { try { return ($runIndex === 0 && $('Enviar Video APRESENTAÇÃO CW').isExecuted) ? 18 : 5; } catch (e) { return 5; } })() }}
```

Motivo: numa execução real medida (id 145827), o vídeo saiu em `1786988089` e a
primeira mensagem da IA em `1786988098` — **9 segundos**, com um vídeo de 21s no
meio.

---

## 2. O bug do funil: etapa errada

### Sintoma

Lead `5583993112864` (id 433) aparecia em **contrato em elaboração** estando
ainda em qualificação.

### Causa raiz

O estágio do Kanban não é um campo — é derivado por cascata no nó
`Sync estagios (via proxy)` do workflow **Kanban Sync** (`yzmFpTjkUiJXWNrl`).
A cascata antiga testava `Iniciou_coleta` **antes** de `SEGURADO`:

```js
if (Iniciou_coleta)  return 'contrato_em_elaboracao';   // ← testado primeiro
if (SEGURADO)        return 'comercial';
```

O lead tinha `Iniciou_coleta = true` com `SEGURADO = false`, então caía em
contrato sem nunca passar por comercial. A cascata nem chegava a olhar a
qualificação.

Quem liga essa flag é a tool **Indicar Início ETAPA 9** do agente — e ela **não
tinha `toolDescription`**. O modelo só via o nome do nó, sem nenhuma
pré-condição impedindo a chamada durante a qualificação.

### Correção (v3 do sync)

```js
if (Iniciou_coleta && SEGURADO) return 'contrato_em_elaboracao';
```

Mais `toolDescription` na tool, com a pré-condição explícita de que `SEGURADO`
já tenha sido executada na conversa.

---

## 3. O bug do funil: desqualificado nunca chegava na coluna

### Causa raiz

`desqualificado` existia na lista `STAGES`, mas **`deriveStage` nunca o
retornava**. Varredura no workflow: a palavra só aparecia como texto no prompt
do agente. Nenhum nó gravava isso em lugar nenhum.

Consequência: lead desqualificado ficava indistinguível de quem só parou de
responder — ambos `SEGURADO` nulo, `Status Follow-up = Novo`, coluna `sdr`.

### Correção

Colunas novas em `LEADS PREV`:

| Coluna | Tipo | Default |
|---|---|---|
| `Desqualificado` | boolean | false |
| `Motivo_desqualificacao` | text | null |
| `Descartado_sem_resposta` | boolean | false |
| `Descartado_em` | timestamp | null |

Tool nova no agente: **MARCAR LEAD DESQUALIFICADO** (`supabaseTool`, update em
`LEADS PREV`), com a trava das 3 perguntas escrita na `toolDescription`.

Cascata final (v5):

```js
if (Contrato_assinado)                      return 'contrato_assinado';
if (Contrato_enviado || video_assinatura)   return 'aguardando_assinatura';
if (Desqualificado)                         return 'desqualificado';
if (Descartado_sem_resposta)                return 'descarte_sdr';
if (Iniciou_coleta && SEGURADO)             return 'contrato_em_elaboracao';
if (SEGURADO)                               return 'comercial';
return 'sdr';
```

### O prompt do agente — resolvido em 17/08

Criar a ferramenta não bastava. Por várias horas o sistema ficou num estado
enganoso: a tool existia, estava ligada ao agente e tinha a trava das 3 perguntas
na `toolDescription` — mas o **roteiro** que o agente segue descrevia o
encerramento por desqualificação **sem citar a ferramenta**. Modelo segue
narrativa: ele encerrava educadamente, como sempre fez, e nada era gravado.

Foi exatamente por isso que os quatro leads de 17/08 precisaram de marcação
manual, mesmo com a tool já publicada.

Corrigido: o `systemMessage` do "Advogado Prev3" recebeu 5 inserções.

1. bloco `### MARCAR LEAD DESQUALIFICADO` na seção FERRAMENTAS
2. pré-condição de `SEGURADO` na `### Indicar Início ETAPA 9`
3. ETAPA 2: "execute a ferramenta **MARCAR LEAD DESQUALIFICADO** e encerre"
4. TRAVA DE DESQUALIFICAÇÃO: idem, antes da mensagem de encerramento
5. bloco "Se lead claramente desqualificado": executar a tool antes da mensagem

Verificado após gravar: 4 ocorrências de `MARCAR LEAD DESQUALIFICADO`, 1 de
`PRÉ-CONDIÇÃO OBRIGATÓRIA`, diferença de 1 byte contra o arquivo de origem
(quebra de linha final do `jq`). Publicado como `24b6eb9c`.

> **Lição que vale para o próximo caso:** ferramenta criada ≠ ferramenta usada.
> Num agente com prompt longo e prescritivo, a `toolDescription` sozinha perde
> para o roteiro. Toda tool nova precisa ser citada **no ponto do roteiro** onde
> deve ser chamada.

### Leads corrigidos à mão (não pelo fluxo)

| id | Telefone | Nome |
|---|---|---|
| 433 | 5583993112864 | ~G |
| 455 | 5599991242901 | ~Guilherme |
| 457 | 5551992964488 | ~🍎 |
| 461 | 5555991281465 | ~Eduardo |

Todos com `Motivo_desqualificacao = 'Correcao manual - auditoria 17/08/2026'`.

---

## 4. "Fechado sem resposta" → `descarte_sdr`

### O que faz

Conversa com a label `descarte_sdr` passa a ser:

1. **fechada** no Chatwoot (`toggle_status: resolved`)
2. marcada no lead: `Descartado_sem_resposta`, `Descartado_em`,
   **`Atendimento_humano = true`** — que é o kill switch já respeitado pelo nó
   "Está sendo atendido por humano?1" do PREV, ou seja, o agente para de responder

Implementado dentro do próprio Kanban Sync (v4), que já varre essas labels —
em vez de um workflow paralelo.

Como `descarte_sdr` virou estágio derivável, **a coluna passou a ser estável**:
antes, mover o card à mão era desfeito pelo sync na hora seguinte.

### ⚠️ Incidente registrado: contrato vence descarte

No primeiro disparo manual (execução 145919), **7 das 8 conversas com a label
`descarte_sdr` pertenciam a leads com contrato enviado ou assinado**. A label
estava velha; o próprio sync a sobrescreveria segundos depois no mesmo ciclo.
O código lia a label como verdade, sem cruzar com o estado do lead.

Impacto medido: Kanban intacto (`Contrato_assinado` é o primeiro teste da
cascata); IA sem mudança (já estava desligada por contrato assinado); mas **as 7
conversas foram resolvidas no Chatwoot**.

Correção (v5): o fechamento **ignora** qualquer telefone cujo lead tenha
`Contrato_assinado`, `Contrato_enviado` ou `video_assinatura`. Não fecha e não
marca. O resumo passou a reportar `pulado_com_contrato`.

Reversão feita no banco: `Descartado_sem_resposta` e `Descartado_em` limpos em
todos os leads com contrato. Sobrou apenas o **id 188** (~airtonteixeira32), que
é descarte legítimo.

**Lição:** label do Chatwoot é sugestão, estado do lead é verdade. Cruze sempre.

---

## 5. Mapa das fases do Kanban — Auxílio Acidente

Referência: o que precisa acontecer para um card mudar de coluna.

### Como a decisão é tomada

Não existe campo "etapa" no banco. A cada hora o sync lê os leads e **calcula** a
coluna a partir de flags, numa **cascata em que o primeiro critério que bate
vence**. A ordem importa: contrato assinado ganha de tudo, e a qualificação é
testada depois dos estados de perda.

### As 7 colunas automáticas

| Coluna | Condição | O que precisa acontecer no mundo real |
|---|---|---|
| **Contrato Assinado** | `Contrato_assinado` | Cliente assina no ZapSign → webhook `ferramentacontratual` → fluxo "Comunicar do Contrato Assinado" |
| **Aguardando Assinatura** | `Contrato_enviado` **ou** `video_assinatura` | Contrato gerado e enviado, **ou** a IA disparou `[audio_assinatura]` (o que ela faz logo após gerar o contrato) |
| **Desqualificado** | `Desqualificado` | A IA executa MARCAR LEAD DESQUALIFICADO — só com as 3 perguntas da trava respondidas "não" explícito |
| **Descarte (SDR)** | `Descartado_sem_resposta` | Alguém arrasta o card para "Descarte (SDR)"; o sync detecta, fecha a conversa e desliga a IA |
| **Contrato em Elaboração** | `Iniciou_coleta` **E** `SEGURADO` | Lead qualificado **e** a IA pediu o nome completo (início da ETAPA 8) |
| **Comercial** | `SEGURADO` | Cliente confirma vínculo com o INSS: CLT na época, CLT nos 2 anos anteriores, ou auxílio-doença |
| **SDR** | nenhuma das acima | Estado inicial de todo lead novo |

### Quem grava cada flag

| Flag | Gravada por | Quando |
|---|---|---|
| `SEGURADO` | tool **SEGURADO** (agente PREV) | cliente confirma vínculo com o INSS |
| `Iniciou_coleta` | tool **Indicar Início ETAPA 9** (agente PREV) | ao pedir o nome completo, na ETAPA 8 |
| `Desqualificado` | tool **MARCAR LEAD DESQUALIFICADO** (agente PREV) | antes da mensagem de encerramento por desqualificação |
| `Descartado_sem_resposta` | **Kanban Sync** | conversa recebe a etiqueta `descarte_sdr` |
| `video_assinatura` | nó **Marcar Assinatura Enviado** (PREV) | IA emite `[audio_assinatura]` após gerar o contrato |
| `Contrato_enviado` | **6. WEBHOOK CONTRATOS**, nó ATUALIZAR CONTRATO ENVIADO | POST externo em `/webhook/CONTRATOPREV_IA`, feito pela ferramenta de contratos |
| `Contrato_assinado` | **Comunicar do Contrato Assinado** | ZapSign envia `doc_signed` com `external_id` começando em `LOTE-` |

### As 4 colunas que o sistema nunca preenche

**Análise Médica**, **Análise Jurídica**, **Efetivado** e **Aguardando Tempo**
existem no quadro, mas nenhuma regra as calcula. Só recebem card se alguém
arrastar — e **sem a etiqueta `manual` o sync desfaz o movimento na hora
seguinte**. Na rodada das 16:00 de 17/08, 42 cards apareceram como
`pulado_manual`, ou seja, protegidos por essa trava.

### Dois pontos frágeis

**"Aguardando Assinatura" hoje depende quase só de `video_assinatura`.** O campo
`Contrato_enviado` vem de um webhook (`CONTRATOPREV_IA`) que a ferramenta externa
de contratos deveria chamar, mas nas execuções retidas **nenhuma chegou por esse
caminho**. Na prática quem move o card é a tag de áudio da IA, não a confirmação
real de envio do contrato.

**A qualificação depende inteiramente da IA.** Se um atendente humano assume a
conversa cedo, ninguém grava `SEGURADO` — e o lead fica em SDR mesmo em
negociação avançada. Foi a causa dos três casos de 17/08 (ver seção 6). Não tem
correção automática: ou a equipe marca no sistema, ou o quadro mente.

---

## 6. Os três cards que mudaram de coluna em 17/08

Na primeira rodada com a cascata nova (execução **145858**, 15:00), de 415 leads
**6 tiveram etiqueta mexida** — e só 3 foram mudança real de coluna:

| Conversa | Nome | Telefone | Movimento |
|---|---|---|---|
| #734 | ~Sueli | 5517982208854 | Contrato em Elaboração → SDR |
| #838 | ~🍀✨ | 5571993758391 | Contrato em Elaboração → SDR |
| #323 | ~Lucia Vera | 5585992979204 | Contrato em Elaboração → SDR |

Os outros 3 não foram mudança: `5583993112864` foi para Desqualificado por
marcação intencional nossa, e `~Lorrany` / `~MR` eram leads criados naquele dia,
recebendo etiqueta pela primeira vez.

**Todos os três têm o mesmo padrão:** `Iniciou_coleta = true` com
`SEGURADO = false`. Pela regra nova isso derruba para SDR.

**Mas o diagnóstico "não qualificado" estava errado.** Lendo as conversas #734 e
#838: são atendimentos reais em andamento com a Juliana — apresentação do caso de
R$60 mil, pedido de laudo, coleta de dados para contrato. O que faltou foi o
**registro**: em ambos um humano assumiu cedo (`atendimento_humanizado`) e a IA
nunca chegou a executar a tool SEGURADO.

A equipe percebeu e devolveu os cards à mão (#838 → Comercial, #734 →
Contrato em Elaboração, ambos por volta das 16:10). **Enquanto o cadastro não for
acertado, o sync vai desfazer isso toda hora.**

Correção necessária (pendente — ver seção 9):

```sql
-- Sueli: qualificada e já em coleta de dados para contrato
update "LEADS PREV" set "SEGURADO" = true where id = 415;

-- #838: qualificado, mas ainda em fase comercial —
-- a IA ligou Iniciou_coleta cedo demais
update "LEADS PREV" set "SEGURADO" = true,
                        "Iniciou_coleta" = false,
                        "Horário_coleta" = null
 where id = 417;
```

`~Lucia Vera` (id 213) tem o mesmo padrão mas a conversa ainda não foi lida —
verificar antes de marcar.

---

## 7. Bugs adjacentes achados na auditoria

### `indicar Data do Acidente` falhava em silêncio

A tool filtrava por `Ultimo_contato lte agora`. Em lead recém-criado esse campo
é NULL, então o UPDATE **não atingia nenhuma linha**. Como é o primeiro sinal de
progresso do funil, a data do acidente provavelmente não vinha sendo gravada na
maioria dos leads novos. Filtro removido.

A descrição do `$fromAI` também continha uma *instrução de execução* no lugar da
*descrição do valor* — corrigida.

### A guarda do sync nunca disparava

`Guarda: sync falhou em silencio` lia `r.erros`, mas o resumo grava a chave como
`erro` (singular). `Number(undefined || 0)` dá `0`, então a condição de alerta
nunca era satisfeita — o sync podia estar falhando há semanas terminando verde.
Corrigido, com fallback para as duas grafias, e estendido para cobrir também
`descarte.erro_fechar`.

### `Atendimento_humano` é boolean

O IF compara com `rightValue: "Sim"`, mas o operador é
`{type:'boolean', operation:'true', singleValue:true}` — o `"Sim"` é ignorado.
Funciona, mas o `"Sim"` no código engana quem lê.

---

## 8. Kanban no Chatwoot — filtros de busca

### Onde vive

Fork do Chatwoot, branch **`goncalves-main`**, em
`app/javascript/dashboard/routes/dashboard/kanban/`. Não é Dashboard App nem
iframe: é código compilado no bundle, rota `/app/accounts/1/kanban`.

### O que mudou

Arquivo novo **`search.js`** (busca no servidor, sinônimos de estado,
localização cross-funil) mais alterações em `Index.vue`, `helpers.js` e
`components/FiltersModal.vue`.

A caixa saiu do modal de Filtros e ficou fixa na barra do topo. Ela faz duas
coisas ao mesmo tempo, de propósito:

1. escreve em `filters.q`, estreitando as colunas já carregadas — resposta
   instantânea enquanto se digita;
2. dispara `searchEverywhere()` com debounce de 350ms, que vai ao servidor.

Sem (1) a tela pareceria travada durante o debounce; sem (2) voltaríamos ao
defeito de não achar quem existe.

### ⚠️ A armadilha do `?q=` (não "simplifique" isso depois)

O parâmetro `q` de `GET /conversations` **não serve** para buscar contato:

- `conversation_finder.rb:152` faz `joins(:messages).where('messages.content ILIKE ...')`
  — busca no **conteúdo das mensagens**;
- `conversation_finder.rb:82` é `filter_by_status unless params[:q]` — mandar `q`
  faz o filtro de **status ser silenciosamente ignorado**;
- `GET /conversations/search` cai no mesmo finder, mesmo defeito.

O caminho correto é `GET /contacts/search?q=` seguido de
`GET /contacts/:id/conversations`. O segundo devolve as duas caixas de uma vez,
sem filtro de inbox — o que entrega a busca cross-funil de graça.

### Estados como termo de busca

Digitar `aguardando`, `atendimento`, `fechado`, `desqualificado` (e sinônimos
como "pendente", "descartado") filtra por estado. Nesse modo `filters.q` fica
**vazio de propósito** — senão a palavra "fechado" zeraria as colunas por não
casar com nome nenhum.

**Decisão registrada — "fechado" x "desqualificado":** a coluna Fechado é
definida por `CLOSED_LABELS`, que **já contém** `desqualificado`. Para os termos
não devolverem a mesma lista:

- `desqualificado` casa só com `desqualificado` + `bpc_desqualificado`
- `fechado` casa com o grupo inteiro (inclui `descarte_sdr`, `bpc_cancelado`)

Desqualificado é subconjunto próprio de fechado.

### Largura da barra

A caixa tem `w-[176px]` em repouso e `focus:w-[248px]`. Fixar em 230px empurrava
"Recarregar" e "Configurações" para uma segunda linha — o mesmo aperto que já
tinha obrigado a encurtar os rótulos dos botões.

---

## 9. Como implantar (o "Implantar" sozinho não basta)

A fonte no Easypanel **não é Git** — é imagem Docker fixada num SHA. Clicar em
"Implantar" sem trocar a tag redeploya a mesma imagem antiga.

O ciclo real:

1. commit e push na branch `goncalves-main`
2. o workflow `.github/workflows/build-goncalves.yml` constrói e publica no GHCR
   com **duas tags**: `:goncalves` (móvel) e `:<sha>` (fixa) — ~4 min
3. no Easypanel → **Fonte**, trocar a imagem para
   `ghcr.io/mchaves-21/chatwoot:<sha completo>` e **Salvar**
4. **Implantar** — ~20s

> **Simplificação possível:** apontar o Easypanel para `:goncalves` deixaria o
> deploy em um clique. O comentário no próprio workflow diz que essa era a
> intenção. O custo é perder o rollback exato por SHA.

Implantações desta sessão: `2a14083` (busca) e `cf4ccf7` (largura da barra).

---

## 10. Estado final e pendências

### Publicado e ativo

| Workflow | ID | Situação |
|---|---|---|
| 1. COMERCIAL - PREV | `kpTwWVsvVYjyhGon` | publicado — `24b6eb9c` (já com o prompt corrigido) |
| BPC - Video de primeira mensagem | `fgjnI5PRzCI5zQZz` | publicado — `2ff697e0` |
| Kanban Sync | `yzmFpTjkUiJXWNrl` | publicado — `01a9ceab` (código v5 + guarda corrigida) |

Chatwoot em `cf4ccf7`, com a busca validada em produção: procurando
`5583993112864` com as colunas mostrando "Nenhum resultado", o painel achou o
contato e reportou `Auxilio Acidente / Desqualificado` — validando a cadeia
inteira, da coluna no Supabase até a exibição.

### Pendências

Nenhuma alteração ficou pela metade. O que segue é verificação e trabalho novo.

**Aguardando primeira execução real** — implementado, publicado, nunca exercitado:

1. **Desqualificação automática.** O caminho completo (agente → tool →
   `Desqualificado` → cascata → coluna) está no ar, mas nenhum lead novo entrou
   desde a publicação. A primeira desqualificação real é o teste. Vale ler a
   execução e confirmar que a tool foi chamada.
2. **v5 do descarte.** Rodou a v4, que gerou o incidente dos contratos; a v5
   corrigida ainda não passou por um ciclo.
3. **Trava de vídeo por label.** Nenhuma criação de cliente desde a publicação.
   Lembrando que a falha aqui é silenciosa por design: credencial errada faz
   voltar a duplicidade, não quebra o atendimento.

**Correção de dados pendente (bloqueada nesta sessão):**

4. **`UPDATE` nos leads 415 e 417** (seção 6) — o comando foi bloqueado pelo
   controle de segurança e precisa ser rodado no SQL Editor. Sem ele, o sync
   continua devolvendo esses cards para SDR de hora em hora, desfazendo o que a
   equipe arruma à mão. Verificar também a `~Lucia Vera` (id 213).

**Verificação manual:**

5. **Credencial** dos nós "Ler Etiquetas do Contato (video)" e "Marcar Video
   Apresentacao Enviado" — atribuída sem poder ser conferida (a API redige
   credenciais). Confirmar que é a mesma do nó "Ler Etiquetas CW".

**Trabalho novo:**

6. **Áudio "Não poder mais trabalhar devido ao auxílio acidente.ogg"** sem
   ramificação no Switch — precisa de tag nova, cadeia
   Buscar → Baixar → Enviar → Marcar, e instrução no prompt.
7. **Leads desqualificados antigos** nunca foram marcados — a correção não
   alcança o passado. Um levantamento em lote (sem `SEGURADO`, sem contrato,
   conversa encerrada) evitaria descobrir um a um.

**Decidido não fazer:**

8. **7 conversas fechadas indevidamente** no incidente da v4. Não foi possível
   determinar quais estavam abertas antes, e reabrir em bloco jogaria conversa
   antiga de volta na caixa da equipe. Como todas são de leads com contrato
   assinado, conversa resolvida é o estado final normal delas.
