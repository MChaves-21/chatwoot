# Kanban Comercial dentro do Chatwoot — instalação

Porte do `kanban-comercial.vercel.app` para uma tela nativa do Chatwoot.
Sem iframe, sem link externo: barra lateral do Chatwoot à esquerda, quadro na
área principal, mesma sessão do agente.

---

## 1. Onde colocar os arquivos

Copie a pasta inteira para dentro do fork:

```
app/javascript/dashboard/routes/dashboard/kanban/
├── Index.vue
├── routes.js
├── api.js
├── constants.js
├── helpers.js
├── excel.js
├── useKanbanBoard.js
└── components/
    ├── BaseModal.vue
    ├── ContactPopup.vue
    ├── DayViewModal.vue
    ├── FiltersModal.vue
    ├── KanbanCard.vue
    └── KanbanColumn.vue
```

**Tudo isso é arquivo novo.** Nenhum deles existe no upstream, então nenhum
deles vai dar conflito de merge quando você atualizar o Chatwoot.

---

## 2. As três edições em arquivos do upstream

São as únicas. Mantenha-as pequenas — cada linha tocada aqui é um conflito
futuro.

### 2.1 Registrar a rota — **faça esta primeiro**

`app/javascript/dashboard/routes/dashboard/dashboard.routes.js`

```diff
 import { routes as captainRoutes } from './captain/captain.routes';
+import { routes as kanbanRoutes } from './kanban/routes';
 import AppContainer from './Dashboard.vue';
```

```diff
       children: [
         ...captainRoutes,
+        ...kanbanRoutes,
         ...inboxRoutes,
```

> **Valide antes de seguir.** Abra
> `https://chatwoot.goncalvesesilva.cloud/app/accounts/1/kanban` direto na
> barra de endereço. O quadro tem que carregar. Se você mexer no `Sidebar.vue`
> antes disso e o item não aparecer, não vai saber se o problema é a rota ou o
> menu — o item some **sem erro e sem log** quando a rota não existe.

### 2.2 Item no menu

`app/javascript/dashboard/components-next/sidebar/Sidebar.vue`

Dentro de `const menuItems = computed(() => { return [ ... ] })`, logo depois do
bloco `{ name: 'Conversation', ... }`:

```js
    {
      name: 'Kanban',
      label: 'Kanban',
      icon: 'i-lucide-columns-3',
      to: accountScopedRoute('kanban_index'),
      activeOn: ['kanban_index'],
    },
```

O rótulo vai como texto literal de propósito: "Kanban" é igual em português e
inglês, e assim os arquivos de tradução do upstream não precisam ser tocados —
menos dois pontos de conflito. Se preferir traduzir, troque por
`t('SIDEBAR.KANBAN')` e adicione a chave em `pt_BR` e `en`.

### 2.3 Nada mais

Não há mudança no backend Ruby, nem em rotas do Rails, nem em CSP.

---

## 3. Verificar depois de subir

Na ordem, porque cada passo depende do anterior:

| # | O quê | Como saber que funcionou |
|---|---|---|
| 1 | A rota abre | URL direta carrega o quadro |
| 2 | **Leitura autenticada** | as colunas populam sem nenhum token configurado |
| 3 | O item aparece no menu | ícone de colunas na lateral |
| 4 | Escrita | arrastar um card e conferir a etiqueta no Chatwoot |
| 5 | Permissão | logar como Juliana/Gabriel e ver só o que devem ver |

O passo 2 é a premissa de todo o porte. Se ele falhar, pare: o resto não vai
funcionar e o problema é de autenticação, não do quadro.

---

## 4. O que mudou em relação ao arquivo do vercel

### Sai o proxy, entra a sessão

A função `cwRequest()` empacotava `{method, path, body, secret}` e mandava para
o webhook `kanban-proxy` do n8n. Agora `api.js` chama a API do Chatwoot direto,
pelo cliente axios do dashboard, que já carrega a autenticação do agente.

Consequências:

- **O segredo compartilhado sai do navegador.** Ele dava acesso a um
  encaminhador genérico para toda a API do Chatwoot — qualquer pessoa com o
  DevTools aberto tinha acesso total aos dados de clientes.
- **Cada agente vê o que tem direito de ver**, porque quem responde é a API com
  a sessão dele.
- **Some o campo "Account ID"**: vem da URL da rota.

Sobrevivem dois webhooks externos, porque não são API do Chatwoot: consulta de
lead no Supabase (`kanban-lead`) e resumo por IA (`kanban-resumo`). O segredo
deles continua no `localStorage`, mas agora alcança só esses dois endpoints.
**Use um segredo diferente do antigo, e rotacione o antigo.**

### Sai o innerHTML

O arquivo original montava HTML por concatenação de strings — cards, popup,
histórico de mensagens, tabela do dia — protegido pela função `esc()`. Isso era
tolerável num domínio separado. Same-origin dentro do Chatwoot, uma falha de
escape viraria acesso à sessão do agente. Todo o markup virou template do Vue,
que escapa por padrão. A `esc()` não foi portada porque não tem mais função.

### Sai o botão "Atualizar do Supabase"

Ele chamava o workflow `kanban-sync`, que é outro assunto (Supabase → Chatwoot)
e vinha terminando com `aplicado: 0` — o mesmo caso que a auditoria dos
workflows apontou. Recoloque depois de consertar o workflow; o gancho no
front é pequeno.

### Muda o resumo do popup

O resumo agora sai no formato de ficha previdenciária, montado assim que o
card é aberto:

```
📅 Ano do acidente: 2026
📅 Mês do acidente: Junho
👷 Profissão na época: Faxineira
📍 Como aconteceu: Tropeçou em extensão e caiu em casa
💥 Sequela/limitação: Sim - Limitação grave para dobrar o braço
💼 Situação na época: Desempregada
🩺 Recebeu auxílio-doença: Não
📄 Tem documentos médicos: Sim
⚖️ Tem advogado na causa: Não perguntado

🚫 MOTIVO DA DESQUALIFICAÇÃO:
...

⚠️ PROBLEMAS IDENTIFICADOS:
- Pergunta sobre advogado não foi feita
- Não informado se recebeu seguro-desemprego

📌 Status: ❌ DESQUALIFICADO para o Auxílio-Acidente
```

**Duas origens, mesmo formato.** Se `kanban-resumo` estiver configurado, quem
manda é a IA e o texto dela aparece como veio. Sem webhook, ou se ele falhar, a
ficha é montada localmente por palavra-chave — e aí ela aparece marcada como
"Ficha montada localmente", com aviso.

A ficha local acerta bem ano, mês, profissão, mecanismo do acidente e as
perguntas de sim/não. O que ela **não** faz é interpretar: negação complexa e
ironia passam batido. O valor real dela não é o preenchimento, é a lista de
**problemas identificados** — o que ainda falta perguntar. Essa parte é
confiável, porque deriva do que não foi encontrado.

> Para a IA e a ficha local ficarem idênticas, o workflow `kanban-resumo` deve
> devolver exatamente esses campos, nessa ordem. Vale alinhar o prompt.

---

### O que mais saiu, e por quê

| Item do original | Situação |
|---|---|
| Cabeçalho com `logo.png` e o domínio do Chatwoot | removido — o Chatwoot já tem cabeçalho e você já sabe onde está |
| Campos base / account / token / proxy no Configurações | removidos — a sessão responde por eles |
| `reportUrl` (`webhook/relatorio-diario`) | removido — estava nas constantes mas nenhum código chamava |
| Botão "Atualizar do Supabase" | removido — ver acima |
| `esc()`, `cssId()`, `buildBoard()`, `renderColumn()` | removidos — o Vue faz isso |

Todo o resto foi portado: colunas com paginação, arrastar e soltar com desfazer
em caso de erro, filtros (busca, tag, flag do lead, datas, não lidas),
exportação Excel com as abas Cartões e Panorama, telas de criados/atualizados
com navegação por dia, e o popup do contato completo — dados, tags com
sugestões, histórico de mensagens e mover de fase.

---

## 5. Pontos de atenção

**Tokens de tema.** Os componentes usam as classes `n-*` do Chatwoot
(`bg-n-background`, `border-n-weak`, `text-n-slate-11/12`, `bg-n-alpha-2`,
`text-n-brand`) para acompanhar claro/escuro. Se algum não existir na sua
versão, o elemento fica sem estilo — não quebra. Cores de etapa e de tag
continuam vindo da configuração, via `style` inline.

**SheetJS.** Continua sendo baixado do cdnjs sob demanda, igual antes. Se
preferir não depender de CDN, adicione `xlsx` ao `package.json` do fork e troque
`loadSheetJS()` em `excel.js` por `await import('xlsx')`.

**Custo de "Exportar Excel" e das telas do dia.** As três pagina cada coluna até
o fim — teto de 200 páginas por coluna, 11 colunas. É caro. Se ficarem lentas, o
caminho certo é filtrar por data na própria API em vez de carregar tudo e
filtrar no navegador.

**Escrita de etiquetas é substituição.** A API do Chatwoot troca o conjunto
inteiro, não acrescenta. `moveToStage` monta a lista final preservando tudo que
não é etapa — inclusive `atendimento_humanizado`, de que o fluxo do n8n
depende — e acrescenta `manual`. Se alguém mudar etiquetas pelo Chatwoot entre
o carregamento do quadro e o arraste, o quadro sobrescreve. Janela pequena, mas
real: recarregue antes de operar em lote.

**Quatro etiquetas de funil ficam fora do quadro.** As colunas cobrem 11
etapas; o funil tem 15. `lead_potencial`, `contrato_enviado`, `contrato_fechado`
e `recebendo_31` não aparecem em coluna nenhuma — conversas só com elas ficam
invisíveis. Se não for intencional, acrescente as colunas em Configurações.

**Preferências antigas.** A chave do `localStorage` mudou de
`cw_kanban_config_v3` para `cw_kanban_prefs_v4`, porque a antiga guardava o
segredo do proxy. Quem já usava o quadro vai começar com as colunas padrão.

---

## 6. Quando estiver em produção

Desative o proxy `kanban-proxy` no n8n e o deploy do vercel. Enquanto os dois
caminhos existirem, o proxy aberto continua sendo uma porta para os dados —
e ninguém vai lembrar de fechar depois.
