# Testar uma mudança do Kanban antes de subir

Gonçalves & Silva · reescrito em 07/08/2026

Este arquivo mora dentro do repositório de propósito. A versão anterior foi
entregue solta numa conversa e desapareceu quando a conversa acabou.

---

## 0. Antes de qualquer push: fixar a produção num SHA

**Este passo é o mais importante do documento e não existia no procedimento
anterior.**

O `build-goncalves.yml` publica **duas** tags a cada push:

```
ghcr.io/mchaves-21/chatwoot:goncalves        <- move a cada build
ghcr.io/mchaves-21/chatwoot:<sha do commit>  <- fixa para sempre
```

A produção aponta para `:goncalves`. Isso foi pensado como conveniência — não
precisar mexer no Easypanel a cada deploy — mas o efeito colateral é sério: **no
instante em que o build termina, a tag que a produção usa já aponta para código
não testado.** A partir daí, qualquer reimplantação dos serviços `chatwoot` ou
`chatwoot-sidekiq`, mesmo por um motivo completamente alheio (reiniciar por
lentidão, mexer numa variável de ambiente, o Easypanel subir o container de
novo), puxa a versão nova sem ninguém ter decidido isso.

Antes do primeiro push de uma mudança, troque os dois serviços de `:goncalves`
para o SHA que está rodando hoje:

```
ghcr.io/mchaves-21/chatwoot:6f3e289af9d95a2abd321259889fe9d70b53a98c
```

Serviços: `chatwoot` e `chatwoot-sidekiq`, projeto `n8n`. É o mesmo código que já
está no ar — a reimplantação não muda nada para a equipe. O que muda é que a
produção deixa de ser um alvo móvel.

Daí em diante o ciclo vira: build publica o SHA novo → o SHA novo é testado →
a produção é apontada para o SHA novo de forma explícita. Rollback deixa de ser
"trocar para a imagem oficial e perder o kanban" e passa a ser "voltar para o
SHA anterior", que é exato.

---

## 1. Subir o ambiente de teste

Projeto novo no Easypanel (sugestão: `chatwoot-teste`), três serviços.

### 1.1 Postgres

Imagem **`pgvector/pgvector:pg16`**. A imagem padrão do template do Easypanel
não tem a extensão pgvector e o Chatwoot quebra no meio das migrações — o erro
aparece tarde, depois de vários minutos, e é fácil confundir com outra coisa.

Anote host, usuário, senha e nome do banco.

### 1.2 Redis

Imagem padrão. Nada de especial.

### 1.3 App

Imagem: a tag SHA que o build acabou de publicar (**não** `:goncalves` — se
você apontar o teste para `:goncalves`, o próximo push troca o que está sendo
testado no meio do teste).

Comando — o campo "Comando" do Easypanel passa por shell, então `&&` funciona:

```
bundle exec rails db:chatwoot_prepare && bundle exec rails s -b 0.0.0.0 -p 3000
```

Variáveis mínimas: `POSTGRES_*` e `REDIS_URL` apontando para os serviços acima,
`SECRET_KEY_BASE` (qualquer valor longo e aleatório — é um ambiente
descartável), `FRONTEND_URL` com o domínio de teste, `RAILS_ENV=production`.

**Não** reaproveite as credenciais da produção, e **não** aponte o teste para o
banco `n8n`. É o erro que transforma um teste em incidente.

### 1.4 Dados

Um Chatwoot vazio não valida nada aqui — o que precisa ser testado é como o
quadro se comporta com as conversas reais. Restaure o backup diário mais
recente no Postgres de teste:

```
ssh root@195.35.40.9
ls -lt /etc/easypanel/backups/n8n/chatwoot-db/ | head
```

Pegue o arquivo mais novo e restaure no banco de teste (não no `n8n`). Depois
da restauração, confira que sobrou conversa nas duas caixas:

```
bundle exec rails runner 'puts Conversation.group(:inbox_id).count'
```

Esperado: algo próximo de `{6 => 336, 9 => 121}` na data em que isto foi
escrito.

---

## 2. O que verificar nesta mudança

Entre num agente **com cargo personalizado**, não só como administrador. O bug
número 2 da revisão anterior era exatamente a tela sumir para quem tem custom
role, e ele passou despercebido em teste feito só com conta de admin.

### Funil de Auxílio Acidente

- [ ] O seletor de funil aparece no cabeçalho com dois botões.
- [ ] A coluna SDR mostra **258**, não 261. As três conversas a menos são do
      BPC e é isso que a mudança faz.
- [ ] Aparecem as colunas novas **Lead potencial** (3) e **Contrato enviado**
      (6). Antes essas conversas não tinham coluna nenhuma.
- [ ] Nenhum card do quadro pertence à caixa BPC. Abra alguns pela ficha e
      confira a caixa de entrada.

### Funil BPC

- [ ] Abre com **15 colunas**: "Sem etapa" mais as 14 etapas.
- [ ] "Sem etapa" tem **121** cards e as outras 14 estão zeradas. É o esperado:
      não houve migração do CRM antigo.
- [ ] Seis desses cards carregam etiqueta do funil de Auxílio Acidente
      (`sdr`, `contrato_enviado`, `aguardando_assinatura`, `lead_potencial`).
      Eles aparecem em "Sem etapa" porque não têm etiqueta `bpc_` — correto.
- [ ] Arraste um card de "Sem etapa" para "Lead novo". Confira **na conversa do
      Chatwoot** que a etiqueta `bpc_lead_novo` foi aplicada e que
      `atendimento_humanizado` **continua lá** — o fluxo do n8n depende dela.
- [ ] Arraste o mesmo card de volta para "Sem etapa". A etiqueta `bpc_lead_novo`
      tem que sair e nenhuma etiqueta estranha pode entrar no lugar.
- [ ] Arraste um card para "Análise médica" do BPC e confira que a etiqueta
      aplicada é `bpc_analise_medica`, e **não** `analise_medica`.

### O teste que importa mais que todos os outros

- [ ] Pegue uma conversa da caixa 6 que esteja em `analise_medica`. Anote o id.
      Vá para o funil BPC, mova qualquer card, volte para o funil de Auxílio
      Acidente e confira que aquela conversa **continua** em `analise_medica`.

      Cinco etapas têm nome igual nos dois funis. Se o prefixo `bpc_` ou o
      isolamento entre presets estiver errado, é aqui que aparece — e em
      produção apareceria como conversas trocando de etapa sozinhas, que é o
      tipo de defeito que a equipe leva dias para descrever.

### Configurações e Excel

- [ ] Em Configurações não existe mais o campo de colunas em JSON, e há um aviso
      explicando por quê.
- [ ] Exportar Excel nos dois funis gera arquivos com nomes diferentes
      (`kanban-auxilio_acidente-...` e `kanban-bpc-...`).
- [ ] No Excel do BPC, os 121 cards saem com a fase **"Sem etapa"** preenchida,
      não em branco, e a aba Panorama não mostra "Sem etapa" zerado ao lado de
      um "(sem fase)" com 121.

---

## 3. Promover para produção

Só depois de tudo acima:

1. Trocar a imagem dos serviços `chatwoot` e `chatwoot-sidekiq` para o SHA novo.
2. Reimplantar os dois.
3. Avisar a equipe **antes**: o quadro de Auxílio Acidente perde 6 conversas
   (elas foram para o funil BPC, não sumiram) e ganha duas colunas.

## 4. Rollback

Trocar os dois serviços de volta para o SHA anterior e reimplantar:

```
ghcr.io/mchaves-21/chatwoot:6f3e289af9d95a2abd321259889fe9d70b53a98c
```

Não há migração de banco nesta mudança — os arquivos alterados são JavaScript e
Vue. As 14 etiquetas `bpc_` criadas em 07/08/2026 continuam existindo depois do
rollback; elas não atrapalham nada, e apagá-las só faria sentido se a decisão de
ter o funil BPC fosse revertida por inteiro.

## 5. Desmontar o teste

Apagar o projeto `chatwoot-teste` inteiro, inclusive o volume do Postgres. Ele
contém uma cópia dos dados reais de clientes — 591 contatos e o conteúdo das
conversas. Deixar de pé um ambiente com dado real e senha fraca é pior do que
não ter testado.
