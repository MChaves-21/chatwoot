# Prompt para investigar a auditoria da IA

Copie o bloco abaixo inteiro e cole como primeira mensagem.

---

Quero investigar problemas de comportamento da IA de atendimento da Gonçalves &
Silva. Antes de qualquer coisa, leia este arquivo — ele é auto-suficiente e tem
as transcrições, os horários e os números:

`C:\Users\assis\Documents\GitHub\chatwoot\app\javascript\dashboard\routes\dashboard\kanban\CONTEXTO-auditoria-ia.md`

**Contexto rápido, para você saber onde pisa:**

- A IA se chama "Karol" e atende no WhatsApp pelas caixas 6 (Auxílio Acidente) e
  9 (BPC) do Chatwoot em `https://chatwoot.goncalvesesilva.cloud`, account_id 1.
- **A IA não está no Chatwoot.** As caixas são `Channel::Api`; o tráfego passa
  por Evolution API + n8n. Toda a lógica de atendimento e qualificação vive no
  **n8n** (`https://n8n.goncalvesesilva.cloud`, 61 workflows). Corrigir qualquer
  coisa deste documento é mexer no n8n, não no fork do Chatwoot.
- Em 11/08/2026 a sessão do n8n estava expirada — vou logar de novo. **O
  workflow do agente ainda não foi identificado**; achar ele é a primeira tarefa
  técnica.
- Dá para consultar a API do Chatwoot pelo navegador com a minha sessão logada.
  Foi assim que as transcrições do contexto foram levantadas, e o documento tem
  os trechos de código prontos na seção 7.

**O que já está apurado** (não refazer): as 6 queixas foram investigadas uma a
uma. Cinco se confirmam com transcrição; a sexta não se confirma, e é
justamente a que mais me preocupa. Os detalhes estão nas seções 3 e 4 do
contexto.

**O que eu quero desta rodada**, na ordem da seção 8:

1. Me ajudar a formular o que perguntar para quem fez a auditoria sobre o caso
   3.6 — se ele leu a ficha ou a conversa. Isso muda a leitura do resto.
2. Depois que eu logar no n8n, achar o workflow do agente e ler o system prompt.
3. Confirmar ou derrubar as quatro hipóteses da seção 4 contra o prompt real,
   em vez de assumir que estão certas.
4. Medir a frequência de cada problema com as buscas da seção 7, para a gente
   priorizar por impacto e não por gravidade percebida.

**Como eu gosto de trabalhar:**

- Verifique as coisas contra a base real em vez de assumir. Foi assim que
  descobrimos que a queixa do auxílio-doença não se sustentava.
- Me diga quando algo que eu pedi não vai funcionar na prática, e por quê, com
  número na mão. Isso já evitou entregas inúteis mais de uma vez.
- **Não altere workflow do n8n sem me confirmar antes.** O atendimento está no
  ar e um workflow quebrado é pior que um workflow errado.
- Se for mexer em prompt, me mostre o antes e o depois, e o raciocínio da
  mudança — não só o texto novo.
- Comentários e documentação em português, explicando **por que**, no estilo dos
  arquivos que já existem.

**O que eu ainda preciso decidir, e não espero que você decida por mim:**

- A regra correta de desqualificação (o vínculo nos 2 anos anteriores) é decisão
  jurídica do escritório. Me ajude a formular a pergunta certa para o advogado.
- Se o escritório quer que a IA atenda BPC também, ou se prefere um roteamento
  que passe o caso para uma pessoa.

---

## Observações que ainda quero passar

> Anote aqui, antes de colar, o que mais você lembrar sobre o comportamento da
> IA — a seção 5 do contexto tem os achados soltos que já apareceram, e a
> seção 6 lista o que ficou de fora.

-
-
-

---

## Referência rápida das conversas citadas

| Caso | Conversa | Contato | Telefone |
|---|---|---|---|
| Data errada (2024) | 673 | `~✌️` | +5583998638986 |
| Dispensou com vínculo | 701 | `~Hellen` | +5527992363730 |
| Parou de responder | 667 | `~marcelo` | +5521988491062 |
| `#FIM` vazando | 668, 479, 396, 272 | vários | — |
| BPC na caixa errada | 680 | `~Neiliane Silva` | +5577988640559 |
| Auxílio-doença (não confirmado) | 708 | `Diego Henrique 6357` | +5535997666357 |

Abrir uma conversa:
`https://chatwoot.goncalvesesilva.cloud/app/accounts/1/conversations/<id>`
