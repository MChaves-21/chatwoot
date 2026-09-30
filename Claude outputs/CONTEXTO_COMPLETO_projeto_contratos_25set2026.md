# CONTEXTO COMPLETO — Projeto "contratos" (Gonçalves & Silva Advogados)

> Documento de passagem para continuar o trabalho em outra conta do Claude.
> Estado em **25/09/2026**, Fortaleza (UTC-3). Cole este arquivo inteiro no início da conversa nova.

---

## 0. QUEM, O QUÊ E REGRAS DE OURO

- **Usuário:** Murilo Chaves (automação / n8n). **Chefe:** Dr. Antônio **Flávio** Gonçalves da Silva. Outras pessoas: Bianca Michele (cadastro), Karol (LawChat), Juliana Teixeira (Chatwoot).
- **Escritório:** Gonçalves & Silva Advogados Associados. CNPJ 32.769.826/0001-06. Av. Washington Soares, 1400, Sala 207, Fortaleza/CE (em frente à UNIFOR). Área principal: **previdenciário** (Auxílio-Acidente e BPC). Em criação: **trabalhista**.
- **Sistemas:**
  - n8n: `https://n8n.goncalvesesilva.cloud` (projeto pessoal `omY7khPnTocxtX0f`);
  - Chatwoot: `https://chatwoot.goncalvesesilva.cloud`, conta 1. É um **fork próprio** com kanban embutido;
  - ADVBOX (CRM jurídico);
  - ZapSign (assinatura);
  - Google Sheets `DB_contratos`;
  - Supabase / Postgres / Redis (estado e memória da IA);
  - WhatsApp via uazapi.

**Regras de ouro (aprendidas errando):**
1. No n8n, `update_workflow` salva **RASCUNHO**. Para valer, é preciso `publish_workflow` e depois conferir o `activeVersionId`.
2. Quando uma instrução do usuário contraria um dado já conhecido, **falar antes de publicar**. Em 21/09 foi publicada a fusão das filas LawChat/Chatwoot, e isso misturou os contratos do chefe.
3. Mexeu num roteador de tarefas (`Rotear Tarefa por Origem`), mexa também no gêmeo (`Rotear Tarefa Órfão`).
4. Patches de prompt da IA são feitos como **substituição de texto** no nó `Montar Prompt Multiagente` (padrão PATCH_*). Os blocos-fonte no nó `Blocos Multiagente` não são editados.
5. `setNodeParameter` não indexa dentro de array; é preciso mandar o array inteiro.
6. Claude **não exclui** registros no ADVBOX e **não faz login** em sistemas (ZapSign etc.). Isso fica com o Murilo.

---

## 1. MAPA DOS FLUXOS n8n (versões ativas em 25/09/2026)

| fluxo | id | versão ativa | papel |
|---|---|---|---|
| **0.PREPARO DE CONTRATOS - PT 1** | `3Fi7A9o07Z2yNxpe` | `29a18950-f0c6-4838-8c35-d19a0e02af25` | Formulário "Cadastro de Contratante" (`/form/cadastrodecontratos`) → confere dados → roteia para F1–F8 (geram o contrato na ZapSign) |
| F1…F8 (maior/menor, dentro/fora do CE, offline/digital) | F1 `oMvx3PtiULCOKYy4` · F2 `M6sU8cIJgXTViMF8` · F3 `6JlrGGIIU6HqH2Df` · F4 `tDzAeyezjWDtWfnV` · F5 `Lqf7MUpH0PYOpkAA` · F6 `I8jk007WMsIW37WR` · F7 `poPTrkucBH8FLh4m` · F8 `zUt1Brv6L3m7CftI` | — | Criam o envelope ZapSign, gravam a linha na DB_contratos e avisam o ADM |
| **Genérico Optimizado** | `tPIPjyjOqGTezT7y` | `2598499e-0e7e-4e15-b288-d7da0da4dfba` (53 nós) | Webhook ZapSign de contrato assinado → acha a linha na planilha (token → timestamp → nome) ou vai pelo **ramo órfão** (lê o PDF com IA) → `Cadastro ADVBOX` → cria tarefas no ADVBOX pela régua de filas |
| **Cadastro ADVBOX** | `qHwVx2UpvwRmSmHF` | `1152a9b1-1eea-472e-8d8f-dec422c1c7a5` | Subfluxo: traduz nomes em IDs, acha ou cria o cliente, abre o processo e devolve os ids. Manda e-mail "Cadastro ADVBOX incompleto" quando falha |
| **1. COMERCIAL - PREV** | `kpTwWVsvVYjyhGon` | `682445f8-0872-4372-a1b5-1f52e4f7eb53` | IA de WhatsApp (Chatwoot caixa 6) do Auxílio-Acidente, **multiagente** por estágio |
| **7. TRABALHISTA - ATENDIMENTO IA** | `bHqEEvXwU5MeyGdu` | **nenhuma (inativo)** | Canal trabalhista novo (ver §6) |
| 6. WEBHOOK CONTRATOS | `eohBn1xeUAk1EFxN` | — | Webhook de contratos |
| TESTE - Generico Optimizado (NAO ATIVAR) | `VWASbn4JMk7deKgp` | nunca ativar | Cópia de teste com todas as escritas desligadas. Está desatualizada: refazer quando for usar |
| Genérico Grande (antigo) | `oYvwQu9yFQfQPWZU` | inativo | Desenho original. Só se lê pelo navegador (`fetch('/rest/workflows/<id>')`) |

**Credenciais usadas (ids):**
- ADVBOX `dRgnLjC6Ao5ndYfz`;
- ZapSign `qFqk46RZQbkYEt3B`;
- OpenAI "uazapi AI agente" `Wl237e5iRYGUAhwq`;
- Postgres `YvW2NMEJaXs1QpiW`;
- Redis `G9vNyxiQ5za8pTMa`;
- Chatwoot: `vXbTJXOFN1qQIqgB` "Chatwoot API Token" (há outras: `pBNLdiIkT7A79BP6`, `qrH0hSN5EWEhBsiI`, `nNh8uRHotQtrzMme`, `GQSvzboGRKMUVYEn`);
- avisos WhatsApp: `1t7YU8qdzwWLUu3c` "Header Instancia 4178".

O MCP do n8n esconde as credenciais dos nós. Para ver qual está em uso, abra o nó no editor.

**Tabelas de dados (n8n):**
- `obs_roteador_multiagente` `VdX41toPwXbxJiFm`;
- `obs_buffer_perda` `OSjLHfVXOFIwzayg`;
- `trabalhista_estado` `1EQBIGInrzMbHZG0`.

**Planilha DB_contratos:** `12N-xDh-nURlxEeTwS2EBKxciEehHfDQwaInbLPGeoMk`, aba `contratos`, 38 colunas A–AL. A conta pessoal do Murilo não tem acesso.

---

## 2. RÉGUA DE FILAS NO ADVBOX (em produção desde 22/09)

**Regra do Flávio:** **Comercial 1** = tráfego pago. **Comercial 2** = indicações de clientes da base (pago ou offline). "Meta Ads" ≠ "Indicação Meta Ads".

```
1  SEDE lida da origem         -> ganha de tudo
2  COMERCIAL 2 (indicação)     -> digital 9250461 / offline 9251084
3  COMERCIAL 1 (tráfego pago)  -> canal LAWCHAT ? 8765632 : 8682636
4  padrão                      -> 9251084
```

| bloco | fila | operacional |
|---|---|---|
| Comercial 1 — LawChat | 8765632 | nenhuma |
| Comercial 1 — Chatwoot / sem canal | 8682636 | 9039866 |
| Comercial 2 digital | 9250461 | 9250924 |
| Comercial 2 físico / padrão | 9251084 | 9251242 |
| Cascavel | 9040353 | 9381873 |
| Pindoretama | 9548191 | 9548195 |
| Beberibe | 9548190 | 9548188 |
| Fortaleza | 10634954 | 10634958 |

**Origens (id ADVBOX):**
- **Comercial 1:** Anúncio 417995 · Meta Ads 417996 · Google Ads 417997 · Instagram 417998 · Discovery 458303 · Jusbrasil 440969 · GMN 531335 · Site 418000. Sem id: LawChat, Chatwoot, Fluxo IA, Link de Cadastro, US Brasil.
- **Comercial 2 digital:** Indicação Meta Ads 468974 · Indicação Jusbrasil 626236 · Indicação Digital 626235 · Indicação Discovery 468975.
- **Comercial 2 físico:** Indicação Offline 626237 · Indicação Zélia 443500 · Indicação 417999.
- **Sedes:** Cascavel 417994 (+ Indicação Dias 443501, Verônica 443503, Irione 443499) · Pindoretama 440968 (+ Ana Célia 443502) · Beberibe = Sindicato 458120 · Fortaleza 440967 (+ Gran Jardins 619552, Dra Luzirene 458049).

**Trava de reprocessamento:** se `cadastrado_crm` já é TRUE, nada é criado e o ADM é avisado. Efeito aceito: um 2º processo legítimo do mesmo cliente é barrado.

**IDs úteis:**
- users: Flávio 170604 · Karol 173664 · Juliana Teixeira 296548 · Bianca Michele 256491 · Davi Anastácio 173415 · Alba 173413 · Luana 173654 · Chardson 173861;
- tipos de ação: 87-ADM 1694152 · 36-ADM 1694167 · 36-JUD 1694194 · 94-ADM 1740249 · 94-JUD 1725619 · 32-ADM 1721214.

---

## 3. FORMULÁRIO DE CONTRATOS (PT 1)

- 30 campos. Origem com 25 opções (saíram Indicação Dr Thiago, Gessilê e Migração). "Canal do atendimento" é opcional (CHATWOOT / LAWCHAT / FORMULÁRIO) e separa LawChat de Chatwoot. 46 tipos de ação. "Responsável pelo cadastro" é obrigatório (11 nomes).
- **Desde 24/09 (versão `29a18950`):** os nós `Validar data e representante` e `Revalidar dados` (mesmo código) conferem CPF (dígito verificador), CEP (8 dígitos), WhatsApp/Telefone (celular com 9), UF (2 letras) e a data de nascimento (ano com 4 dígitos, não futura). Menor de 18 anos exige nome e CPF do representante. Os erros aparecem no topo da página "Confira seus dados" e o formulário **volta até ser corrigido** (IF `Dados com erro?`). Os documentos só são gerados quando não há erro.
- **Cidade = Beberibe** (Sindicato) segue um caminho próprio: vai direto para `Formatar Dados ADVBOX` → `Cadastro ADVBOX` e **não gera envelope na ZapSign**. Ainda falta confirmar como sai o contrato desses clientes.

---

## 4. IA DE WHATSAPP — AUXÍLIO-ACIDENTE (`1. COMERCIAL - PREV`)

- Entrada: webhook do Chatwoot `/webhook/chatwoot1234`. `Config Atendimento`: `inboxes_com_ia = [6]`.
- Portão `IA deve atender?`: a IA não responde se a conversa tem as etiquetas `atendimento_humanizado`, `manual` ou de desfecho.
- Buffer Redis de 20 s para juntar as mensagens → `Buscar Cliente1` (Supabase, flags SEGURADO, Iniciou_coleta, Contrato_enviado…) → **multiagente**: `Montar Prompt Multiagente` monta BASE + o bloco do estágio (`deriveStage`: sdr→triagem, comercial, contrato_em_elaboracao→coleta, aguardando_assinatura).
- Agente `Advogado Prev3 MULTI` (gpt-4.1-mini, temperatura 0.1), persona **"Juliana"**. Ferramentas: indicar Data do Acidente, SEGURADO, Indicar Início ETAPA 9, GERAR CONTRATO, MARCAR LEAD DESQUALIFICADO, PASSAR PARA A EQUIPE, SOLICITAR ATENDIMENTO PRESENCIAL.
- Texto-fonte dos blocos: doc do projeto `MULTIAGENTE_5_blocos_tom_caloroso_22set.md` (nó `Blocos Multiagente`).
- **Patches ativos no `Montar Prompt Multiagente`:**
  - s56: GERAR CONTRATO chamado antes do texto "Tô gerando";
  - s57: triagem só executa SEGURADO depois das perguntas; trava de ordem no comercial; endereço ≠ verificação; pergunta "posso explicar" feita uma vez só;
  - **s58 (25/09) PATCH_BPC**: desemprego ("nunca mais consegui emprego") não dispara BPC; sequela parcial (parafuso, pino, joelho…) segue o roteiro; fora da lista grave, é proibido transferir sem a pergunta "ainda consegue trabalhar de alguma forma?"; a frase "Atendemos presencialmente sim!" só vale se o cliente pediu presencial. Caso de origem: conversa 2456, exec 263427. **Ainda não validado em conversas reais.**

---

## 5. KANBAN DO CHATWOOT (fork)

- Repo: `github.com/MChaves-21/chatwoot`, branch **`goncalves-main`**, deploy automático no push. Cópia local: `C:\Users\assis\Documents\GitHub\chatwoot`. Código em `app/javascript/dashboard/routes/dashboard/kanban/` (`constants.js` define as colunas; cada coluna é uma **etiqueta** do Chatwoot).
- Abas: **Auxílio Acidente** (caixa 6) · **BPC** (caixa 9, etiquetas com prefixo `bpc_`, com a coluna sintética "Sem etapa") · **Trabalhista** (nova) · **Por estado** (quadro por status da conversa, caixas 6 e 9).
- **Commit `bbfb4c2f49` (25/09), ainda SEM PUSH:**
  - BPC ganha "Lead novo especial" (`bpc_lead_novo_especial`) depois de "Lead novo";
  - funil **Trabalhista** com 12 colunas: `trab_apresentacao`, `trab_qualificacao`, `trab_coleta_info`, `trab_explicacao_processo`, `trab_condicoes_financeiras`, `trab_objecao`, `trab_fechamento`, `trab_coleta_contrato`, `trab_contrato_enviado`, `trab_prescrito`, `trab_sem_direito`, `trab_desinteresse`;
  - `TRABALHISTA_INBOX_ID = null`: sem caixa, o quadro lê as etiquetas trab_* de todas as caixas;
  - os 3 desfechos de descarte entram em `CLOSED_LABELS`;
  - filtro "Fases Kanban · Trabalhista";
  - a aba Resumo fica escondida no Trabalhista.
- Dica técnica: na VM do Claude, `git status`/`git commit` nesse repo estouram o tempo. Use `git write-tree` + `git commit-tree` + `git update-ref`. O push precisa ser feito pelo GitHub Desktop do Murilo.

---

## 6. CANAL TRABALHISTA (novo, 25/09) — `7. TRABALHISTA - ATENDIMENTO IA`

- Base: script que o chefe mandou (modelo de outro escritório, "Dr. Adailto / Richard Mendes e Zanatta"), adaptado para a Gonçalves & Silva.
- **Fluxo:**
  1. Webhook `/webhook/chatwoot-trabalhista` → `Config Trabalhista` (inbox_trabalhista **0 = desligado**, nome_atendente "Juliana", advogado "Dr. Antônio Flávio Gonçalves da Silva (OAB/CE 46.884)", honorários "30%", Instagram flaviogon92).
  2. `Normalizar Entrada`: só aceita mensagem do cliente, da caixa certa, sem `atendimento_humanizado` ou `manual`.
  3. Buffer Redis de 15 s → `Juntar Mensagens`, que tira texto repetido seguido.
  4. `Buscar Estado` (tabela `trabalhista_estado`) → `Montar Prompt`.
  5. Agente (gpt-4.1-mini, 0.2, memória Postgres `trabalhista_chat`) → `Interpretar Resposta`.
  6. Saídas: salvar estado | enviar as mensagens (1,5 s entre elas) | trocar a etiqueta trab_* no Chatwoot | nota privada para a equipe.
- **Arquitetura de estado** (a do script do chefe): o código monta "CONTEXTO DO ATENDIMENTO" + seções "AVISO OBRIGATÓRIO". Estas regras são decididas **por código**, não pela IA:
  - prazo de 2 anos, calculado a partir de `data_desligamento`;
  - próximo dado do contrato que falta;
  - mostrar o resumo;
  - contrato já confirmado;
  - mesmo texto em até 3 min → a IA não responde.
- A IA responde com o texto + `<estado>{json}</estado>`. Ao juntar com o estado anterior, dado preenchido não é apagado e flags que viraram true continuam true.
- Etapas: etapa_1_apresentacao … etapa_8_coleta_contrato, encerrado (motivo: contrato / prescrito / sem_direito / desinteresse).
- **Contrato:** ainda não existe modelo trabalhista na ZapSign. Quando o cliente confirma os dados, vai uma NOTA PRIVADA no Chatwoot com os dados, para a equipe gerar o contrato.
- **Adaptações a confirmar com o chefe:**
  - persona "Juliana, da equipe trabalhista" (a IA não se passa pelo advogado);
  - removidas as médias de valor (R$ 7 mil / 20 mil / 40 mil), que eram de outro escritório: a IA não fala valor;
  - removidos os links do outro escritório;
  - honorários de 30% só se ganhar;
  - plantão de cuidador "qualquer escala (12x36, 24x48, 48x48…)", porque o script tinha "24x25/24x28";
  - quem trabalhou com carteira também passa pelo prazo de 2 anos;
  - sem áudios: a IA explica em texto.
- **Testado** só com dados simulados (exec 265692: o caso prescrito gerou o AVISO certo e a etiqueta trab_prescrito). **A IA real ainda não foi testada.**
- **Para ligar:**
  1. Criar a caixa do número novo no Chatwoot e pôr o id em Config Trabalhista.
  2. Criar o webhook `message_created` → `/webhook/chatwoot-trabalhista`.
  3. Conferir a credencial do Chatwoot nos 4 nós HTTP (o n8n avisou que podem ter ficado sem ela).
  4. Criar as etiquetas trab_* no Chatwoot.
  5. Pôr o id da caixa em `TRABALHISTA_INBOX_ID` no kanban e fazer o push.
  6. Publicar e testar com um número de teste.

---

## 7. HISTÓRICO RECENTE (o que aconteceu, para não repetir)

- **21–22/09:** fusão errada das filas LawChat/Chatwoot foi desfeita. Régua Comercial 1 × 2 publicada. Trava de reprocessamento.
- **Incidente de duplicidade:** Abrão Coelho de Matos virou 2 processos (o `Casar por Timestamp` casou pelo nome). O processo **18440669** precisa ser excluído à mão.
- **22/09:** ZapSign devolveu 500 em `POST /signers/{token}` para Davi Kalleb Dantas Matias (envelope `ff513c07…`). O envio teve de ser manual.
- **24/09 — "Cadastro ADVBOX incompleto: faltava tipo de ação ou cliente" (relato da Bianca):**
  - o aviso é o e-mail do Cadastro ADVBOX, e o tipo de ação estava certo;
  - quem falhou foi o cadastro do **cliente**: `POST /customers` recusou por dado inválido (CEP `6284-000` com 7 dígitos, WhatsApp `8599676964` sem o 9);
  - caso: Maria Luiza Amorim de Freitas, CPF 12729283307, Beberibe, menor, 87-ADM, representante Lívia Amorim da Silva;
  - por ser Beberibe, **nenhum envelope ZapSign foi gerado**, então não há o que cancelar;
  - correção: foi publicada a validação do formulário (§3).
- **24/09 — alucinações:**
  - **conversa 2456:** lead com CLT na FORT MOTOS em ~2016 e parafuso no joelho foi transferido como BPC e recebeu o texto de presencial → PATCH_BPC;
  - **conversa 2460:** o cliente mandou o mesmo texto 2 vezes (msg 53405/53407) e a IA respondeu as duas, porque o dedupe só compara o ID → **não corrigido no PREV**.

---

## 8. PENDÊNCIAS

### Dependem do Murilo / equipe
1. **Push do commit `bbfb4c2f49`** no GitHub Desktop (kanban).
2. Criar as etiquetas `bpc_lead_novo_especial` e `trab_*` no Chatwoot.
3. Número / caixa do canal trabalhista e os passos "Para ligar" do §6. Confirmar com o chefe as adaptações do script e os honorários.
4. Retomar à mão o lead da **conversa 2456** (ficou em atendimento humano e provavelmente qualifica).
5. **Maria Luiza Amorim de Freitas:** cadastrar no ADVBOX (cliente + 87-ADM) com CEP e celular corrigidos.
6. Excluir o processo **18440669** (Abrão) no ADVBOX.
7. Ajustes à mão: Solange Venancio (`18379505`) → fila Digital; Robério Moreira (`18381171`) → responsável Karol.
8. Donos das filas: só LawChat → Karol e Chatwoot → Juliana têm dono; as demais caem no Flávio.
9. Casos travados: FRANCISCA VALENTINA ("Contrato Ilegível" desde 17/09); KARLOS EDUARDO MATIAS FEIJÓ (linha 236, `cadastrado_crm = FALSE`); cobrança dos 11 pendentes; fila "A CLASSIFICAR".
10. Como sai o contrato dos clientes de Beberibe/Sindicato (esse ramo não gera ZapSign).

### Dá para o Claude fazer
1. **Dedupe por texto no `1. COMERCIAL - PREV`** (mesmo texto do mesmo cliente em até 2 min → ignorar). Oferecido, ainda não autorizado.
2. Acompanhar as próximas conversas de triagem para validar o PATCH_BPC.
3. Testar a IA trabalhista de verdade quando houver número de teste.
4. Refazer a cópia de teste do Genérico (`VWASbn4JMk7deKgp`), que está desatualizada.
5. Aviso pré-existente no n8n: `Validar data e representante` tem `{{ $... }}` sem `=` (é só comentário, inofensivo).

---

## 9. DOCUMENTOS DE APOIO (no projeto "contratos" da conta antiga)

`CONTEXTO_PREV_sessao_50…54`, `ADENDO_s54_22set`, `REGUA_ATUAL_comercial1_vs_comercial2`, `ORIGENS_ADVBOX_ids_21set`, `INCIDENTE_duplicidade_22set`, `COMO_AS_TAREFAS_SAO_CRIADAS`, `MULTIAGENTE_5_blocos_tom_caloroso_22set`, `FORMULARIO_mudancas_21set`, `ERRO_incompleto_Maria_Luiza_24set`, `s58_BPC_trava_kanban_trabalhista_25set`, `s58b_canal_trabalhista_e_kanban_25set`. Se a conta nova não tiver acesso a eles, este arquivo resume o essencial.
