# CONTEXTO PREV — sessão 42 (handoff para o multiagente)

- **Data:** 15/09/2026, terça-feira, Fortaleza (UTC−3). Sucede o `CONTEXTO_PREV_sessao_41_1.md`.
- **Tarefa principal:** migrar o atendimento do `1. COMERCIAL - PREV` (`kpTwWVsvVYjyhGon`) para uma arquitetura com vários agentes.
- **Onde parou:** os passos 1, 2 e 3 estão feitos. O passo 3 (roteador só observando) está publicado e **ainda não registrou nada**.
- **Próxima conversa:** conferir se a observação está gravando e seguir para o passo 4.

---

## 0. LEIA ISTO PRIMEIRO

Continuam valendo todas as armadilhas do §0 das sessões 30 a 41. Novidades desta sessão:

| sintoma | causa / contorno |
|---|---|
| `get_workflow_details` do `1. COMERCIAL - PREV` estoura o limite | ~310 mil caracteres. Mandar para arquivo e ler com `jq`/`python`. |
| resposta do agente dura menos de 1 s | a execução não chegou ao agente: parou nas travas humanas ou nos filtros de evento. Execução com IA dura vários segundos. Em 15/09, das 18:05Z às 19:10Z, **49 execuções e nenhuma com IA**. |
| `update_workflow` com `setNodeParameter` em índice de array | falha com "cannot descend into non-object". Usar `updateNodeParameters` com o objeto inteiro (ex.: `bodyParameters` completo). |
| `$('Nó').all(0)` em expressão | o argumento é o índice da saída. Numa saída de erro (`continueErrorOutput`) o item vai na saída 1. Envolver em `try/catch`. |
| erro 500 da ZapSign em `POST /signers/{token}/` | **não significa que o link deixou de ir.** Em 15/09 os 3 envelopes com 500 foram enviados por e-mail e WhatsApp, e 2 clientes assinaram. Conferir o envelope com `GET /docs/{token}` antes de reenviar. |
| git no fork do Chatwoot pelo terminal (`device_bash`) | `git commit` trava (hooks husky/lint-staged e disco montado lento) e não há credencial para o push. Funcionou: `git update-index` → `write-tree` → `commit-tree` → `update-ref`, e o push pelo **GitHub Desktop** (acesso ao processo `githubdesktop.exe` do `app-3.6.4`). |
| deploy do Chatwoot | o push na `goncalves-main` dispara a esteira: verificar → build (~20 min) → implantar sozinho no Easypanel via webhook. Para confirmar, ver se o nome dos assets `/vite/assets/*.js` em `/app/login` mudou. |

---

## 1. PROJETO MULTIAGENTE — ESTADO

### 1.1 Decisões fechadas (usuário)

- **4 agentes, não 5:** Triagem, Comercial (Valor e Fechamento juntos), Coleta e Pós-contrato. Não criar o campo `explicou_beneficio`.
- **Roteador sem IA:** um nó Code com a mesma lógica do `deriveStage` do Kanban Sync.
- **Recorte:** Claude **só recorta** o prompt, sem reescrever nenhuma regra. O usuário reescreve o tom depois.
- **A IA para depois da assinatura (15/09):** nenhum agente atende lead com contrato assinado.
  - O "Pós-contrato" cobre só o intervalo entre contrato enviado e assinado (estágio `aguardando_assinatura`).
  - Sugestão ainda não aprovada: renomear esse agente para **"Aguardando assinatura"** no passo 4.
- **Onde a observação grava:** na tabela de dados do n8n `obs_roteador_multiagente`, não no Supabase nem no Chatwoot.
- Continuam valendo: **uma memória só** para todos os agentes (chave `inbox + ChatId`), troca de agente **invisível** para o cliente, e a nota de falha da IA passando a registrar estágio e agente.

### 1.2 Passo 1 — medir o "antes" (sessão 41, feito)

**Baseline** (18 execuções com agente, 5 conversas): **44% das execuções com defeito** e **33% das chamadas de ferramenta indevidas**.

| # | defeito | execuções |
|---|---|---|
| D1 | ferramenta chamada de novo fora da etapa | 229988, 230031 |
| D2 | resumo de fechamento antes de a coleta terminar | 229988 |
| D3 | a mesma resposta repetida 3 vezes em 62 s | 230177/78/82 |
| D4 | nome inventado ("Aqla" no lugar de "Samuel") | 229642 |
| D5 | ferramenta transversal oferecida em vez de executada | 229649, 229995 |

**D3 e D4 não entram na conta do multiagente** na medição do "depois":
- D3 é defeito na ligação do buffer de mensagens, não do prompt;
- D4 se resolve injetando o nome a partir do Supabase.

Os dois precisam de correção própria.

### 1.3 Passo 2 — recorte do prompt (feito em 15/09)

**Origem:** `systemMessage` do nó `Advogado Prev3`, 35.722 caracteres, versão `6daf741a`.

**Arquivos** (pasta de saídas da sessão 42, `multiagente/`):

- `00_prompt_original_Advogado_Prev3.txt`
- `01_BLOCO_COMUM.txt` (15,7 mil caracteres): DATA, NOME, AGENDAMENTO, VERIFICAÇÃO DO ESCRITÓRIO, identidade, dados do escritório, regras de comunicação, lista dos 13 áudios, valores, blindagem, escopo, agradecimento, finalização, transferência, ferramenta PASSAR PARA A EQUIPE, SINAL DE BPC, PROTOCOLO DE RETOMADA e `<se_medo_golpe>`.
- `02_BLOCO_TRIAGEM.txt` (9,1 mil): ferramentas indicar Data, SEGURADO e MARCAR DESQUALIFICADO; regras de qualificação; verificação inicial; etapas 1 e 2 (com a regra de idade e a trava).
- `03_BLOCO_COMERCIAL.txt` (5,6 mil): ferramenta Indicar Início ETAPA 9, honorários, etapas 3 a 7 e a **pergunta do nome completo** (começo da etapa 8).
- `04_BLOCO_COLETA.txt` (3,1 mil): ferramenta GERAR CONTRATO, resto da etapa 8, resumo, execução e proteção final.
- `05_BLOCO_POS_CONTRATO.txt` (4,5 mil): comportamento pós-contrato e as objeções da etapa 6.
- `LEIA-ME_mapa_do_recorte.md`: faixas de linhas, fronteiras e pontos de atenção.

**Conferência feita por script:**
- cada trecho é cópia exata do original;
- nenhuma linha com texto ficou de fora;
- as repetições são de propósito (título FERRAMENTAS, objeções, cabeçalho da etapa 8).

**Tamanho do prompt por agente (comum + estágio) e redução:**

| agente | caracteres | redução |
|---|---|---|
| Triagem | 24,8 mil | −31% |
| Comercial | 21,3 mil | −40% |
| Coleta | 18,8 mil | −47% |
| Pós-contrato | 20,1 mil | −44% |

A redução é menor que a prevista porque o BLOCO_COMUM é grande. Cortar mais depende da reescrita do usuário. Candidatos:
- a lista de 13 áudios (cada estágio usa de 2 a 4);
- o bloco institucional, que aparece duas vezes.

**Fronteiras** (a troca de agente acontece na mensagem seguinte, quando o Supabase muda):
1. **Triagem → Comercial:** a ferramenta SEGURADO grava `SEGURADO=true`. A Triagem ainda pergunta pelos documentos, e a resposta do cliente já cai no Comercial (etapa 3).
2. **Comercial → Coleta:** a ferramenta `Indicar Início ETAPA 9` grava `Iniciou_coleta=true`. **Ela e a pergunta do nome completo ficam no Comercial.** Se ficassem na Coleta, o estágio nunca mudaria.
3. **Coleta → Pós-contrato:** a ferramenta GERAR CONTRATO leva a `Contrato_enviado=true`, que é o estágio `aguardando_assinatura`.

**Pontos de atenção para o passo 4:**
- **Data e nome são calculados pelo n8n.** O BLOCO_COMUM tem expressões (`$now...` e `$('Dados1').item.json.NomeSeguro`). Montado como texto num Code, isso **não é calculado**: o Code precisa calcular data e nome e substituir no texto.
- **Referências soltas:** no Comercial e na Coleta o texto comum ainda cita "FERRAMENTAS → SEGURADO" e "MARCAR LEAD DESQUALIFICADO", que só existem na Triagem.
- **`[ESTADO DO CONTRATO]`:** o bloco que vai no campo `text` do agente fica igual para todos.
- **`[video_assinatura]`:** está na Coleta, mas a saída 14 do switch continua sem ligação (defeito já conhecido).
- **Ferramentas:** na Opção A as 7 continuam ligadas ao agente. A proibição de usar as outras é só textual.

### 1.4 Passo 3 — roteador em modo observação (PUBLICADO em 15/09 ~18:05Z)

**`1. COMERCIAL - PREV`:** `activeVersionId` **`3e0071e6-ef45-49e9-a121-74e4e387c1e9`**. Antes era `6daf741a`, que serve para rollback.

**O que entrou:** 2 nós novos e 1 ligação. Nenhum nó existente mudou (conferido por diff). Segue o mesmo padrão do "Extrator de Slots (sombra)":

```
Está sendo atendido por humano?1 (saída 1)
   ├─> Advogado Prev3
   ├─> Extrator de Slots (sombra)
   └─> OBS Roteador (deriveStage)  ->  OBS Gravar estagio
```

- **`OBS Roteador (deriveStage)`** (Code, posição [-13840, 3296], `onError: continueRegularOutput`):
  - copia literalmente o `deriveStage` do Kanban Sync v16;
  - lê `$('Buscar Cliente1').first()` e `$('ID CONVERSA1').first().json.id_conversa`;
  - devolve `execution_id`, `lead_id`, `conversa_id`, `estagio`, `agente` e `flags`, onde `agente` segue o mapa `sdr→triagem`, `comercial→comercial`, `contrato_em_elaboracao→coleta`, `aguardando_assinatura→pos_contrato`, e o resto vira `nenhum`;
  - `flags` = lista das flags verdadeiras entre Contrato_assinado, Desqualificado, Contrato_enviado, video_assinatura, Descartado_sem_resposta, Iniciou_coleta e SEGURADO.
- **`OBS Gravar estagio`** (nó Data table, operação insert, `onError: continueRegularOutput`):
  - grava na tabela **`obs_roteador_multiagente`** (id `VdX41toPwXbxJiFm`, projeto `omY7khPnTocxtX0f`);
  - colunas: `execution_id`, `lead_id`, `conversa_id`, `estagio`, `agente`, `flags`, `registrado_em` (date);
  - **não grava texto de mensagem** (LGPD).

**Deriveção do estágio (precedência):**

```
Contrato_assinado                          -> contrato_assinado   (sem agente)
Desqualificado                             -> desqualificado      (sem agente)
Contrato_enviado ou video_assinatura       -> aguardando_assinatura
Descartado_sem_resposta                    -> descarte_sdr        (sem agente)
Iniciou_coleta E SEGURADO                  -> contrato_em_elaboracao
SEGURADO                                   -> comercial
nada disso                                 -> sdr
```

**Não conferido ainda.** Às 19:10Z de 15/09 nenhuma execução tinha chegado ao agente.

**Conferência agendada:** tarefa `trig_015YnBARQzpzfMcYpfPNjheJ`, **16/09 às 13:00Z (10:00 Fortaleza)**, que vai:
- procurar execuções depois de 18:05Z que passaram pelo `Advogado Prev3`;
- ver se os 2 nós OBS rodaram sem erro e gravaram na tabela.

### 1.5 PRÓXIMOS PASSOS (ordem do plano §5.7 da s41)

1. **Conferir a observação.** Se a tarefa agendada ainda não tiver rodado, fazer à mão:
   - pegar execuções longas do `1. COMERCIAL - PREV` depois de 15/09 18:05Z;
   - ler os nós OBS com `get_execution`, usando `nodeNames` e `includeData`;
   - se o nó do Data table falhou, corrigir o mapeamento. O tipo `registrado_em` foi declarado como `dateTime` no schema do nó e como `date` na tabela.
2. **Deixar observando 2 a 3 dias** e comparar o `agente` gravado com o que a IA de fato fez em cada execução. Ferramentas chamadas vs. estágio pegam D1 e D5.
3. **Passo 4 — Opção A num número de teste:**
   - um Code monta `systemMessage = BLOCO_COMUM + BLOCO_<estágio>`, calculando data e nome;
   - o `Advogado Prev3` passa a usar `={{ $json.systemMessage }}` (ou equivalente);
   - só vale para a lista `numeros_de_teste` do `Config Atendimento`, via IF, e o resto segue no prompt original;
   - **pré-requisito:** o usuário revisar e reescrever os blocos, principalmente o comum.
4. **Passo 5:** medir o "depois" com o mesmo critério do passo 1, sem contar D3 e D4.
5. **Passo 6:** só então avaliar a Opção B (um sub-workflow por agente) para Triagem e Coleta.

### 1.6 Ainda depende do usuário

- Revisar os 5 blocos e reescrever o tom.
- Aprovar ou não o novo nome "Aguardando assinatura".
- Ligar "available in MCP" no `SUB - Encaminhar Presencial` (`6jhkoSJnjEk6xQDu`), se ele deve entrar na conta.

---

## 2. O QUE MAIS FOI FEITO NESTA SESSÃO (fora do multiagente)

### 2.1 Correção dos erros de 13 a 15/09 (todas publicadas e conferidas por diff)

| fluxo | id | causa | correção | activeVersionId |
|---|---|---|---|---|
| F2 FLUXO MAIOR DENTRO DO ESTADO | `M6sU8cIJgXTViMF8` | ZapSign 500 em `Liberar Envio ao Signatário` derrubava o fluxo | ver abaixo | `09db137c` |
| F4 FLUXO MAIOR FORA DO ESTADO | `tDzAeyezjWDtWfnV` | mesma causa | mesma correção | `b874bee9` |
| 3. FOLLOW-UP CONTRATO ENVIADO | `ROBdoFAeXefJ873R` | Supabase 500 "Failed to get project config" às 08:00 | os 5 nós do Supabase tentam 3 vezes, com 5 s de intervalo | `6af7625c` |
| Relatório Diário de Leads | `w8P5owBUt0k1RUju` | Gemini 503 → `JSON.parse(null)` devolveu null → quebrou em `a.resumo` | guarda no `Montar Email`: sem IA, o relatório sai só com as métricas | `07583b20` |

**Correção nos F2 e F4:**
- `Liberar Envio ao Signatário` e `Notificar Signatário ZapSign` passaram a tentar 5 vezes e a seguir pela saída de erro (`continueErrorOutput`) quando falham;
- a saída de erro dos dois leva a `Salvar no Google Sheets`;
- a mensagem de `Notificar ADM 2 WhatsApp` muda sozinha para **"⚠️ ZAPSIGN RESPONDEU ERRO NO ENVIO — CONFERIR SE O LINK CHEGOU"**, com o link de assinatura e o pedido de olhar o painel antes de reenviar.

**Ainda não testado:** o caminho de falha da ZapSign só roda quando a ZapSign falha de verdade.

### 2.2 Os 3 contratos de 15/09

| cliente | situação na ZapSign | planilha DB_contratos |
|---|---|---|
| DAGNAU CORDEIRO | assinou | linha 269 |
| WALDERIO DIAS DE SOUZA | assinou | linha 270 |
| Aryanne Maria Gondim Silva | abriu o link 4 vezes, **não assinou** | linha 271, "pendente", gravada por Claude |

- **WALDERIO:** o telefone está com 10 dígitos (81 9295-3665), provavelmente falta o 9.
- **Fluxos temporários:** `6cgtEZfCqChqmWbF` e `n0WYl4wVfAMZlyVk` foram arquivados.

### 2.3 Kanban do Chatwoot — colunas ChatGuru removidas do funil BPC

- **Motivo:** nenhuma conversa tinha as etiquetas `chatguru_closer` e `chatguru_sdr` (conferido na API com `status=all`).
- **Commit:** `7fb868a` na `goncalves-main` do fork `MChaves-21/chatwoot`. Mudou só `constants.js`: saíram as 2 colunas e os 2 emojis, e entrou uma nota datada.
- **Deploy:** automático. Imagem `ghcr.io/mchaves-21/chatwoot:7fb868a…` com digest `sha256:95746ab0…`; entrou no ar por volta das 20:20Z. Bundle novo `dashboard-a7JzSaJ9.js`, sem `chatguru_closer`.
- **Não commitados:** 2 arquivos do usuário que já estavam alterados no GitHub Desktop, entre eles `.github/workflows/run_foss_spec.yml`.
- **Pendente (opcional):** apagar as 2 etiquetas vazias em Configurações → Etiquetas.

### 2.4 Mensagem do usuário não aplicada (é de outro projeto)

> "caso o processo volte ele deve ser t7,t8,t9,t10, a coluna com o tempo total deve estar depois da coluna cadastro advbox"

- **Projeto:** Linha do Tempo do histórico de fases do ADVBOX, fluxo `LINHA DO TEMPO - montar aba` (`L3d9issuq1dCDeKL`, editado às 19:48Z de 15/09, provavelmente em outra conversa).
- **Não foi aplicada** para não sobrescrever o trabalho da outra conversa. O usuário ainda não confirmou onde deve ser feita.

---

## 3. FILA HERDADA (sem mudança nesta sessão)

- **Itens U, V, W, O, P, S, T** e os que dependem de um evento: ver §4 da s41.
- **Item V (cron de mensagens agendadas):** continua sem prova.
- **Limpeza / perguntas abertas** (§4 da s41), todas ainda em aberto:
  - `TESTE - PT 1` ativo;
  - `Agente com uazapi ORIGINAL`;
  - `Envio de aúdio`;
  - `CHATWOOT` com webhook sem segredo;
  - `Integração chatguru` com rascunho não publicado;
  - webhook `/contrato_assinado2`;
  - repontar as 9 automações do Flowter;
  - os 42 fluxos inativos.
