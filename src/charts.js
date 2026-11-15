'use strict';
// Gráficos em SVG puro. Cores vêm de variáveis CSS (ver report.js), então
// modo claro/escuro funcionam sem recalcular nada.

const { brl, pct, esc, mesNome, mesLabel, diaMes } = require('./format');


/** Passo "bonito" (1, 2 ou 5 × 10^k) para até `n` divisões. */
function escalaY(max, n = 4) {
  if (max <= 0) return { topo: 1, passo: 1, ticks: [0, 1] };
  const bruto = max / n;
  const exp = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 5, 10].map((f) => f * exp).find((p) => p >= bruto);
  const topo = Math.ceil(max / passo) * passo;
  const ticks = [];
  for (let v = 0; v <= topo + 1e-9; v += passo) ticks.push(v);
  return { topo, passo, ticks };
}

const eixoY = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(v)));

/** Barra horizontal com a ponta direita arredondada (base reta). */
function barraH(x, y, w, h, r = 4) {
  if (w <= r * 2) return `M${x},${y}h${w}v${h}h${-w}z`;
  return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
}

/** Barra vertical com o topo arredondado (base reta). */
function barraV(x, y, w, h, r = 3) {
  r = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h}v${-(h - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z`;
}

const corCategoria = (cat, cores) => (cores[cat] ? `var(--cat-${cores[cat]})` : 'var(--cat-outros)');

/* 1 ───────── Despesas por categoria (barras horizontais ordenadas) */
function graficoCategorias(porCategoria, cores, W = 900) {
  const linhaH = 34, padY = 8, rotuloW = 112, valorW = 150;
  const x0 = rotuloW + 10;
  const areaW = W - x0 - valorW;
  const H = porCategoria.length * linhaH + padY * 2;
  const max = porCategoria[0]?.total || 1;

  const linhas = porCategoria
    .map((c, i) => {
      const y = padY + i * linhaH;
      const w = Math.max(3, (c.total / max) * areaW);
      const tip = [c.nome, brl(c.total), `${pct(c.pct)} das despesas · ${c.qtd} lançamento(s)`];
      if (c.anterior !== null) tip.push(`Mês anterior: ${brl(c.anterior)}`);
      return `<g>
  <text x="${rotuloW}" y="${y + 20}" text-anchor="end" class="t-sec">${esc(c.nome)}</text>
  <path d="${barraH(x0, y + 6, w, 22)}" fill="${corCategoria(c.nome, cores)}"/>
  <text x="${x0 + w + 8}" y="${y + 21}" class="t-pri">${brl(c.total)} <tspan class="t-mut">· ${pct(c.pct, 0)}</tspan></text>
  <rect x="0" y="${y}" width="${W}" height="${linhaH}" fill="transparent" data-tip="${esc(tip.join('\n'))}"/>
</g>`;
    })
    .join('\n');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Despesas por categoria">
<line x1="${x0}" x2="${x0}" y1="${padY}" y2="${H - padY}" class="axis"/>
${linhas}
</svg>`;
}

/* 2 ───────── Gasto por dia (colunas) + linha da média */
function graficoDiario(diario, mediaDiaria, diasDecorridos, mes, W = 440) {
  const padL = 48, padR = 12, padT = 14, padB = 26, plotH = 180;
  const plotW = W - padL - padR;
  const H = plotH + padT + padB;
  const dim = diario.length;
  const max = Math.max(...diario.map((d) => d.total), mediaDiaria);
  const esc_ = escalaY(max);
  const y = (v) => padT + plotH - (v / esc_.topo) * plotH;
  const slot = plotW / dim;
  const bw = Math.max(3, slot * 0.64);

  const grade = esc_.ticks
    .map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" class="t-mut">${eixoY(v)}</text>`)
    .join('\n');
  const rotulosX = diario
    .filter((d) => d.dia === 1 || d.dia % 5 === 0)
    .map((d) => `<text x="${padL + (d.dia - 1) * slot + slot / 2}" y="${H - 8}" text-anchor="middle" class="t-mut">${d.dia}</text>`)
    .join('\n');
  const barras = diario
    .map((d, i) => {
      if (d.dia > diasDecorridos) return '';
      const x = padL + i * slot + (slot - bw) / 2;
      const h = (d.total / esc_.topo) * plotH;
      const tip = `${diaMes(d.data)}\n${d.total ? brl(d.total) : 'Sem gastos'}${d.qtd ? `\n${d.qtd} lançamento(s)` : ''}`;
      return `<path d="${barraV(x, y(d.total), bw, h)}" fill="var(--series-1)"/>
<rect x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}" fill="transparent" data-tip="${esc(tip)}"/>`;
    })
    .join('\n');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto diário em ${esc(mes)}">
${grade}
<line x1="${padL}" x2="${W - padR}" y1="${padT + plotH}" y2="${padT + plotH}" class="axis"/>
${barras}
<line x1="${padL}" x2="${W - padR}" y1="${y(mediaDiaria)}" y2="${y(mediaDiaria)}" class="media"/>
<text x="${W - padR}" y="${y(mediaDiaria) - 6}" text-anchor="end" class="t-sec halo">média ${brl(mediaDiaria)}/dia</text>
${rotulosX}
</svg>`;
}

/* 3 ───────── Gasto acumulado: mês atual × mês anterior (mesma escala) */
function graficoAcumulado(resumo, W = 440) {
  const { diario, anteriorDiario, diasDecorridos, mesAnterior, mes } = resumo;
  const padL = 48, padR = 16, padT = 14, padB = 26, plotH = 190;
  const plotW = W - padL - padR;
  const H = plotH + padT + padB;
  const nDias = Math.max(diario.length, anteriorDiario?.length || 0);
  const atual = diario.filter((d) => d.dia <= diasDecorridos);
  const fimAtual = atual[atual.length - 1].acum;
  const fimAnt = anteriorDiario ? anteriorDiario[anteriorDiario.length - 1].acum : 0;
  const esc_ = escalaY(Math.max(fimAtual, fimAnt));
  const x = (dia) => padL + ((dia - 1) / (nDias - 1)) * plotW;
  const y = (v) => padT + plotH - (v / esc_.topo) * plotH;
  const caminho = (serie) => serie.map((d, i) => `${i ? 'L' : 'M'}${x(d.dia).toFixed(1)},${y(d.acum).toFixed(1)}`).join(' ');

  const nomeAtual = mesNome(mes);
  const nomeAnt = mesAnterior ? mesAnterior.nome : '';
  const grade = esc_.ticks
    .map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" class="t-mut">${eixoY(v)}</text>`)
    .join('\n');
  const rotulosX = Array.from({ length: nDias }, (_, i) => i + 1)
    .filter((d) => d === 1 || d % 5 === 0)
    .map((d) => `<text x="${x(d)}" y="${H - 8}" text-anchor="middle" class="t-mut">${d}</text>`)
    .join('\n');

  // rótulos diretos nas pontas; o de cima fica acima do ponto, o de baixo abaixo
  const atualMaior = fimAtual >= fimAnt;
  const linhaAnt = anteriorDiario
    ? `<path d="${caminho(anteriorDiario)}" class="linha-ant"/>
<text x="${x(anteriorDiario.length) - 4}" y="${y(fimAnt) + (atualMaior ? 17 : -9)}" text-anchor="end" class="t-sec halo">${esc(nomeAnt)} · ${brl(fimAnt)}</text>`
    : '';
  const linhaAtual = `<path d="${caminho(atual)}" class="linha-atual"/>
<circle cx="${x(diasDecorridos)}" cy="${y(fimAtual)}" r="4.5" class="ponto"/>
<text x="${x(diasDecorridos) - 8}" y="${y(fimAtual) + (atualMaior ? -10 : 18)}" text-anchor="end" class="t-pri halo">${esc(nomeAtual)} · ${brl(fimAtual)}</text>`;

  const hits = Array.from({ length: nDias }, (_, i) => {
    const dia = i + 1;
    const a = diario[i]?.acum ?? null;
    const p = anteriorDiario?.[i]?.acum ?? null;
    if (a === null && p === null) return '';
    const tip = [`Dia ${dia}`];
    if (a !== null) tip.push(`${nomeAtual}: ${brl(a)}`);
    if (p !== null) tip.push(`${nomeAnt}: ${brl(p)}`);
    const slot = plotW / (nDias - 1);
    return `<rect x="${x(dia) - slot / 2}" y="${padT}" width="${slot}" height="${plotH}" fill="transparent" data-tip="${esc(tip.join('\n'))}" data-cx="${x(dia).toFixed(1)}" data-cy="${(a !== null ? y(a) : y(p)).toFixed(1)}"/>`;
  }).join('\n');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto acumulado no mês">
${grade}
<line x1="${padL}" x2="${W - padR}" y1="${padT + plotH}" y2="${padT + plotH}" class="axis"/>
${linhaAnt}
${linhaAtual}
${rotulosX}
<line class="xhair" y1="${padT}" y2="${padT + plotH}" style="display:none"/>
<circle class="xdot" r="4.5" style="display:none"/>
${hits}
</svg>`;
}

/* 4 ───────── Receitas × despesas, últimos meses */
function graficoHistorico(historico, W = 900) {
  const padL = 48, padR = 12, padT = 14, padB = 30, plotH = 190;
  const plotW = W - padL - padR;
  const H = plotH + padT + padB;
  const n = historico.length;
  const max = Math.max(...historico.flatMap((h) => [h.receitas, h.despesas]), 1);
  const esc_ = escalaY(max);
  const y = (v) => padT + plotH - (v / esc_.topo) * plotH;
  const grupoW = plotW / n;
  const bw = Math.min(34, grupoW * 0.3);

  const grade = esc_.ticks
    .map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" class="t-mut">${eixoY(v)}</text>`)
    .join('\n');

  const grupos = historico
    .map((h, i) => {
      const cx = padL + i * grupoW + grupoW / 2;
      const xr = cx - bw - 1; // 2px de respiro entre as colunas
      const xd = cx + 1;
      const tip = [`${mesLabel(h.mes)}${h.parcial ? ' (parcial)' : ''}`, `Receitas: ${brl(h.receitas)}`, `Despesas: ${brl(h.despesas)}`, `Saldo: ${brl(h.saldo)}`];
      return `<path d="${barraV(xr, y(h.receitas), bw, (h.receitas / esc_.topo) * plotH)}" fill="var(--series-1)"/>
<path d="${barraV(xd, y(h.despesas), bw, (h.despesas / esc_.topo) * plotH)}" fill="var(--series-2)"/>
<text x="${cx}" y="${H - 10}" text-anchor="middle" class="t-sec">${esc(h.label)}${h.parcial ? '*' : ''}</text>
<rect x="${padL + i * grupoW}" y="${padT}" width="${grupoW}" height="${plotH}" fill="transparent" data-tip="${esc(tip.join('\n'))}"/>`;
    })
    .join('\n');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas por mês">
${grade}
<line x1="${padL}" x2="${W - padR}" y1="${padT + plotH}" y2="${padT + plotH}" class="axis"/>
${grupos}
</svg>`;
}

module.exports = { graficoCategorias, graficoDiario, graficoAcumulado, graficoHistorico, escalaY };
