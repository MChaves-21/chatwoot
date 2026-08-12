# Prompt para a próxima conversa no fork do Chatwoot

Copie o bloco abaixo inteiro e cole como primeira mensagem. Depois escreva, no
fim, o que você quer nesta rodada.

---

Quero continuar o trabalho no fork do Chatwoot da Gonçalves & Silva. Antes de
qualquer coisa, leia este arquivo — ele é auto-suficiente e explica o projeto
inteiro, incluindo o que ficou pendente:

`C:\Users\assis\Documents\GitHub\chatwoot\app\javascript\dashboard\routes\dashboard\kanban\CONTEXTO-fork.md`

**Leia a seção 0 primeiro.** Há uma rodada de mudanças **escrita no clone e não
commitada**, e o primeiro passo provavelmente é fechar isso.

**Contexto rápido, para você saber onde pisa:**

- É um **fork do Chatwoot 4.16.2** (`github.com/MChaves-21/chatwoot`, branch
  `goncalves-main`), com uma tela nova: o Kanban Comercial. Quase tudo vive em
  `app/javascript/dashboard/routes/dashboard/kanban/`, uma pasta que o upstream
  não tem — o fork só toca ~10 linhas de **três** arquivos do Chatwoot
  original, e isso é de propósito.
- Produção: `https://chatwoot.goncalvesesilva.cloud` (account_id 1), rodando a
  imagem `ghcr.io/mchaves-21/chatwoot:aa4b4ac28…`, apontada pelo Easypanel
  (`easypanel.goncalvesesilva.cloud`, projeto `n8n`, serviço `chatwoot`, aba
  **Fonte**).
- Repositório clonado em `C:\Users\assis\Documents\GitHub\chatwoot`, uso o
  GitHub Desktop. **Não há `node_modules` no clone**, então lint e build locais
  não rodam — a seção 3 do contexto explica o que dá para verificar mesmo
  assim, e vale fazer.
- Push na `goncalves-main` dispara o build no GitHub Actions (~4 min). Depois é
  preciso conferir a tag no Easypanel e clicar em Implantar.

**Três armadilhas que já custaram caro (seção 4 do contexto):**

1. **O Easypanel já ficou preso num sha antigo.** Implantar reinstalava a mesma
   versão e parecia que o deploy tinha funcionado. Confira o campo Imagem antes,
   e clique em **Salvar** depois de trocar — só digitar não basta. Sinal de que
   a tela está velha: se a coluna "Contrato enviado" ainda aparece no funil de
   Auxílio, é imagem antiga — a etiqueta está em 0 conversas.
2. **Git rodando de fora do Windows trava e deixa `.git/index.lock` preso.**
   Commite pelo GitHub Desktop.
3. **"Aberto" e "Em atendimento" são o mesmo status no Chatwoot.** Se eu pedir
   algo que dependa de diferenciar os dois por botão, me avise que não dá.

**Como eu gosto de trabalhar:**

- **Verifique contra a base real em vez de assumir.** Eu abro as abas do
  Chatwoot, n8n, Easypanel, GitHub e Supabase no Chrome para você — peça se
  precisar, e use a minha sessão logada. O código pronto de consulta está na
  seção 3 do contexto. Praticamente toda decisão boa deste projeto veio de olhar
  o número antes; na última rodada isso evitou uma migração de dados inteira.
- **Me diga quando algo que eu pedi não vai funcionar na prática, e por quê,
  com número na mão.** Isso já evitou várias entregas inúteis.
- **Me pergunte antes de sair codando** se o escopo estiver solto. Prefiro
  responder três perguntas do que receber a coisa errada.
- Pode escrever o código direto no repositório. **Só me confirme antes do
  deploy em produção**, porque o restart derruba o atendimento por cerca de um
  minuto, e a equipe fotografa a tabela às 12h e às 17h30.
- Se a mudança mexer em dados de produção (etiquetas, conversas, contatos), me
  diga o que vai mudar e em quantos registros **antes** de executar.
- Evite mexer em arquivos fora da pasta do kanban. Quando não der para evitar,
  faça como foi feito com `MoreActions.vue`: a lógica nova vai para um
  componente na pasta do kanban e o arquivo do upstream muda **uma linha só**.
- Comentários no código em português, explicando **por que**, no estilo dos
  arquivos que já existem.

**O que já está pronto e no ar** (não refazer): os dois funis de etiqueta
(Auxílio Acidente e BPC), o quadro "Por estado" e a tabela de atendimentos com
"Copiar imagem", que a equipe manda no grupo duas vezes por dia.

**O que está pronto no clone mas não implantado** (seção 0 do contexto): matriz
departamento/agente × estado na aba "Por estado", coluna Tags em
Criados/Atualizados, resumo escondido no BPC, fusão de "Lead potencial" em
"Comercial", desqualificar passa a resolver a conversa, e o seletor de 4 estados
+ "Marcar como não lida" no cabeçalho da conversa.

**Pendências já levantadas** (seção 8): criar as Equipes no Chatwoot (destrava
a metade escondida da matriz nova), atribuir conversas, a migração dos 431 leads
do ChatGuru, o aviso de último sync do n8n, o redesenho do card e as etapas
pós-venda.

---

## O que eu quero nesta rodada

> Escreva aqui antes de colar. Se for uma ideia solta, tudo bem — prefiro que
> você me questione o escopo antes de sair codando.

-
-
-

---

## Documentos irmãos

| Arquivo | Assunto |
|---|---|
| `CONTEXTO-fork.md` | Este projeto: arquitetura, build, deploy, lições, pendências |
| `CONTEXTO-auditoria-ia.md` | Comportamento da IA de atendimento — **é n8n, não este repositório** |
| `CONTEXTO-melhorias.md` | Histórico das rodadas 1 e 2 do quadro por estado |
| `CONTEXTO.md` | Notas da construção original do kanban |
