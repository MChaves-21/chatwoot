/**
 * Kanban Comercial — exportacao para Excel.
 *
 * Mantem o formato de colunas do arquivo original (aba "Cartoes" + aba
 * "Panorama"), para nao quebrar quem ja consome essas planilhas.
 *
 * O SheetJS continua sendo baixado sob demanda do cdnjs, igual a versao
 * anterior. Se preferir nao depender de CDN externo, adicione "xlsx" ao
 * package.json do fork e troque loadSheetJS() por:
 *     const XLSX = await import('xlsx');
 */

import { STAGE_EMOJI, UNSTAGED_LABEL } from './constants';
import {
  convAssignee,
  convCreatedRaw,
  convDisplayName,
  convLabels,
  convPhone,
  convStageLabel,
  fmtBR,
  fmtPhoneBR,
  isoSP,
  situacaoBR,
} from './helpers';

const CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

function loadSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) {
      resolve(window.XLSX);
      return;
    }
    const sc = document.createElement('script');
    sc.src = CDN_URL;
    sc.onload = () =>
      window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX nao carregou'));
    sc.onerror = () => reject(new Error('Falha ao baixar a biblioteca XLSX'));
    document.head.appendChild(sc);
  });
}

const HEAD = [
  'Código',
  'Data criação',
  'Fase',
  'Título',
  'Descrição',
  'Data de validade',
  'Responsável',
  'Etiquetas',
  'Contato-1',
  'ContatoTelefone-1',
  'Contato-2',
  'ContatoTelefone-2',
  'Contato-3',
  'ContatoTelefone-3',
  'Valor atribuído',
  'Situação',
];

/**
 * @param {Array}  conversations lista ja filtrada — a funcao nao filtra nada
 * @param {String} prefix        prefixo do nome do arquivo
 * @param {Array}  columns       definicao das colunas/etapas
 * @param {Array}  tags          definicao das tags
 * @param {String} stampOverride data YYYY-MM-DD para o nome; padrao e hoje
 */
export async function exportToExcel({
  conversations,
  prefix,
  columns,
  tags,
  stampOverride,
}) {
  const XLSX = await loadSheetJS();
  const stageLabels = columns.map(c => c.label);
  const stageTitle = label =>
    (columns.find(c => c.label === label) || {}).title || '';

  /**
   * A coluna "Sem etapa" do funil BPC nao corresponde a etiqueta nenhuma, entao
   * convStageLabel devolve vazio para os cartoes dela. Sem esta normalizacao os
   * cartoes sairiam com a fase em branco e o Panorama mostraria a coluna zerada
   * ao lado de um "(sem fase)" com o mesmo conteudo — dois nomes para a mesma
   * pilha, na mesma planilha.
   */
  const hasUnstaged = stageLabels.includes(UNSTAGED_LABEL);
  const stageOf = cv =>
    convStageLabel(cv, stageLabels) || (hasUnstaged ? UNSTAGED_LABEL : '');
  const tagTitle = label => (tags.find(t => t.label === label) || {}).title || label;

  const rows = [HEAD];
  conversations.forEach((conv, idx) => {
    const stLbl = stageOf(conv);
    const nome = convDisplayName(conv);
    const telF = fmtPhoneBR(convPhone(conv));
    const etq = convLabels(conv)
      .filter(l => !stageLabels.includes(l) && l !== 'manual')
      .map(tagTitle)
      .join(', ');
    const created = convCreatedRaw(conv);
    const fase = `${stLbl && STAGE_EMOJI[stLbl] ? `${STAGE_EMOJI[stLbl]} ` : ''}${
      stLbl ? stageTitle(stLbl) : ''
    }`;

    rows.push([
      `CC-${idx + 1}`,
      fmtBR(created),
      fase,
      `👤${nome}${telF ? ` | 📞 ${telF}` : ''}`,
      `CHAT CRIADO: ${isoSP(created)}`,
      '',
      convAssignee(conv),
      etq,
      nome,
      telF,
      '',
      '',
      '',
      '',
      '',
      situacaoBR(conv.status),
    ]);
  });

  // Aba Panorama — contagens da lista exportada, nao do quadro inteiro.
  const pano = [
    ['Panorama'],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    ['Total de cartões', conversations.length],
    [],
    ['Fase', 'Conversas'],
  ];
  const byStage = {};
  conversations.forEach(cv => {
    const l = stageOf(cv) || '(sem fase)';
    byStage[l] = (byStage[l] || 0) + 1;
  });
  columns.forEach(c => pano.push([c.title, byStage[c.label] || 0]));
  if (byStage['(sem fase)']) pano.push(['(sem fase)', byStage['(sem fase)']]);

  pano.push([]);
  pano.push(['Tag', 'Contatos']);
  const tc = {};
  tags.forEach(t => {
    tc[t.label] = 0;
  });
  conversations.forEach(cv => {
    convLabels(cv).forEach(l => {
      if (tc[l] !== undefined) tc[l] += 1;
    });
  });
  tags.forEach(t => pano.push([t.title, tc[t.label] || 0]));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Cartões');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pano), 'Panorama');

  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp =
    stampOverride || `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  XLSX.writeFile(wb, `${prefix}-${stamp}.xlsx`);
}
