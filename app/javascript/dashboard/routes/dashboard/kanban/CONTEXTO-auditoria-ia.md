# Contexto — auditoria da IA de atendimento

**Data:** 11/08/2026
**Escopo:** 6 queixas levantadas pela equipe sobre o comportamento da IA
("Karol") nas caixas de WhatsApp.
**Estado:** investigado no Chatwoot, com as conversas e os horários na mão.
Nada foi corrigido — este documento é o ponto de partida.

> Documento auto-suficiente. Quem abrir conversa nova trabalha sem o histórico.

---

## 1. O que é este sistema

A IA atende no WhatsApp pelas caixas **6 (Auxílio Acidente)** e **9 (BPC)** do
Chatwoot em `https://chatwoot.goncalvesesilva.cloud` (account_id 1). Ela se
apresenta como **"Karol, do escritório Gonçalves & Silva Advogados
Associados"**.

As caixas são do tipo `Channel::Api` — não são integração WhatsApp nativa do
Chatwoot. O tráfego passa por **Evolution API + n8n**, ambos no mesmo Easypanel
(`easypanel.goncalvesesilva.cloud`, projeto `n8n`).

**A IA não está no Chatwoot.** O Chatwoot é só o registro da conversa. Toda a
lógica de atendimento, qualificação e desqualificação vive no n8n. Qualquer
correção deste documento é no n8n, não no fork do Chatwoot.

### Acesso

| O quê | Onde | Situação em 11/08 |
|---|---|---|
| Chatwoot | `chatwoot.goncalvesesilva.cloud` | Sessão do gestor funciona; API respondendo |
| n8n | `n8n.goncalvesesilva.cloud` | **Sessão expirada** — a UI mostra "Error fetching workflows: Unauthorized". Precisa logar de novo antes de investigar |
| Easypanel | `easypanel.goncalvesesilva.cloud` | Funciona |

### O que se sabe do n8n (lido antes da sessão cair)

- **61 workflows**, 8.869 execuções de produção, 94 falhas, taxa de erro 1,1%.
- Existe um projeto chamado **"IA AUXIL…"** (nome truncado na tela) — é o
  candidato natural a abrigar o agente.
- Workflows identificados pelo nome: `Planilha Processos - Suporte ao Cliente`,
  `BPC - Video de primeira mensagem`, `Kanban Sync - Supabase → Labels Chatwoot`
  (id `yzmFpTjkUiJXWNrl`).
- **O workflow do agente ainda não foi identificado.** É a primeira coisa a
  fazer.

---

## 2. Resumo dos 6 achados

| # | Queixa | Confirmado? | Gravidade |
|---|---|---|---|
| 1 | IA diz que estamos em 2024 | **Sim**, com transcrição | **Alta** — corrompe o ano do acidente, que é o campo que decide tudo |
| 2 | IA dispensou lead com vínculo nos 2 anos | **Sim** | **Alta** — perda de caso válido |
| 3 | IA não continuou a conversa (Marcelo #667) | **Sim** | **Alta** — mesma causa do #2 |
| 4 | `#FIM` vazando para o cliente | **Sim**, 4 ocorrências | Média — cosmético, mas expõe mecanismo interno |
| 5 | Caso de BPC no kanban de acidente | **Sim** | **Alta** — caso grave tratado como lead morto |
| 6 | IA não perguntou sobre auxílio-doença | **NÃO se confirma** na conversa indicada | A investigar — ver 3.6 |

**Dois dos seis (#2 e #3) têm a mesma causa raiz.** Ver seção 4.

---

## 3. Cada achado, com a evidência

### 3.1 IA afirmando que estamos em 2024

**Conversa 673** · contato `~✌️` · +5583998638986 · caixa Auxílio Acidente ·
08/08/2026 · hoje `resolved`, etiquetas `desqualificado`, `manual`,
`atendimento_humanizado`.

O cliente disse que quebrou o fêmur em **13 de junho de 2026**. A IA não
aceitou:

```
12:42:45  IA   Você quis dizer 13 de junho de 2022, certo? Pode confirmar o ano?
12:43:11  CLI  Não foi 13 de junho de 2026
12:43:35  IA   Só para confirmar, esse acidente ainda não aconteceu, certo?
12:43:38  CLI  Isso
12:43:54  CLI  Aconteceu sim
12:46:30  IA   Parece que houve uma confusão com a data, Alfredo. Hoje estamos
                em 2024, então não é possível o acidente ter ocorrido em 2026
12:47:21  IA   Então o acidente aconteceu em 2024, certo?
```

E terminou desqualificando: *"Como você disse que era adolescente e não tinha
registro, infelizmente não se enquadra nas regras"*.

**Por que isso é o achado mais grave:** o ano do acidente é o campo que
determina prescrição, qualidade de segurado e período de graça. Uma IA que
insiste num ano errado não erra um dado — erra a qualificação inteira, e ainda
faz o cliente duvidar de si mesmo por 4 minutos.

**Hipótese:** a data atual não está sendo injetada no prompt do agente. Sem
isso, o modelo responde a partir do próprio corte de treinamento. É um dos erros
mais comuns em agente de LLM e a correção costuma ser uma linha no system
prompt.

**Detalhe adicional:** a IA chamou o cliente de **"Alfredo"**. O contato é
`~✌️` e o nome não aparece em nenhum momento anterior da conversa. Nome
inventado.

**Como confirmar a hipótese:** no workflow do agente, procurar se existe algo
como `{{ $now }}` / `new Date()` no system prompt. Se não existir, é esse o bug.

---

### 3.2 IA dispensou lead que tinha vínculo nos 2 anos anteriores

**Conversa 701** · `~Hellen` (Michellen) · +5527992363730 · caixa Auxílio
Acidente · 10/08/2026 · hoje `open`, etiquetas `sdr`,
`atendimento_humanizado`.

```
10:57:20  IA   Você tinha algum vínculo CLT nos 2 anos anteriores ao acidente?
11:03:20  CLI  Não
11:03:28  CLI  Eu tenho          ← 8 segundos depois, a cliente se corrige
11:03:48  IA   Michellen, obrigado pelas informações. Analisando a sua
                situação, por enquanto não conseguimos dar continuidade ao seu
                caso aqui no escritório
```

**A IA dispensou 20 segundos DEPOIS da correção.** Ela leu "Não", decidiu, e
ignorou o "Eu tenho" que chegou antes de ela responder.

O acidente foi voltando do serviço, de moto, com internação de 15 dias e
cirurgia no mesmo dia — caso com cara de válido.

Alguém percebeu e retomou às 13:25 do mesmo dia (*"Vi aqui que você informou que
teve vínculo antes do acidente e dentro do período de dois anos, qual foi a
data?"*), mas a cliente não respondeu mais. Às 16:30 houve tentativa de ligação.

**Hipótese:** não há agregação (debounce) das mensagens de entrada. No WhatsApp
as pessoas escrevem em pedaços; o agente reage a cada mensagem isolada. Uma
janela de espera de 10–15 segundos antes de processar resolveria este caso
específico e provavelmente vários outros.

---

### 3.3 IA não continuou a conversa — Marcelo #667

**Conversa 667** · `~marcelo` · +5521988491062 · caixa Auxílio Acidente ·
08/08/2026 · hoje `resolved`, etiquetas `desqualificado`, `manual`,
`atendimento_humanizado`.

```
00:24:39  CLI  Não tenho muita Força no braço e trabalho como CLT Hortifruti
                e pego peso aí dói mais
00:24:58  IA   Você estava registrado com carteira assinada (CLT) quando
                aconteceu o acidente?
00:25:13  CLI  Não
          ...  silêncio de 3 dias  ...
11/08 08:53   Olá, bom dia. Vi que você informou que não estava de carteira
                assinada na época do acidente, mas chegou a trabalhar algum
                período antes?
11/08 10:49  CLI  Antes não mais, agora estou trabalhando de carteira assinada
```

Duas coisas erradas aqui:

1. **A IA parou de responder** depois do "Não". Não desqualificou com a mensagem
   de sempre, não perguntou mais nada — simplesmente parou. Ficou 3 dias assim,
   até alguém retomar na mão.
2. **A pergunta certa só veio 3 dias depois.** O cliente tinha acabado de dizer
   que trabalha CLT hoje. A pergunta do vínculo nos 2 anos anteriores nunca foi
   feita pela IA.

**Mesma causa raiz do 3.2:** a regra de desqualificação dispara em *"não estava
CLT na época"* sem verificar o **período de graça / vínculo nos 2 anos
anteriores**. Nos dois casos a IA descartou (ou travou em) um lead que ela mesma
tinha informação para qualificar.

---

### 3.4 `#FIM` chegando no WhatsApp do cliente

**4 ocorrências**, todas como mensagem de saída (`message_type = 1`), ou seja,
o cliente recebeu:

| Conversa | Quando |
|---|---|
| 272 | 29/05/2026 07:18 |
| 396 | 22/06/2026 22:34 |
| 479 | 30/07/2026 16:04 |
| 668 | 07/08/2026 23:23 |

Contexto na 668 — sempre o mesmo padrão, logo depois do bloco de dispensa:

```
23:22:32  IA   Analisando a sua situação, por enquanto não conseguimos dar
                continuidade ao seu caso aqui no escritório
23:22:37  IA   Se no futuro sua situação mudar, pode nos chamar
23:22:42  IA   Qualquer dúvida, estou por aqui
23:23:12  CLI  Ok
23:23:30  IA   #FIM
```

**Resposta à pergunta "esse #FIM tem alguma função específica?":** sim, quase
certamente. É um **token de controle** — o prompt manda o agente emitir `#FIM`
para sinalizar que a conversa acabou, e o n8n deveria interceptar isso para
encerrar o fluxo, trocar etiqueta ou parar o robô. **Não é para o cliente ver.**

Quando o agente emite `#FIM` sozinho, numa mensagem separada e depois do
encerramento, o n8n não captura e o texto segue para o WhatsApp.

Frequência: 4 vazamentos em 8.869 execuções — cerca de um por mês. Baixo, mas é
o tipo de coisa que um cliente printa.

**Onde olhar:** no workflow, o nó que trata a saída do agente. Procurar por
`#FIM` no prompt e no código de parsing. A correção provável é remover o token
do texto antes de enviar, em vez de confiar que ele venha no formato esperado.

---

### 3.5 Caso de BPC no kanban de Auxílio Acidente — Neiliane

**Conversa 680** · `~Neiliane Silva` · +5577988640559 · caixa Auxílio Acidente ·
08/08/2026 · hoje **ainda `open`**, etiqueta `sdr` apenas.

Quem sofreu o acidente foi o marido. O que a esposa contou:

```
23:42:35  CLI  Ajudante de pedreiro
23:44:52  CLI  Ele caio de moto Aí bateu a cabeça e fez uma cirurgia delica
                na cabeça
23:44:59  CLI  Deu polo traumatismo
23:45:30  CLI  N            (não recebeu auxílio-doença)
23:47:00  CLI  Ele está acamado. ele fez uma ressonância e o resultado foi que
                ele van ficar sem andar e sem fala 😢
```

**Em 48 mensagens a IA não mencionou BPC uma única vez.** Não perguntou renda
familiar por pessoa, não perguntou enquadramento por deficiência — os dois
requisitos do BPC. Encerrou oferecendo o Instagram do Dr. Antonio Flávio.

**E repetiu o bloco de despedida duas vezes, palavra por palavra:**

```
23:49:59–23:50:14   Instagram + "dicas sobre direitos previdenciários" +
                    "É sempre bom ter um advogado de referência" +
                    "Qualquer coisa, estou por aqui!"
23:50:46–23:51:01   exatamente as mesmas 4 mensagens de novo
```

**O problema de fundo:** o agente conhece um produto só. Não existe roteamento
para BPC, mesmo o escritório tendo uma caixa e um funil inteiros para isso.
Incapacidade permanente total — sem andar, sem falar, acamado — é exatamente o
perfil de BPC por deficiência, e virou lead morto de auxílio-acidente.

Vale medir quantos outros casos assim existem antes de decidir o tamanho da
correção.

---

### 3.6 "IA não perguntou sobre auxílio-doença" — **não se confirma**

O telefone indicado, **+5535997666357**, resolve para `Diego Henrique 6357`,
**conversa 708**, caixa Auxílio Acidente, 10/08/2026, hoje `open` com
`contrato_em_elaboracao` e `atendimento_humanizado`.

Nessa conversa a IA **perguntou**:

```
14:32:35  IA   Você recebeu auxílio doença na época do acidente?
14:32:41  CLI  Nao
```

E fez o roteiro completo — 15 perguntas, incluindo profissão na época, como
aconteceu, sequela, CLT, documentos médicos.

**Três explicações possíveis, e a diferença entre elas importa:**

1. **O auditor olhou a ficha/resumo, não a conversa.** Se o resumo gerado disse
   "Não perguntado" quando a pergunta foi feita, o problema está no gerador de
   ficha, não na IA — e significa que a auditoria está medindo a ficha.
   **Esta é a hipótese mais provável e a mais séria**, porque contamina todas as
   outras conclusões da auditoria.
2. É outra conversa ou outro telefone (erro de anotação).
3. A pergunta foi feita mas a resposta não foi registrada no lugar certo.

**Primeira coisa a fazer:** perguntar a quem auditou o que exatamente ele olhou.

---

## 4. As causas raiz, agrupadas

Os seis achados viram **quatro** problemas de verdade:

### A. Falta a data atual no prompt → achado 3.1

Um erro, uma linha de correção, impacto alto. É o mais barato de todos e vale
fazer primeiro.

### B. Regra de desqualificação incompleta → achados 3.2 e 3.3

A IA descarta em *"não estava CLT na época do acidente"* sem checar o vínculo
nos 2 anos anteriores. Em ambos os casos o próprio cliente já tinha dado a
informação que salvaria o lead.

Isto não é bug de código, é **regra de negócio errada no prompt**. Precisa da
definição correta vinda do escritório antes de mexer.

### C. Sem agregação de mensagens (debounce) → agrava B

A IA responde em rajada, de 5 em 5 segundos, e processa cada mensagem de entrada
isoladamente. Cliente que escreve em pedaços — que é como se escreve no WhatsApp
— tem metade da frase ignorada. Foi exatamente o que dispensou a Hellen.

### D. Um produto só → achado 3.5

Sem roteamento para BPC. Casos graves de deficiência morrem na caixa errada.

E, separado dos quatro, o **achado 3.6**, que pode indicar que a própria
auditoria está olhando para a ficha em vez da conversa. Confirmar isso muda o
que fazer com o resto.

---

## 5. Observações soltas que apareceram na investigação

Não estavam na lista, mas apareceram e vale registrar:

- **Mensagem vazia da IA.** Nas conversas 673 e 680, a primeira resposta da IA é
  uma mensagem com conteúdo `""`. Aparece antes do "Olá! Tudo bem? Me chamo
  Karol". Pode ser áudio/mídia não transcrito, ou mensagem em branco de verdade.
- **Nomes inventados ou trocados.** "Alfredo" (673, contato `~✌️`),
  "Michellen" e depois "Hellen" na mesma conversa (701).
- **Repetição literal de blocos.** Ver 3.5 — as mesmas 4 mensagens duas vezes
  em 47 segundos.
- **Ritmo de disparo.** A IA manda mensagens de 4 a 6 segundos de intervalo, em
  blocos de 3 a 5. Combinado com a falta de debounce, é o que cria a corrida
  entre a resposta dela e a correção do cliente.
- **Perguntas duplicadas.** Na 673: *"em qual ano e mês aconteceu esse
  acidente?"* às 12:40:42 e *"Em qual ano e mês você quebrou o fêmur…"* às
  12:40:52 — a mesma pergunta duas vezes, com 10 segundos de diferença.

---

## 6. O que este documento NÃO cobre

- **O workflow do agente não foi lido.** A sessão do n8n estava expirada. Todas
  as hipóteses da seção 4 são deduzidas do comportamento observado no Chatwoot,
  não do prompt em si. **Confirmar antes de mexer.**
- **Não se sabe qual modelo de LLM é usado**, nem a temperatura, nem se há
  memória de conversa.
- **Não foi medida a frequência dos problemas.** Cada achado tem 1 a 4 casos
  conhecidos. Não se sabe se a data errada aconteceu 1 vez ou 200. Sem isso não
  dá para priorizar por impacto — só por gravidade.
- **Nada foi corrigido.**

---

## 7. Como medir a frequência (para não priorizar no chute)

A busca do Chatwoot funciona pela API e resolve boa parte:

```js
// no console do Chatwoot logado
const raw = decodeURIComponent(document.cookie.split('; ')
  .find(s => s.startsWith('cw_d_session_info=')).split('=').slice(1).join('='));
const s = JSON.parse(raw);
const H = { 'access-token': s['access-token'], client: s.client, uid: s.uid };

const busca = async q => {
  const r = await fetch('/api/v1/accounts/1/search?q=' + encodeURIComponent(q),
                        { headers: H });
  const j = await r.json();
  return (j.payload.messages || []).map(m => ({
    conv: m.conversation_id,
    quem: m.message_type === 1 ? 'IA' : 'CLI',
    em: new Date(m.created_at * 1000).toLocaleString('pt-BR'),
    txt: String(m.content || '').slice(0, 200),
  }));
};

await busca('#FIM');            // vazamento do token
await busca('estamos em 2024'); // data errada
await busca('não conseguimos dar continuidade'); // total de dispensas
```

Foi assim que os 4 casos de `#FIM` foram encontrados.

Para ler uma conversa inteira é preciso paginar para trás — o endpoint de
mensagens devolve só a última página:

```js
const todas = async id => {
  let all = [], before = null;
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`/api/v1/accounts/1/conversations/${id}/messages`
                          + (before ? `?before=${before}` : ''), { headers: H });
    const list = (await r.json()).payload || [];
    if (!list.length) break;
    all = [...list, ...all];
    before = list[0].id;
    if (list.length < 20) break;
  }
  return all;
};
```

---

## 8. Ordem sugerida

1. **Perguntar ao auditor o que ele olhou no caso 3.6.** Se a auditoria está
   lendo a ficha, isso muda a leitura dos outros cinco achados. É uma conversa,
   custa nada, e é pré-requisito do resto.
2. **Logar no n8n e achar o workflow do agente.** Sem isso, tudo aqui é
   hipótese.
3. **Corrigir a data no prompt** (causa A). Barato, isolado, impacto alto.
4. **Medir a frequência** de cada achado com as buscas da seção 7, antes de
   decidir o resto.
5. **Definir com o escritório a regra correta de desqualificação** (causa B) —
   isso é decisão jurídica, não técnica, e ninguém deveria escrevê-la sozinho.
6. **Debounce das mensagens** (causa C).
7. **Roteamento para BPC** (causa D) — o maior dos quatro, e o que mais precisa
   de decisão de processo antes de virar código.

---

## 9. Resumo de uma linha

> Seis queixas, cinco confirmadas com transcrição, e uma que não se confirma e
> por isso pode ser a mais importante — se a auditoria está lendo a ficha em vez
> da conversa, o resto das conclusões precisa ser revisto. As cinco confirmadas
> viram quatro causas: falta a data atual no prompt (barata, alta), regra de
> desqualificação sem o vínculo dos 2 anos (perdeu pelo menos 2 leads válidos),
> ausência de debounce nas mensagens de entrada, e um agente que só conhece
> auxílio-acidente enquanto casos de BPC morrem na caixa errada. Nada foi
> corrigido; o workflow do agente ainda não foi lido porque a sessão do n8n
> estava expirada.
