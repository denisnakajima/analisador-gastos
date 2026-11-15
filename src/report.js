'use strict';

const { brl, pct, esc, diaMes, mesNome } = require('./format');
const { graficoCategorias, graficoDiario, graficoAcumulado, graficoHistorico } = require('./charts');

// Paleta categórica validada (ver skill dataviz). Slots 1-8 + "Outros" neutro.
const CLARO = {
  surface: '#fcfcfb', page: '#f9f9f7', pri: '#0b0b0b', sec: '#52514e', mut: '#898781',
  grid: '#e1e0d9', axis: '#c3c2b7', border: 'rgba(11,11,11,0.10)',
  cats: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
};
const ESCURO = {
  surface: '#1a1a19', page: '#0d0d0d', pri: '#f0efec', sec: '#c3c2b7', mut: '#898781',
  grid: '#2c2c2a', axis: '#383835', border: 'rgba(255,255,255,0.10)',
  cats: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

const vars = (p) =>
  [
    `color-scheme:${p === ESCURO ? 'dark' : 'light'}`,
    `--surface:${p.surface}`, `--page:${p.page}`, `--text-primary:${p.pri}`, `--text-secondary:${p.sec}`,
    `--text-muted:${p.mut}`, `--grid:${p.grid}`, `--axis:${p.axis}`, `--border:${p.border}`,
    ...p.cats.map((c, i) => `--cat-${i + 1}:${c}`),
    '--cat-outros:#898781', '--series-1:var(--cat-1)', '--series-2:var(--cat-2)',
  ].join(';');

const CSS = `
:root{${vars(CLARO)}}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){${vars(ESCURO)}}}
:root[data-theme="dark"]{${vars(ESCURO)}}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--text-primary);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:16px;margin:0 0 2px}
.sub{color:var(--text-secondary);margin:0 0 20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px}
.kpi .lbl{color:var(--text-secondary);font-size:13px}
.kpi .val{font-size:26px;font-weight:600;margin:2px 0}
.kpi .nota{color:var(--text-secondary);font-size:13px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:12px;margin-top:12px}
.full{grid-column:1/-1}
.card p.desc{margin:0 0 10px;color:var(--text-secondary);font-size:13px}
ul.insights{margin:0;padding-left:20px}ul.insights li{margin:4px 0}
svg{width:100%;height:auto;display:block;overflow:visible}
svg text{font:12px system-ui,-apple-system,"Segoe UI",sans-serif}
.t-pri{fill:var(--text-primary)}.t-sec{fill:var(--text-secondary)}.t-mut{fill:var(--text-muted)}
.halo{paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round}
.grid{stroke:var(--grid);stroke-width:1}
.axis{stroke:var(--axis);stroke-width:1}
.media{stroke:var(--text-secondary);stroke-width:1.5;stroke-dasharray:5 4}
.linha-atual{fill:none;stroke:var(--series-1);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.linha-ant{fill:none;stroke:var(--text-muted);stroke-width:2;stroke-dasharray:6 4;stroke-linejoin:round}
.ponto{fill:var(--series-1);stroke:var(--surface);stroke-width:2}
.xhair{stroke:var(--text-muted);stroke-width:1}
.xdot{fill:var(--series-1);stroke:var(--surface);stroke-width:2}
.legenda{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--text-secondary);margin:0 0 8px}
.legenda i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:baseline}
.legenda i.tracejado{height:0;width:16px;border-top:2px dashed var(--text-muted);border-radius:0;vertical-align:middle}
details{margin-top:12px}
summary{cursor:pointer;color:var(--text-secondary);font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--grid)}
th{color:var(--text-secondary);font-weight:600}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.tbl-scroll{max-height:420px;overflow:auto}
#tip{position:fixed;z-index:10;pointer-events:none;background:var(--surface);color:var(--text-primary);border:1px solid var(--axis);border-radius:8px;padding:8px 10px;font-size:12px;white-space:pre-line;box-shadow:0 4px 16px rgba(0,0,0,.18)}
#tip[hidden]{display:none}
footer{color:var(--text-muted);font-size:12px;margin-top:20px}
@media print{body{background:#fff}.card{break-inside:avoid}}
`;

const JS = `
(function(){
  var tip=document.getElementById('tip');
  function esconder(){tip.hidden=true;document.querySelectorAll('.xhair,.xdot').forEach(function(e){e.style.display='none'})}
  document.addEventListener('pointermove',function(e){
    var t=e.target.closest&&e.target.closest('[data-tip]');
    if(!t){esconder();return}
    tip.textContent=t.getAttribute('data-tip');tip.hidden=false;
    var x=e.clientX+14,y=e.clientY+14,w=tip.offsetWidth,h=tip.offsetHeight;
    if(x+w>innerWidth-8)x=e.clientX-w-14;if(y+h>innerHeight-8)y=e.clientY-h-14;
    tip.style.left=x+'px';tip.style.top=y+'px';
    var cx=t.getAttribute('data-cx');
    document.querySelectorAll('.xhair,.xdot').forEach(function(e2){e2.style.display='none'});
    if(cx){var svg=t.ownerSVGElement,xh=svg.querySelector('.xhair'),xd=svg.querySelector('.xdot');
      xh.setAttribute('x1',cx);xh.setAttribute('x2',cx);xh.style.display='';
      xd.setAttribute('cx',cx);xd.setAttribute('cy',t.getAttribute('data-cy'));xd.style.display=''}
  });
  document.addEventListener('pointerleave',esconder);
})();
`;

function kpi(rotulo, valor, nota = '') {
  return `<div class="card kpi"><div class="lbl">${rotulo}</div><div class="val">${valor}</div><div class="nota">${nota}</div></div>`;
}

function gerarHTML(r, config, meta = {}) {
  const cores = Object.fromEntries(config.categorias.map((c) => [c.nome, c.cor]));

  const varTexto = r.variacao === null ? '' : `${r.variacao >= 0 ? '▲' : '▼'} ${pct(Math.abs(r.variacao))} ${r.parcial ? 'vs mesmo período de' : 'vs'} ${esc(r.mesAnterior.nome)}`;
  const kpis = [
    kpi('Despesas', brl(r.totalDespesas), varTexto || `${r.qtdDespesas} lançamentos`),
    kpi('Receitas', brl(r.totalReceitas), `${r.qtdReceitas} entrada(s)`),
    kpi('Saldo', brl(r.saldo), r.taxaPoupanca === null ? '' : r.saldo >= 0 ? `${pct(r.taxaPoupanca)} da receita guardada` : 'Despesas acima da receita'),
    kpi('Média diária', brl(r.mediaDiaria), r.parcial ? `Projeção do mês: ${brl(r.projecao)}` : `${r.diasNoMes} dias`),
  ].join('\n');

  const legendaCat = ''; // as barras já são rotuladas diretamente
  const legendaAcum = `<div class="legenda"><span><i style="background:var(--series-1)"></i>${esc(mesNome(r.mes))}</span>${
    r.mesAnterior ? `<span><i class="tracejado"></i>${esc(r.mesAnterior.nome)}</span>` : ''
  }</div>`;
  const legendaHist = `<div class="legenda"><span><i style="background:var(--series-1)"></i>Receitas</span><span><i style="background:var(--series-2)"></i>Despesas</span></div>`;

  const tabelaCategorias = `<details><summary>Ver como tabela</summary><table>
<thead><tr><th>Categoria</th><th class="n">Total</th><th class="n">%</th><th class="n">Lanç.</th><th class="n">Mês anterior</th></tr></thead><tbody>
${r.porCategoria.map((c) => `<tr><td>${esc(c.nome)}</td><td class="n">${brl(c.total)}</td><td class="n">${pct(c.pct)}</td><td class="n">${c.qtd}</td><td class="n">${c.anterior === null ? '–' : brl(c.anterior)}</td></tr>`).join('\n')}
</tbody></table></details>`;

  const tabelaMaiores = `<table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="n">Valor</th></tr></thead><tbody>
${r.maioresDespesas.map((t) => `<tr><td>${diaMes(t.data)}</td><td>${esc(t.descricao)}</td><td>${esc(t.categoria)}</td><td class="n">${brl(Math.abs(t.valor))}</td></tr>`).join('\n')}
</tbody></table>`;

  const tabelaTodas = `<details><summary>Todos os lançamentos do mês (${r.transacoes.length})</summary><div class="tbl-scroll"><table>
<thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="n">Valor</th></tr></thead><tbody>
${r.transacoes.map((t) => `<tr><td>${diaMes(t.data)}</td><td>${esc(t.descricao)}</td><td>${esc(t.categoria)}</td><td class="n">${t.valor < 0 ? '−' : '+'}${brl(Math.abs(t.valor))}</td></tr>`).join('\n')}
</tbody></table></div></details>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Resumo de gastos — ${esc(r.mesLabel)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>Resumo de gastos · ${esc(r.mesLabel.charAt(0).toUpperCase() + r.mesLabel.slice(1))}</h1>
<p class="sub">${r.parcial ? `Mês em andamento: dados até o dia ${r.diasDecorridos} de ${r.diasNoMes}. ` : ''}${r.qtdDespesas} despesas e ${r.qtdReceitas} receitas analisadas${r.qtdIgnoradas ? `; ${r.qtdIgnoradas} lançamento(s) ignorado(s) (ex.: pagamento de fatura, para não contar em dobro)` : ''}.</p>

<section class="kpis">${kpis}</section>

<section class="card"><h2>O que chamou atenção</h2><ul class="insights">
${r.insights.map((i) => `<li>${i}</li>`).join('\n')}
</ul></section>

<section class="grid2">
  <div class="card full"><h2>Despesas por categoria</h2><p class="desc">Ordenadas do maior para o menor gasto.</p>${legendaCat}${graficoCategorias(r.porCategoria, cores)}${tabelaCategorias}</div>
  <div class="card"><h2>Gasto por dia</h2><p class="desc">Cada coluna é um dia; a linha tracejada é a média diária.</p>${graficoDiario(r.diario, r.mediaDiaria, r.diasDecorridos, r.mes)}</div>
  <div class="card"><h2>Gasto acumulado</h2><p class="desc">Quanto já saiu do bolso ao longo do mês${r.mesAnterior ? ', comparado ao mês anterior' : ''}.</p>${legendaAcum}${graficoAcumulado(r)}</div>
  <div class="card full"><h2>Receitas × despesas</h2><p class="desc">Últimos meses${r.parcial ? ' (* mês parcial)' : ''}.</p>${legendaHist}${graficoHistorico(r.historico)}</div>
  <div class="card full"><h2>Maiores despesas do mês</h2>${tabelaMaiores}${tabelaTodas}</div>
</section>

<footer>Gerado em ${esc(meta.geradoEm || new Date().toLocaleString('pt-BR'))}${meta.arquivo ? ` a partir de ${esc(meta.arquivo)}` : ''}. Categorias definidas em config/categorias.json.</footer>
</main>
<div id="tip" hidden></div>
<script>${JS}</script>
</body>
</html>`;
}

module.exports = { gerarHTML };
