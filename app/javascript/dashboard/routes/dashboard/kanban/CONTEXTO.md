# Contexto — Kanban no Chatwoot, dois funis

**Gonçalves & Silva Advogados Associados** · atualizado em 07/08/2026, fim do dia
Documento para retomar o trabalho numa conversa nova.

> Este arquivo mora **dentro do repositório** de propósito. A versão de 06/08 foi
> entregue solta numa conversa e desapareceu junto com ela — junto com o guia de
> teste, o documento de rollback, a revisão de código e o seed de staging. Foi
> preciso reconstruir. Não repita: o que precisa sobreviver vai para o Git.

---

## 1. Estado atual do sistema

| | |
|---|---|
| Chatwoot | `https://chatwoot.goncalvesesilva.cloud` · versão **4.16.2** |
| Fork | `https://github.com/MChaves-21/chatwoot`, branch `goncalves-main` |
| Serviços | `chatwoot` e `chatwoot-sidekiq`, projeto `n8n` no Easypanel |
| Banco de produção | database chama-se **`n8n`** (nome herdado do template) · **Postgres 17** |
| Servidor | `ssh root@195.35.40.9` · 2 núcleos, 7,8 GB RAM, disco 21% |
| Rota do quadro | `/app/accounts/1/kanban` · item "Kanban" no menu lateral |

### Commits e imagens

Cada push publica **duas** tags: `:goncalves` (que se move) e `:<sha completo>`
(que fica). Isso importa muito — ver seção 2.

| Commit | O que é | Imagem |
|---|---|---|
| `6f3e289af9d95a2abd321259889fe9d70b53a98c` | kanban original, **o que está em produção agora** | tag SHA |
| `6089796f82a52ca4d64438f330142f3568c6be23` | dois funis (tarefas 1 e 2) | tag SHA |
| `296d2bc781b7a379aa3c1f0dc14d92ff55bfa9c7` | correção do cabeçalho, **é o que deve subir** | tag SHA |

### Caixas de entrada

| Caixa | ID | Conversas em 07/08 |
|---|---|---|
| Auxílio Acidente | **6** | 336 |
| BPC | **9** | 121 |

Ambas são "Canal da API" — quem faz a ponte com o WhatsApp é a Evolution API.
A caixa é atribuída na entrada e nunca muda, por isso é o **único critério
confiável** para saber a que funil um card pertence. Etiqueta não serve:
`analise_medica` existe nos dois funis, e conversas de BPC já apareceram com
etiqueta de Auxílio Acidente por engano.

### Usuários e acesso

| Usuário | Papel | Caixas |
|---|---|---|
| goncalvesesilva.advogados@gmail.com | administrador | 6 e 9 |
| a16.julianafernandest@gmail.com | agente | 6 e 9 |
| gabriel100eliton@gmail.com | agente | 6 e 9 |
| murilochaves211105@gmail.com | agente | **nenhuma** |

O usuário pessoal do Murilo não é membro de caixa nenhuma — em produção também.
Logado como ele mesmo, ele não vê conversa nenhuma, nem no kanban nem na lista.
Ele trabalha pela conta administrativa. **Nenhum usuário tem cargo
personalizado** (`custom_role_id` nulo nos quatro).

---

## 2. A mudança de procedimento mais importante desta sessão

A produção apontava para a tag `:goncalves`. Isso foi pensado como conveniência
— não precisar mexer no Easypanel a cada deploy — mas o efeito é o contrário do
pretendido: **no minuto em que um build termina, a tag que a produção usa já
aponta para código não testado.** Qualquer reimplantação a partir dali, mesmo
por motivo alheio (reiniciar por lentidão, mexer numa variável, o Easypanel
subir o container sozinho), puxa a versão nova sem ninguém ter decidido.

**Em 07/08 os dois serviços de produção foram fixados no SHA
`6f3e289af9d95a2abd321259889fe9d70b53a98c`** (salvos no Easypanel, sem
reimplantar — o container em execução não foi tocado).

O ciclo correto passa a ser:

1. Antes do push, confirmar que a produção está fixada num SHA.
2. `git push` → build (~5 min com cache, ~28 min sem).
3. Ambiente de teste aponta para o SHA novo e é validado.
4. Só então a produção é apontada para o SHA novo, explicitamente.

Rollback deixa de ser "voltar para a imagem oficial e perder o kanban" e passa a
ser "voltar para o SHA anterior", que é exato.

---

## 3. O que foi feito em 07/08

### 3.1 Tarefa 1 — quadro lê só a caixa certa · FEITA, falta implantar

`listByLabel` em `api.js` passou a receber `inboxId`, e cada funil carrega o seu.
O impacto é menor do que se estimava: apenas **6 conversas** saem do quadro de
Auxílio Acidente.

| Coluna | Antes | Depois |
|---|---|---|
| SDR | 261 | 258 |
| Contrato enviado | 7 | 6 |
| Aguardando assinatura | 6 | 5 |
| Lead potencial | 4 | 3 |

### 3.2 Tarefa 2 — funil BPC · FEITA, falta implantar

Um item "Kanban" no menu, com seletor de funil no cabeçalho. Os dois funis são
**preset no código** (`constants.js`), não mais editáveis por agente. O editor de
colunas em JSON saiu do modal de Configurações, e o `localStorage` guarda no
máximo qual funil estava aberto por último.

**14 etiquetas criadas em produção** em 07/08 (a conta foi de 24 para 38), todas
fora da barra lateral:

```
bpc_lead_novo               bpc_analise_medica
bpc_aguardando_requisito    bpc_analise_juridica
bpc_qualificado             bpc_pos_juridica
bpc_documentos_iniciais     bpc_efetivado
bpc_aguardando_assinatura   bpc_desqualificado
bpc_contrato_assinado       bpc_cancelado
bpc_pegar_senha             bpc_fechado_sem_resposta
```

A 14ª (`bpc_fechado_sem_resposta`) não estava na lista aprovada em 06/08 — o CRM
antigo tinha 14 colunas, não 13. Foi criada porque "fechado sem resposta" é o
oposto de "cancelado": num o cliente decidiu sair, no outro nunca decidiu nada,
e o próximo passo difere (reativação vale a pena em um, no outro não).

**Coluna "Sem etapa"**, exclusiva do funil BPC, é a primeira do quadro. Lista as
conversas da caixa 9 sem nenhuma etiqueta `bpc_`. Sem ela o quadro nasceria
vazio. Como a API do Chatwoot não sabe filtrar por ausência de etiqueta, ela lê
a caixa inteira e filtra no cliente — 19 requisições ao abrir o quadro BPC em vez
das 11 de antes. Com 121 conversas é imperceptível; com alguns milhares precisa
virar consulta no servidor. Freio em `MAX_PAGES_UNSTAGED`.

### 3.3 Colunas que faltavam no Auxílio Acidente

`lead_potencial` (3 conversas) e `contrato_enviado` (6) não tinham coluna e
portanto eram invisíveis para a equipe. Ganharam coluna. `contrato_fechado` e
`recebendo_31` continuam de fora porque estão zeradas.

### 3.4 Arquivos alterados

Dez arquivos, todos dentro de `app/javascript/dashboard/routes/dashboard/kanban`:

```
Index.vue                  seletor de funil, cabeçalho compacto
api.js                     inboxId + listWithoutStage
constants.js               FUNNELS, presets, UNSTAGED_LABEL
useKanbanBoard.js          funil ativo, setFunnel, stageLabels por funil
helpers.js                 nextSteps das 14 etapas BPC
excel.js                   normaliza "Sem etapa" na planilha
components/ContactPopup.vue    fase do card sem etiqueta
components/DayViewModal.vue    idem
components/SettingsModal.vue   editor de colunas removido
GUIA-TESTE-EASYPANEL.md    novo
```

Nenhum arquivo do upstream foi tocado, então o merge futuro continua sendo as
mesmas 9 linhas em 2 arquivos, com o conflito esperado em `Sidebar.vue`.

---

## 4. Decisões tomadas em 07/08

**Nada vem do CRM antigo.** O quadro BPC nasce com as 121 conversas em "Sem
etapa" e a equipe classifica à mão conforme atende. Consequência aceita: os 89
leads em negociação e os 50 em análise médica que existem no CRM antigo só
existem lá, e o CRM antigo não pode ser desligado até a coluna "Sem etapa"
esvaziar. Se em duas semanas isso incomodar, o lote em `rails runner` continua
disponível. Vale saber que o CRM tem 188 leads e a caixa 9 tem 121 conversas —
mesmo com migração, uns 67 leads não teriam onde receber etiqueta.

**`cancelado` ≠ `desqualificado`.** Cancelado = o cliente desistiu; tinha caso e
escolheu não seguir. Desqualificado = não preenche o requisito do BPC (renda
familiar por pessoa acima de 1/4 do salário mínimo, ou não se enquadra em
deficiência nem em 65 anos ou mais). Os textos de "próximo passo" em
`helpers.js` refletem isso.

**Funil INDICAÇÕES não migra.** O CRM antigo tem um segundo funil com 26 leads em
10 etapas. Não vira quadro agora: o kanban filtra por caixa de entrada, e
indicação não é uma caixa, é uma origem. Um terceiro quadro exigiria outro
critério de filtro. O seletor já nasce genérico, então acrescentar depois é
barato.

---

## 5. Resultados do teste

Ambiente isolado com cópia do banco de produção. Tudo verificado pela API, não
só pela tela:

- Funil Auxílio Acidente: SDR 258, Lead potencial 3, Comercial 32, Contrato em
  elaboração 7, Contrato enviado 6, Aguardando assinatura 5, Contrato assinado 2,
  Análise médica 2, Efetivado 2, Desqualificado 6, Descarte 5.
- Filtro por caixa provado: `sdr` tem 261 no total, 258 na caixa 6, 3 na caixa 9.
- Funil BPC: "Sem etapa" com 103 (o total da caixa 9 no dump), 14 etapas zeradas.
- **Teste crítico das etapas homônimas:** mover a conversa 631 (caixa 9) para
  "Análise médica" no funil BPC aplicou `bpc_analise_medica`, preservou
  `atendimento_humanizado` e acrescentou `manual`. As duas conversas de Auxílio
  Acidente em `analise_medica` (546 e 510) ficaram intactas.
- Caminho de volta: arrastar para "Sem etapa" removeu `bpc_analise_medica` sem
  deixar etiqueta estranha.

**Não testado:** a exportação para Excel (o caminho novo que normaliza a fase
"Sem etapa" na planilha e no Panorama). É risco residual, baixo, mas existe.

---

## 6. Problemas encontrados que continuam abertos

### 6.1 O backup automático não está rodando · GRAVE

Em `/etc/easypanel/backups/n8n/chatwoot-db/` existe **um único arquivo**, de
06/08 às 18:21 — que é a execução manual feita para testar o agendamento. O
agendamento diário das 2h deveria ter produzido um arquivo na madrugada de 07/08
(o servidor está em UTC). Não produziu.

Ou seja: a instância acha que está protegida e não está. **Investigar antes de
qualquer outra coisa.**

E o offsite continua faltando. Local Disk é o disco do próprio servidor: protege
contra deploy ruim, não contra perder a máquina.

### 6.2 O nome do backup mente

Os arquivos saem como `.sql.gz` mas são dump em **formato custom** do `pg_dump`.
`psql` recusa com *"The input is a PostgreSQL custom-format dump"*. Numa
emergência isso custa minutos. Use:

```
gunzip -c <arquivo>.sql.gz | docker exec -i <container-pg> pg_restore -U postgres -d <banco> --no-owner --no-privileges
```

### 6.3 A produção é Postgres 17, não 16

O contexto anterior mandava usar `pgvector/pgvector:pg16` ao recriar o banco.
**Está errado.** Os dumps da produção são gravados no formato de arquivo 1.16, e
o `pg_restore` do 16 recusa com *"unsupported version (1.16) in file header"*.
Use **`pgvector/pgvector:pg17`**. Um Postgres 16 não lê os backups da produção —
e, se alguém recriar o serviço de produção seguindo a instrução antiga, o banco
novo não lerá os próprios backups anteriores.

### 6.4 Agente sem caixa vê quadro vazio sem explicação

Um agente que não é membro de nenhuma caixa abre o kanban e vê todas as colunas
zeradas com "Nenhuma conversa", sem nenhuma mensagem. É indistinguível de "o
sistema quebrou". Se entrar agente novo e esquecerem de dar acesso à caixa, é
essa a reclamação que vai chegar. Vale considerar uma mensagem explícita no
quadro quando `inboxes` vier vazio.

### 6.5 Servidor com atualizações e reinício pendentes

48 atualizações, uma delas de segurança, e reinício pendente. O reinício derruba
Chatwoot, n8n e Evolution — é janela combinada, não coisa para fazer de
improviso.

### 6.6 Pendências herdadas, não tocadas hoje

- **Bug das mensagens duplicadas da IA.** Hipótese principal: campanhas de
  follow-up que se sobrepõem (três workflows disparando no mesmo minuto). Pista
  nova: já existem etiquetas de deduplicação (`notificado_*`) — se elas forem
  aplicadas *depois* de enviar em vez de antes, duplicatas passam pela janela.
- **Regra de desqualificar quem já recebe auxílio-acidente.** Decisão de 06/08:
  a IA sinaliza para conferência humana, não descarta sozinha. Falta definir
  como tratar incerteza e como a sinalização aparece.
- **Apagar o webhook `chatwoot-teste`** em Configurações → Integrações →
  Webhooks. Ele aponta para um 404 e o Chatwoot dispara um POST a cada mensagem.
- **`kanban-resumo` inativo** — o resumo por IA do card nunca é chamado.
- **`kanban-sync` com `aplicado: 0`** — verificar se o workflow devolve outro
  valor que não `"aplicado"`.

---

## 7. Ambiente de teste — como está e como desmontar

Projeto **`chatwoot-teste`** no Easypanel, três serviços:

| Serviço | Detalhe |
|---|---|
| `db` | `pgvector/pgvector:pg17`, banco `chatwoot`, host interno `chatwoot-teste_db` |
| `redis` | padrão |
| `app` | imagem no SHA em teste, sem Sidekiq |

URL: **https://chatwoot-teste-app.xnloe0.easypanel.host** (domínio automático do
Easypanel, HTTPS já resolvido — não precisa de registro DNS).

O banco é cópia da produção de 06/08: 429 conversas, contatos e telefones reais.
Foi neutralizado — webhooks apagados, regras de automação e campanhas
desativadas — e **não tem Sidekiq de propósito**, porque é o Sidekiq que
executaria campanhas e webhooks apontando para o n8n de produção. Sem ele, os
jobs ficam enfileirados no Redis e ninguém consome.

**Desmontar quando terminar:** apagar o projeto inteiro, inclusive o volume do
Postgres. Ele contém dados reais de clientes.

O passo a passo completo está em `GUIA-TESTE-EASYPANEL.md`, no mesmo diretório.

---

## 8. O que fazer a seguir

1. **Implantar em produção**: apontar `chatwoot` e `chatwoot-sidekiq` para
   `ghcr.io/mchaves-21/chatwoot:296d2bc781b7a379aa3c1f0dc14d92ff55bfa9c7` e
   reimplantar os dois.
2. **Avisar a equipe antes**: o quadro de Auxílio Acidente perde 6 conversas
   (foram para o funil BPC, não sumiram) e ganha duas colunas; o funil BPC abre
   com 121 cards em "Sem etapa" e as 14 etapas zeradas, e isso é o esperado.
3. **Desmontar o `chatwoot-teste`.**
4. **Investigar o agendamento de backup** (6.1) — é a pendência mais séria.
5. Depois disso, o bug das mensagens duplicadas.

Rollback, se precisar: voltar os dois serviços para
`ghcr.io/mchaves-21/chatwoot:6f3e289af9d95a2abd321259889fe9d70b53a98c` e
reimplantar. Não há migração de banco nesta mudança. As 14 etiquetas `bpc_`
continuam existindo depois do rollback e não atrapalham nada.

---

## 9. Como trabalhar

- **Propor antes de executar**, e esperar o ok. Vale especialmente para qualquer
  aplicação em lote e para mexer em workflow do n8n publicado, que fala com
  cliente real.
- **Testar antes de subir**, no ambiente isolado. O `GUIA-TESTE-EASYPANEL.md`
  monta um em uns 15 minutos.
- **Não poupar más notícias.** Foi assim que se descobriu, em dias diferentes,
  que não havia backup nenhum, que o agendamento não roda, e que a instrução do
  Postgres estava errada.
- **Terminal e VS Code aceitam clique mas não digitação** por controle do
  computador; comandos precisam ser colados pelo Murilo. Senhas e chaves SSH
  ficam com ele.
- **O campo "Comando" do Easypanel é interpretado por shell** — aceita `&&`.
- **Existe número de WhatsApp de teste** e existe uma conversa
  "TESTE BPC - nao responder" (id 493). Perguntar antes de disparar qualquer
  coisa; nenhuma mensagem de validação deve sair para contato real.
