#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { carregarTransacoes } = require('./parser');
const { carregarConfig, categorizar } = require('./categorizer');
const { analisar } = require('./analysis');
const { gerarHTML } = require('./report');
const { brl, pct } = require('./format');

const AJUDA = `Uso: node src/cli.js <extrato.csv> [opções]

  --mes AAAA-MM      mês a analisar (padrão: último mês do arquivo)
  --saida <arquivo>  HTML de saída (padrão: saida/relatorio-AAAA-MM.html)
  --config <arquivo> categorias personalizadas (padrão: config/categorias.json)
  --json             grava também o resumo em JSON ao lado do HTML
  --help             mostra esta ajuda

CSV esperado: data;descricao;valor  (colunas opcionais: tipo, categoria)
Valores negativos são despesas. Aceita "1.234,56" e "1234.56"; datas dd/mm/aaaa ou aaaa-mm-dd.`;

const args = process.argv.slice(2);
const opt = (nome) => {
  const i = args.indexOf(`--${nome}`);
  return i > -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
};

function main() {
  if (!args.length || args.includes('--help') || args[0].startsWith('--')) {
    console.log(AJUDA);
    process.exit(args.length ? 0 : 1);
  }
  const arquivo = args[0];
  if (!fs.existsSync(arquivo)) throw new Error(`Arquivo não encontrado: ${arquivo}`);

  const config = carregarConfig(opt('config'));
  const { transacoes, avisos } = carregarTransacoes(arquivo);
  avisos.slice(0, 5).forEach((a) => console.warn(`⚠ ${a}`));
  if (avisos.length > 5) console.warn(`⚠ ... e mais ${avisos.length - 5} linha(s) ignorada(s)`);

  const resumo = analisar(categorizar(transacoes, config), opt('mes'));

  const saida = opt('saida') || path.join('saida', `relatorio-${resumo.mes}.html`);
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  fs.writeFileSync(saida, gerarHTML(resumo, config, { arquivo: path.basename(arquivo) }));
  if (args.includes('--json')) {
    const { transacoes: _t, ...enxuto } = resumo;
    fs.writeFileSync(saida.replace(/\.html$/, '.json'), JSON.stringify(enxuto, null, 2));
  }

  imprimirResumo(resumo);
  console.log(`\n✔ Relatório gerado: ${saida}`);
}

function imprimirResumo(r) {
  console.log(`\n=== ${r.mesLabel.toUpperCase()}${r.parcial ? ` (parcial: dia ${r.diasDecorridos}/${r.diasNoMes})` : ''} ===`);
  console.log(`Receitas  ${brl(r.totalReceitas).padStart(14)}`);
  console.log(`Despesas  ${brl(r.totalDespesas).padStart(14)}`);
  console.log(`Saldo     ${brl(r.saldo).padStart(14)}${r.taxaPoupanca !== null ? `  (${pct(r.taxaPoupanca)} da receita)` : ''}`);
  console.log(`Média/dia ${brl(r.mediaDiaria).padStart(14)}${r.projecao ? `  → projeção ${brl(r.projecao)}` : ''}\n`);
  const max = r.porCategoria[0]?.total || 1;
  for (const c of r.porCategoria) {
    const barra = '█'.repeat(Math.max(1, Math.round((c.total / max) * 24)));
    console.log(`${c.nome.padEnd(13)} ${barra.padEnd(24)} ${brl(c.total).padStart(13)} ${pct(c.pct, 0).padStart(4)}`);
  }
  console.log('');
  r.insights.forEach((i) => console.log(`• ${i.replace(/<\/?b>/g, '')}`));
}

try {
  main();
} catch (e) {
  console.error(`✖ ${e.message}`);
  process.exit(1);
}
