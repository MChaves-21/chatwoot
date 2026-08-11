# Prompt para iniciar a próxima conversa

Copie o bloco abaixo inteiro e cole como primeira mensagem.

---

Estou continuando um trabalho no kanban do Chatwoot da Gonçalves & Silva.
Antes de qualquer coisa, leia estes dois arquivos, nesta ordem — eles são
auto-suficientes e explicam tudo:

1. `C:\Users\assis\Documents\GitHub\chatwoot\app\javascript\dashboard\routes\dashboard\kanban\CONTEXTO-melhorias.md`
2. `C:\Users\assis\Documents\GitHub\chatwoot\app\javascript\dashboard\routes\dashboard\kanban\CONTEXTO.md`

**Contexto rápido**, para você saber onde pisa:

- O kanban não é app separado: é um **fork do Chatwoot**,
  `github.com/MChaves-21/chatwoot`, branch `goncalves-main`. O código fica em
  `app/javascript/dashboard/routes/dashboard/kanban/`.
- Produção: `https://chatwoot.goncalvesesilva.cloud` (account_id 1), rodando a
  imagem `ghcr.io/mchaves-21/chatwoot:976c64c…`, apontada pelo Easypanel
  (`easypanel.goncalvesesilva.cloud`, projeto `n8n`, serviço `chatwoot`, aba
  **Fonte**). Push na `goncalves-main` dispara o build no GitHub Actions
  (~5 min); depois é preciso trocar a tag no Easypanel e clicar em Implantar.
- Rollback: apontar a tag para `296d2bc781b7a379aa3c1f0dc14d92ff55bfa9c7`.
- Tenho o repositório clonado em `C:\Users\assis\Documents\GitHub\chatwoot` e
  uso o GitHub Desktop. **Não há `node_modules`** no clone, então lint e build
  locais não rodam.

**O que já está em produção e funcionando** (não refazer): 3º quadro "Por
estado" com 7 colunas, e a tabela de atendimentos com botão "Copiar imagem",
que a equipe manda no grupo às 12h e às 17h30.

**O que eu quero nesta rodada** — está detalhado na seção 6.1 do
CONTEXTO-melhorias.md, já decidido comigo:

1. Seletor de período no quadro por estado: Hoje · 7d · 30d · Tudo.
2. Trocar os cards do quadro por estado por uma **tabela** paginada e
   ordenável, com chips de estado no topo servindo de filtro. Não gostei do
   visual de cards, e são 513 no DOM, o que deixa a tela pesada.
3. O subconjunto do visual que não vira retrabalho (seção 4.2): cabeçalho de
   coluna, estado vazio, destaque ao arrastar e navegação horizontal.

**Como eu gosto de trabalhar:**

- Verifique as coisas contra a base real em vez de assumir — dá para consultar
  a API do Chatwoot pelo navegador com a minha sessão logada, e foi assim que
  descobrimos os números que orientaram todas as decisões até aqui.
- Me diga quando algo que eu pedi não vai funcionar na prática, e por quê, com
  número na mão. Isso já evitou duas entregas inúteis.
- Pode escrever o código direto no repositório, commitar pelo GitHub Desktop e
  implantar no Easypanel — só me confirme antes do deploy em produção, porque
  o restart derruba o atendimento por cerca de um minuto.
- Comentários no código em português, explicando **por que**, no estilo dos
  arquivos que já existem.

---

## Observações que ainda quero passar

> Anote aqui, antes de colar, o que você quiser mudar na tela "Por estado" —
> a seção 4.3 do contexto está esperando por isso.

-
-
-
