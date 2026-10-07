/**
 * Dashboard IA — geometria dos graficos em SVG.
 *
 * Funcoes puras. Os graficos sao SVG escrito a mao para o fork nao ganhar
 * dependencia nova (nada de chart.js aqui).
 */

/**
 * Caminho suave por uma lista de pontos [[x, y], ...].
 *
 * Curva monotona (Fritsch-Carlson): passa por todos os pontos e NAO cria
 * ondulacao entre eles. Uma spline comum "inventa" picos e vales que nao
 * existem no dado — num grafico de contagem isso mostraria valor negativo.
 */
export function smoothPath(points) {
  const n = points.length;
  if (!n) return '';
  if (n === 1) return `M${points[0][0]},${points[0][1]}`;

  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(points[i + 1][0] - points[i][0]);
    slope.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1));
  }
  const tan = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) {
    tan.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tan.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      tan[i] = 0;
      tan[i + 1] = 0;
    } else {
      const a = tan[i] / slope[i];
      const b = tan[i + 1] / slope[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        tan[i] = (3 / h) * a * slope[i];
        tan[i + 1] = (3 / h) * b * slope[i];
      }
    }
  }

  const f = v => v.toFixed(2);
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const t = dx[i] / 3;
    d += ` C${f(x0 + t)},${f(y0 + tan[i] * t)} ${f(x1 - t)},${f(y1 - tan[i + 1] * t)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

/** Fecha um caminho de linha ate a base, para preencher a area embaixo. */
export function areaPath(linePath, points, baseY) {
  if (!points.length) return '';
  const first = points[0][0].toFixed(2);
  const last = points[points.length - 1][0].toFixed(2);
  return `${linePath} L${last},${baseY} L${first},${baseY} Z`;
}

/** Arcos de uma rosca. `segments`: [{ value }]. Devolve dasharray/offset por fatia. */
export function donutArcs(segments, radius) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const len = 2 * Math.PI * radius;
  let acc = 0;
  return segments.map(s => {
    const part = total ? (s.value / total) * len : 0;
    // 1.5 de respiro entre fatias; fatia menor que o respiro some.
    const gap = part > 3 ? 1.5 : 0;
    const arc = {
      dash: `${Math.max(part - gap, 0)} ${len}`,
      offset: -acc,
      visible: part > 0,
    };
    acc += part;
    return arc;
  });
}

/** Uma cor com transparencia, a partir de qualquer cor CSS. */
export function tint(color, percent) {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/** Degrade de uma cor para uma versao mais escura dela (barras do funil). */
export function gradient(color) {
  return `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 72%, #000))`;
}
