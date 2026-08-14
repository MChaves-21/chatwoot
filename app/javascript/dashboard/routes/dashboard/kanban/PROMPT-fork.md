# Prompt para a próxima conversa no fork do Chatwoot

Copie o bloco abaixo inteiro e cole como primeira mensagem. Depois escreva, no
fim, o que você quer nesta rodada.

---

Quero continuar o trabalho no fork do Chatwoot da Gonçalves & Silva. Antes de
qualquer coisa, leia este arquivo — ele é auto-suficiente e explica o projeto
inteiro, incluindo o que ficou pendente:

`C:\Users\assis\Documents\GitHub\chatwoot\app\javascript\dashboard\routes\dashboard\kanban\CONTEXTO-fork.md`

**Leia a seção 0 primeiro.** Nada está pendente de deploy — `722786ac2` está no
ar. O que trava hoje é fora do código. A rodada 7 (13/08, tarde) foi toda no
n8n: a sessão da uazapi voltou, 8 avisos perdidos foram reenviados, e duas
guardas novas entraram no ar.

**Contexto rápido, para você saber onde pisa:**

- É um **fork do Chatwoot 4.16.2** (`github.com/MChaves-21/chatwoot`, branch
  `goncalves-main`), com uma tela nova: o Kanban Comercial. Quase tudo vive em
  `app/javascript/dashboard/routes/dashboard/kanban/`, uma pasta que o upstream
  não tem — o fork só toca ~10 linhas de **três** arquivos do Chatwoot
  original, e isso é de propósito.
- Produção: `https://chatwoot.goncalvesesilva.cloud` (account_id 1), rodando a
  imagem `ghcr.io/mchaves-21/chatwoot:722786ac2…`, apontada pelo Easypanel
  (`easypanel.goncalvesesilva.cloud`, projeto `n8n`, serviço `chatwoot`, aba
  **Fonte**).
- Repositório clonado em `C:\Users\assis\Documents\GitHub\chatwoot`, uso o
  GitHub Desktop. **Não há `node_modules` no clone**, então lint e build locais
  não rodam — a seção 3 do contexto explica o que dá para verificar mesmo
  assim, e vale fazer.
- Push na `goncalves-main` dispara o build no GitHub Actions (~4 min). Depois é
  preciso conferir a tag no Easypanel e clicar em Implantar.
- As duas caixas são `Channel::Api` (6 = Auxílio acidente, 9 = BPC). Campanha do
  Chatwoot **não funciona** nelas, e **conversa não muda de caixa**.

**A lição mais cara do projeto, e a que eu quero que você não repita:**

Em 12/08 uma migração criou 214 conversas na caixa 9. Isso disparou um workflow
do n8n e **14 pessoas receberam um vídeo de apresentação sem nunca ter falado
comigo.** A causa não foi o Chatwoot nem o n8n: foi ninguém ter perguntado *"o
que dispara quando nasce uma conversa nesta caixa?"*.

**Antes de qualquer inserção em lote em produção — conversa, mensagem ou
etiqueta — liste o que escuta aquele evento e me diga o que vai rodar.**

**Outras armadilhas que já custaram caro (seções 4 e 6 do contexto):**

1. **O Easypanel já ficou preso num sha antigo, duas vezes.** Implantar
   reinstalava a mesma versão e parecia que o deploy tinha funcionado. Confira o
   campo Imagem antes, e clique em **Salvar** depois de trocar — só digitar não
   basta. Para saber se a tela mudou de verdade, compare o hash do bundle
   (`/vite/assets/dashboard-XXXX.js`) antes e depois; hoje é
   `dashboard-BvLEXRDE.js`.
2. **Git rodando de fora do Windows trava e deixa `.git/index.lock` preso.** Pior:
   `git status` devolve **vazio**, que é indistinguível de "árvore limpa".
   Commite pelo GitHub Desktop.
3. **"Aberto" e "Em atendimento" são o mesmo status no Chatwoot.** Se eu pedir
   algo que dependa de diferenciar os dois por botão, me avise que não dá.
4. **A mesma ideia escrita em dois lugares diverge.** Já aconteceu com as listas
   de etiqueta de descarte e deixou 14 leads descartados aparecendo como trabalho
   em andamento por meses.
5. **No n8n, `update_workflow` só cria rascunho** — chame `publish_workflow`
   depois, ou a execução continua usando o código velho.
6. **Etiqueta de conversa não é etiqueta de contato.** As `chatguru_*` estão nas
   conversas; o nó de guarda do vídeo lia as do contato. Uma condição escrita no
   objeto errado passa na revisão, entra no ar e não protege nada.
7. **try-catch não conserta, muda de lugar.** O `Kanban Sync` termina **verde**
   mesmo quebrando desde que ganhou try-catch no laço SCAN. Não confie no status
   da execução — leia o `_resumo`.
8. **Não leia a API `/rest` do n8n por script:** ele invalida a sessão e te
   desloga. Trabalhe pela tela.
9. **Botão "Publish" cinza em workflow de gatilho manual não é rascunho parado.**
   É o n8n dizendo que ali não existe publicação. O que está salvo é o que roda.

**Como eu gosto de trabalhar:**

- **Verifique contra a base real em vez de assumir.** Eu abro as abas do
  Chatwoot, n8n, Easypanel, GitHub e Supabase no Chrome para você — peça se
  precisar, e use a minha sessão logada. O código pronto de consulta está na
  seção 3 do contexto. Praticamente toda decisão boa deste projeto veio de olhar
  o número antes.
- **Me diga quando algo que eu pedi não vai funcionar na prática, e por quê,
  com número na mão.** Isso já evitou várias entregas inúteis.
- **Me pergunte antes de sair codando** se o escopo estiver solto. Prefiro
  responder três perguntas do que receber a coisa errada. E **pergunte de onde o
  dado veio** antes de rotear qualquer importação — na migração do ChatGuru o
  roteamento por tag estava tecnicamente certo e factualmente errado, e custou
  114 conversas recriadas.
- Pode escrever o código direto no repositório. **Só me confirme antes do
  deploy em produção**, porque o restart derruba o atendimento por cerca de um
  minuto, e **não implante às 12h nem às 17h30** — é quando a equipe fotografa a
  tabela.
- Se a mudança mexer em dados de produção (etiquetas, conversas, contatos), me
  diga o que vai mudar e em quantos registros **antes** de executar.
- Evite mexer em arquivos fora da pasta do kanban. Quando não der para evitar,
  faça como foi feito com `MoreActions.vue`: a lógica nova vai para um
  componente na pasta do kanban e o arquivo do upstream muda **uma linha só**.
- Comentários no código em português, explicando **por que**, no estilo dos
  arquivos que já existem.
- **Não mexa em credencial nem em sessão de WhatsApp.** Se o problema for esse,
  me diga o que fazer que eu faço.

**O que já está pronto e no ar** (não refazer):

- os dois funis de etiqueta (Auxílio Acidente, 11 colunas; BPC, 17 colunas);
- o quadro "Por estado" com a matriz departamento/agente × estado;
- a tabela de atendimentos com "Copiar imagem", fotografada duas vezes por dia;
- o seletor de 4 estados + "Marcar como não lida" no cabeçalho da conversa;
- as telas Criados/Atualizados, com coluna Tags e **filtro de etapas**;
- a migração do ChatGuru: 428 leads, todos na caixa 9, nas colunas "Closer
  ChatGuru" e "SDR ChatGuru", todos atribuídos à Juliana.

**O que está travado hoje, e não é código** (seção 8):

- **Ninguém é avisado quando a sessão da uazapi cai.** Em 13/08 ela caiu e 8
  avisos se perderam — três indeferimentos e um processo extinto entre eles. Só
  foi resolvido porque eu percebi e repareei. **Só eu posso reparear**; não mexa
  em credencial de sessão do WhatsApp. Um monitor de "última mensagem enviada
  com sucesso" resolveria e não existe.
- **A taxa de erro da conta está em 4,2% e subindo** (387 falhas). Não é o
  kanban nem o sync — é outro dos 66 workflows, e ninguém sabe qual.
- Atribuição de conversas não é rotina.
- As Equipes do Chatwoot continuam sem cadastrar — foi decisão minha, crio se
  achar necessário.

**Já resolvido na rodada 7** (não refazer): a guarda do vídeo — hoje ele não vai
para contato que já tem outra conversa na caixa 9 — e o alerta de sync parado,
que virou um nó de guarda dentro do próprio `Kanban Sync` lendo o `_resumo`, sem
workflow novo.

**Pendências menores já levantadas** (seções 8 e 10): rodar a planilha de
processos uma vez para confirmar a coluna ETAPA (é gatilho manual, um clique
meu), redesenho do card, etapas pós-venda, e o nó órfão `Processos consultoria1`
no n8n.

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
