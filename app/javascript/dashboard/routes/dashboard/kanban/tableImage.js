/**
 * Desenha a tabela como imagem PNG.
 *
 * Existe por um motivo concreto: hoje a equipe tira FOTO DA TELA com o celular
 * duas vezes por dia (12h e 17h30) e manda no grupo. Foto de tela sai torta,
 * com reflexo e ilegivel no escuro. Aqui o mesmo dado sai como PNG limpo,
 * direto para a area de transferencia — cola no WhatsApp com Ctrl+V.
 *
 * Canvas puro, sem html2canvas nem dependencia nova: este e um fork do
 * Chatwoot e cada pacote a mais e mais uma coisa para dar conflito no merge
 * com o upstream.
 *
 * Decisoes visuais, todas com o mesmo alvo — ser lido de relance, no celular,
 * numa conversa de grupo cheia de outras mensagens:
 *
 *   - fundo claro sempre, mesmo com o Chatwoot no modo escuro. A imagem vai
 *     para o WhatsApp, nao para a tela;
 *   - cada coluna carrega a cor da coluna correspondente no quadro, para quem
 *     ve a foto reconhecer o que esta olhando;
 *   - zebrado leve em vez de linhas fortes: grade pesada suja a leitura quando
 *     a imagem e recomprimida;
 *   - zeros em cinza claro. Numa tabela lida de relance, zero escuro compete
 *     com o numero que importa;
 *   - a coluna "Aberto" e a linha "Sem resposta hoje" ganham destaque: sao as
 *     unicas que pedem acao.
 */

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const C = {
  page: '#eef2f7',
  card: '#ffffff',
  cardEdge: '#e2e8f0',
  title: '#0f172a',
  subtitle: '#64748b',
  blockTitle: '#1e293b',
  headText: '#64748b',
  headBg: '#f8fafc',
  text: '#0f172a',
  muted: '#94a3b8',
  line: '#eef2f6',
  zebra: '#fbfcfe',
  totalBg: '#0f172a',
  totalText: '#ffffff',
  zero: '#cbd5e1',
  accentBg: '#eff6ff',
  alertBg: '#fef2f2',
  alertText: '#b91c1c',
  brand: '#1f6feb',
};

const PAGE_PAD = 26;
const CARD_PAD = 26;
const ROW_H = 36;
const HEAD_H = 34;
// 290 e nao 250: "Gonçalves & Silva Advogados Associados" cortou nos dois
// testes com dados reais, e nome cortado numa foto mandada ao grupo vira
// duvida de quem le. Acima disso o fitText corta com reticencias, em vez de
// deixar o texto vazar por cima dos numeros.
const NAME_W = 290;
const COL_W = 96;
const BLOCK_GAP = 30;
const TITLE_H = 62;

/** Linha que representa "ninguem respondeu" — ganha destaque. */
const ALERT_ROWS = ['Sem resposta hoje'];

function blockWidth(columns) {
  return NAME_W + (columns.length + 1) * COL_W;
}

function blockHeight(rows) {
  return 24 + HEAD_H + (rows.length + 1) * ROW_H;
}

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  // Chrome < 99. Nao vale uma dependencia; um retangulo reto resolve.
  ctx.beginPath();
  ctx.rect(x, y, w, h);
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}...`).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}...`;
}

function drawBlock(ctx, block, x, y) {
  const { columns, rows, total } = block;
  const w = blockWidth(columns);

  // ---- titulo do bloco
  ctx.fillStyle = C.blockTitle;
  ctx.font = `700 14px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(block.title, x, y + 8);

  const top = y + 24;
  const bodyH = HEAD_H + (rows.length + 1) * ROW_H;

  // ---- fundo arredondado do bloco inteiro
  ctx.save();
  roundRect(ctx, x, top, w, bodyH, 12);
  ctx.clip();

  ctx.fillStyle = C.card;
  ctx.fillRect(x, top, w, bodyH);

  // faixas verticais das colunas destacadas
  columns.forEach((col, i) => {
    if (!col.accent) return;
    ctx.fillStyle = C.accentBg;
    ctx.fillRect(x + NAME_W + i * COL_W, top, COL_W, bodyH);
  });

  // ---- cabecalho
  ctx.fillStyle = C.headBg;
  ctx.fillRect(x, top, w, HEAD_H);

  ctx.font = `600 10.5px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.6px';
  ctx.fillStyle = C.headText;
  ctx.textAlign = 'left';
  ctx.fillText('AGENTE', x + 16, top + HEAD_H / 2);

  ctx.textAlign = 'center';
  columns.forEach((col, i) => {
    const cx = x + NAME_W + i * COL_W + COL_W / 2;
    // bolinha da cor da coluna no quadro
    if (col.color) {
      ctx.fillStyle = col.color;
      ctx.beginPath();
      ctx.arc(cx - ctx.measureText(col.title.toUpperCase()).width / 2 - 7,
        top + HEAD_H / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = C.headText;
    ctx.fillText(col.title.toUpperCase(), cx, top + HEAD_H / 2);
  });
  ctx.fillStyle = C.headText;
  ctx.fillText('TOTAL', x + NAME_W + columns.length * COL_W + COL_W / 2, top + HEAD_H / 2);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  // ---- linhas
  rows.forEach((row, r) => {
    const ry = top + HEAD_H + r * ROW_H;
    const isAlert = ALERT_ROWS.includes(row.name);

    if (isAlert) {
      ctx.fillStyle = C.alertBg;
      ctx.fillRect(x, ry, w, ROW_H);
    } else if (r % 2 === 1) {
      ctx.fillStyle = C.zebra;
      ctx.fillRect(x, ry, w, ROW_H);
    }

    if (r > 0) {
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 14, ry + 0.5);
      ctx.lineTo(x + w - 14, ry + 0.5);
      ctx.stroke();
    }

    ctx.font = `${isAlert ? 600 : 400} 13px ${FONT}`;
    ctx.fillStyle = isAlert ? C.alertText : C.text;
    ctx.textAlign = 'left';
    ctx.fillText(fitText(ctx, row.name, NAME_W - 30), x + 16, ry + ROW_H / 2);

    ctx.textAlign = 'center';
    columns.forEach((col, i) => {
      const v = row.counts[col.key] || 0;
      ctx.font = `${v && col.accent ? 700 : 400} 13.5px ${FONT}`;
      ctx.fillStyle = v === 0 ? C.zero : isAlert ? C.alertText : C.text;
      ctx.fillText(String(v), x + NAME_W + i * COL_W + COL_W / 2, ry + ROW_H / 2);
    });

    ctx.font = `700 13.5px ${FONT}`;
    ctx.fillStyle = isAlert ? C.alertText : C.text;
    ctx.fillText(
      String(row.total),
      x + NAME_W + columns.length * COL_W + COL_W / 2,
      ry + ROW_H / 2
    );
  });

  // ---- TOTAL, em faixa escura
  const ty = top + HEAD_H + rows.length * ROW_H;
  ctx.fillStyle = C.totalBg;
  ctx.fillRect(x, ty, w, ROW_H);

  ctx.font = `700 11px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.8px';
  ctx.fillStyle = C.totalText;
  ctx.textAlign = 'left';
  ctx.fillText('TOTAL', x + 16, ty + ROW_H / 2);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  ctx.textAlign = 'center';
  ctx.font = `700 14px ${FONT}`;
  columns.forEach((col, i) => {
    ctx.fillStyle = C.totalText;
    ctx.fillText(
      String(total.counts[col.key] || 0),
      x + NAME_W + i * COL_W + COL_W / 2,
      ty + ROW_H / 2
    );
  });
  ctx.fillText(
    String(total.total),
    x + NAME_W + columns.length * COL_W + COL_W / 2,
    ty + ROW_H / 2
  );

  ctx.restore();

  // moldura por cima do clip
  ctx.strokeStyle = C.cardEdge;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, top + 0.5, w - 1, bodyH - 1, 12);
  ctx.stroke();

  return top + bodyH;
}

/**
 * Monta o canvas. `blocks` e uma lista de
 * { title, columns: [{key,title,color,accent}], rows, total, note }.
 */
export function renderTables({ title, subtitle, blocks, footer }) {
  const inner = Math.max(...blocks.map(b => blockWidth(b.columns)), 460);
  const width = inner + (CARD_PAD + PAGE_PAD) * 2;

  const notesH = blocks.reduce((h, b) => h + (b.note ? 18 : 0), 0);
  const cardH =
    CARD_PAD * 2 +
    TITLE_H +
    blocks.reduce((h, b) => h + blockHeight(b.rows) + BLOCK_GAP, 0) -
    BLOCK_GAP +
    notesH +
    (footer ? 30 : 0);
  const height = cardH + PAGE_PAD * 2;

  const canvas = document.createElement('canvas');
  // devicePixelRatio minimo 2: sem isso a imagem sai borrada em tela retina e
  // ilegivel depois que o WhatsApp recomprime.
  const dpr = Math.max(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'middle';

  // fundo da "pagina"
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, width, height);

  // cartao branco com sombra suave
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = C.card;
  roundRect(ctx, PAGE_PAD, PAGE_PAD, width - PAGE_PAD * 2, cardH, 18);
  ctx.fill();
  ctx.restore();

  const x = PAGE_PAD + CARD_PAD;
  let y = PAGE_PAD + CARD_PAD;

  // barra de destaque + titulo
  ctx.fillStyle = C.brand;
  roundRect(ctx, x, y + 2, 4, 26, 2);
  ctx.fill();

  ctx.fillStyle = C.title;
  ctx.font = `700 20px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(title, x + 14, y + 14);

  if (subtitle) {
    ctx.fillStyle = C.subtitle;
    ctx.font = `400 12px ${FONT}`;
    ctx.fillText(subtitle, x + 14, y + 36);
  }

  y += TITLE_H;

  blocks.forEach(b => {
    y = drawBlock(ctx, b, x, y);
    if (b.note) {
      ctx.fillStyle = C.muted;
      ctx.font = `400 11px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(b.note, x, y + 12);
      y += 18;
    }
    y += BLOCK_GAP;
  });

  if (footer) {
    ctx.fillStyle = C.muted;
    ctx.font = `400 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(footer, x, y - BLOCK_GAP + 14);
  }

  return canvas;
}

function toBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Copia para a area de transferencia.
 *
 * Precisa ser chamada DENTRO do clique do usuario — a Clipboard API exige
 * gesto e contexto seguro (https). Se falhar, quem chama deve cair para o
 * download.
 */
export async function copyImage(canvas) {
  const blob = await toBlob(canvas);
  if (!blob) throw new Error('Falha ao gerar a imagem');
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error('Navegador nao suporta copiar imagem');
  }
  await navigator.clipboard.write([
    new window.ClipboardItem({ 'image/png': blob }),
  ]);
}

export async function downloadImage(canvas, filename) {
  const blob = await toBlob(canvas);
  if (!blob) throw new Error('Falha ao gerar a imagem');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Sem revoke o blob fica na memoria ate a aba fechar. O timeout da tempo do
  // download comecar antes de a URL morrer.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
