#!/usr/bin/env node
/**
 * Verificacoes do fork Goncalves & Silva.
 *
 * Nao substitui a suite do upstream — cobre so o que ESTE fork quebra na
 * pratica, e roda em segundos em vez de uma hora:
 *
 *   1. JSON de traducao valido. Uma virgula sobrando em pt_BR derruba o
 *      dashboard inteiro em tela branca, e o build Docker passa sem reclamar.
 *   2. Chaves de pt_BR em dia com en. Chave faltando nao quebra, mas a
 *      interface volta a falar ingles no meio de uma tela em portugues.
 *   3. Os .vue do kanban compilam. O build Docker tambem pega isso, so que 20
 *      minutos depois; aqui sai em 2.
 *   4. As etiquetas de fechamento do quadro por estado existem nas colunas dos
 *      funis. Foi exatamente essa divergencia que deixou 14 conversas de BPC
 *      contadas como trabalho em andamento por meses (ver stateConstants.js).
 *
 * Uso: node .github/scripts/verificar-goncalves.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// O compilador de SFC e opcional de proposito. O package.json do Chatwoot tem
// conflito de peer deps, entao instalar qualquer coisa dentro do repositorio
// quebra com ERESOLVE — por isso o workflow instala numa pasta separada. Se
// mesmo assim ele nao estiver disponivel, a checagem 3 e PULADA com aviso em
// vez de derrubar a esteira: o build Docker tambem compila os .vue, so que
// mais tarde. Falha de infraestrutura nao deve barrar deploy; defeito deve.
let parseSFC = null;
try {
  ({ parse: parseSFC } = await import('@vue/compiler-sfc'));
} catch {
  parseSFC = null;
}

const LOCALE_DIR = 'app/javascript/dashboard/i18n/locale';
const KANBAN_DIR = 'app/javascript/dashboard/routes/dashboard/kanban';

const erros = [];
const avisos = [];

const listar = (dir, filtro) =>
  existsSync(dir) ? readdirSync(dir).filter(filtro) : [];

// --- 1. JSON de traducao valido (todos os idiomas, nao so pt_BR) ----------
const idiomas = existsSync(LOCALE_DIR) ? readdirSync(LOCALE_DIR) : [];
let jsonsLidos = 0;

for (const idioma of idiomas) {
  for (const arq of listar(join(LOCALE_DIR, idioma), f => f.endsWith('.json'))) {
    const caminho = join(LOCALE_DIR, idioma, arq);
    try {
      JSON.parse(readFileSync(caminho, 'utf8'));
      jsonsLidos += 1;
    } catch (e) {
      erros.push(`JSON invalido em ${caminho}: ${e.message}`);
    }
  }
}
console.log(`[1/4] ${jsonsLidos} arquivos de traducao lidos.`);

// --- 2. pt_BR nao pode ter menos chaves que en ---------------------------
const achatar = (obj, prefixo = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? achatar(v, `${prefixo}${k}.`)
      : [`${prefixo}${k}`]
  );

const ler = caminho => {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch {
    return null;
  }
};

let faltando = 0;
for (const arq of listar(join(LOCALE_DIR, 'en'), f => f.endsWith('.json'))) {
  const en = ler(join(LOCALE_DIR, 'en', arq));
  const pt = ler(join(LOCALE_DIR, 'pt_BR', arq));
  if (!en || !pt) continue;
  const chavesPt = new Set(achatar(pt));
  const ausentes = achatar(en).filter(c => !chavesPt.has(c));
  if (ausentes.length) {
    faltando += ausentes.length;
    avisos.push(
      `${ausentes.length} chave(s) sem traducao em pt_BR/${arq} — ex.: ${ausentes
        .slice(0, 3)
        .join(', ')}`
    );
  }
}
console.log(
  `[2/4] Comparacao en -> pt_BR: ${faltando} chave(s) sem traducao (aviso, nao bloqueia).`
);

// --- 3. Os .vue do kanban compilam --------------------------------------
const vues = listar(KANBAN_DIR, f => f.endsWith('.vue')).map(f =>
  join(KANBAN_DIR, f)
);
const componentes = join(KANBAN_DIR, 'components');
vues.push(
  ...listar(componentes, f => f.endsWith('.vue')).map(f => join(componentes, f))
);

if (!vues.length) {
  erros.push(
    `Nenhum .vue encontrado em ${KANBAN_DIR}. O kanban sumiu do build?`
  );
}

if (!parseSFC) {
  avisos.push(
    '@vue/compiler-sfc indisponivel — checagem 3 pulada. Os .vue nao foram ' +
      'compilados aqui; quem vai pegar erro de sintaxe e o build Docker.'
  );
  console.log('[3/4] PULADA (compilador ausente).');
} else {
  for (const caminho of vues) {
    const { errors } = parseSFC(readFileSync(caminho, 'utf8'), {
      filename: caminho,
    });
    for (const e of errors) erros.push(`${caminho}: ${e.message}`);
  }
  console.log(`[3/4] ${vues.length} componentes .vue do kanban compilados.`);
}

// --- 4. Etiquetas de fechamento presentes nos funis ----------------------
// Le por regex de proposito: importar os modulos exigiria resolver os imports
// do dashboard inteiro, e o que interessa aqui e so a lista literal.
const lerLista = (arquivo, constante) => {
  const caminho = join(KANBAN_DIR, arquivo);
  if (!existsSync(caminho)) return null;
  const src = readFileSync(caminho, 'utf8');
  const m = src.match(new RegExp(`${constante}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null;
};

const fechamento = lerLista('stateConstants.js', 'CLOSED_LABELS');
if (!fechamento) {
  avisos.push('CLOSED_LABELS nao encontrada em stateConstants.js — pulei a 4.');
} else {
  const constantes = existsSync(join(KANBAN_DIR, 'constants.js'))
    ? readFileSync(join(KANBAN_DIR, 'constants.js'), 'utf8')
    : '';
  const orfas = fechamento.filter(l => !constantes.includes(`'${l}'`));
  if (orfas.length) {
    erros.push(
      `Etiquetas em CLOSED_LABELS que nenhuma coluna de funil declara: ${orfas.join(
        ', '
      )}. ` +
        `Conversas com elas ficam invisiveis nos quadros — foi esse o bug do BPC.`
    );
  }
  console.log(
    `[4/4] ${fechamento.length} etiquetas de fechamento conferidas contra as colunas.`
  );
}

// --- resultado -----------------------------------------------------------
console.log('');
for (const a of avisos) console.log(`AVISO  ${a}`);
for (const e of erros) console.log(`ERRO   ${e}`);

if (erros.length) {
  console.log(`\n${erros.length} erro(s). A imagem NAO vai ser publicada.`);
  process.exit(1);
}
console.log('\nTudo certo. Pode buildar.');
