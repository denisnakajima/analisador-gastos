'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCSV, parseValor, parseData } = require('../src/parser');
const { carregarConfig, categorizar } = require('../src/categorizer');
const { analisar } = require('../src/analysis');
const { escalaY } = require('../src/charts');

test('parseValor entende formatos brasileiros e internacionais', () => {
  assert.equal(parseValor('1.234,56'), 1234.56);
  assert.equal(parseValor('-1.234,56'), -1234.56);
  assert.equal(parseValor('R$ -50,00'), -50);
  assert.equal(parseValor('(50,00)'), -50);
  assert.equal(parseValor('1234.56'), 1234.56);
  assert.equal(parseValor('1,234.56'), 1234.56);
  assert.equal(parseValor('1.234'), 1234);
  assert.ok(Number.isNaN(parseValor('abc')));
});

test('parseData aceita vários formatos e rejeita datas impossíveis', () => {
  assert.equal(parseData('05/10/2026'), '2026-10-05');
  assert.equal(parseData('5-10-26'), '2026-10-05');
  assert.equal(parseData('2026-10-05'), '2026-10-05');
  assert.equal(parseData('31/02/2026'), null);
  assert.equal(parseData('xx'), null);
});

test('parseCSV: delimitador, aspas, coluna tipo e linhas inválidas', () => {
  const csv = 'Data;Descrição;Valor;Tipo\n01/10/2026;"MERCADO; EXTRA";150,00;débito\n02/10/2026;SALARIO;5.000,00;crédito\nlixo;X;1;\n';
  const { transacoes, avisos } = parseCSV(csv);
  assert.equal(transacoes.length, 2);
  assert.equal(transacoes[0].valor, -150);
  assert.equal(transacoes[0].descricao, 'MERCADO; EXTRA');
  assert.equal(transacoes[1].tipo, 'receita');
  assert.equal(avisos.length, 1);
});

test('categorizar: palavra inteira, acentos, ignorados e receitas', () => {
  const config = carregarConfig();
  const t = (descricao, valor = -10) => ({ descricao, valor, tipo: valor < 0 ? 'despesa' : 'receita', data: '2026-10-01', categoriaCsv: '' });
  const [a, b, c, d, e] = categorizar(
    [t('IFOOD *RESTAURANTE'), t('Farmácias Pacheco'), t('PAGAMENTO FATURA CARTAO'), t('SALARIO', 5000), t('PAG*JOSE 4821')],
    config
  );
  assert.equal(a.categoria, 'Alimentação');
  assert.equal(b.categoria, 'Saúde');
  assert.equal(c.ignorada, true);
  assert.equal(d.categoria, 'Receita');
  assert.equal(e.categoria, 'Outros');
  // "extra" não deve casar dentro de outra palavra
  assert.equal(categorizar([t('EXTRAORDINARIO LTDA')], config)[0].categoria, 'Outros');
});

test('analisar: totais, categorias, mês parcial e comparação justa', () => {
  const config = carregarConfig();
  const mk = (data, descricao, valor) => ({ id: 0, data, descricao, valor, tipo: valor < 0 ? 'despesa' : 'receita', categoriaCsv: '' });
  const base = [
    mk('2026-09-05', 'MERCADO EXTRA', -100),
    mk('2026-09-20', 'UBER *TRIP', -50),
    mk('2026-09-28', 'ALUGUEL', -1000),
    mk('2026-09-01', 'SALARIO', 4000),
    mk('2026-10-03', 'MERCADO EXTRA', -200),
    mk('2026-10-10', 'UBER *TRIP', -40),
    mk('2026-10-10', 'PAGAMENTO FATURA', -999),
    mk('2026-10-01', 'SALARIO', 4000),
  ];
  const r = analisar(categorizar(base, config), '2026-10');

  assert.equal(r.totalDespesas, 240);
  assert.equal(r.totalReceitas, 4000);
  assert.equal(r.saldo, 3760);
  assert.equal(r.qtdIgnoradas, 1);
  assert.equal(r.porCategoria[0].nome, 'Alimentação');
  assert.equal(r.porCategoria[0].total, 200);
  assert.ok(Math.abs(r.porCategoria.reduce((s, c) => s + c.pct, 0) - 1) < 1e-9);

  // dados terminam em 10/10 → mês parcial
  assert.equal(r.parcial, true);
  assert.equal(r.diasDecorridos, 10);
  assert.equal(r.mediaDiaria, 24);
  assert.equal(r.projecao, 744); // 24 × 31
  // comparação com setembro até o dia 10: só os R$ 100 do dia 5
  assert.equal(r.mesAnterior.comparavel, 100);
  assert.equal(r.variacao, 1.4);
  // acumulado
  assert.equal(r.diario[9].acum, 240);
  assert.equal(r.diario[10].acum, null);

  // mês anterior, completo
  const s = analisar(categorizar(base, config), '2026-09');
  assert.equal(s.parcial, false);
  assert.equal(s.totalDespesas, 1150);
  assert.equal(s.variacao, null);

  assert.throws(() => analisar(categorizar(base, config), '2027-01'), /Meses disponíveis/);
});

test('escalaY gera ticks redondos', () => {
  assert.deepEqual(escalaY(0).ticks, [0, 1]);
  assert.deepEqual(escalaY(930).ticks, [0, 500, 1000]);
  assert.deepEqual(escalaY(930, 8).ticks, [0, 200, 400, 600, 800, 1000]);
  assert.deepEqual(escalaY(8000).ticks, [0, 2000, 4000, 6000, 8000]);
});
