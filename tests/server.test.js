'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarServidor } = require('../src/server');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gastos-')), 'gastos.json');

const abertos = [];
async function subir(arquivo) {
  const srv = criarServidor({ arquivo });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  // closeAllConnections: respostas não consumidas pelo teste deixam conexões keep-alive abertas
  const s = { srv, base, parar: () => new Promise((r) => { srv.close(() => r()); srv.closeAllConnections(); }) };
  abertos.push(s);
  return s;
}
// garante que nenhum servidor fique aberto quando uma asserção falha (senão o processo nunca termina)
test.afterEach(async () => { for (const s of abertos.splice(0)) await s.parar(); });
const post = (base, corpo, extra = {}) =>
  fetch(`${base}/api/transacoes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(corpo) });

const mercado = { data: '2026-10-05', descricao: 'Mercado Extra', valor: 150.5, tipo: 'd', categoria: 'Alimentação' };

test('cria, lista, persiste em disco e remove', async () => {
  const arquivo = tmp();
  let s = await subir(arquivo);

  let r = await post(s.base, mercado);
  assert.equal(r.status, 201);
  const criado = await r.json();
  assert.ok(criado.id && criado.at);

  await post(s.base, { data: '2026-10-01', descricao: 'Salário', valor: 5000, tipo: 'r' });
  const lista = await (await fetch(`${s.base}/api/transacoes`)).json();
  assert.equal(lista.length, 2);
  assert.equal(lista.find((t) => t.tipo === 'r').categoria, 'Receita');
  await s.parar();

  // novo servidor sobre o mesmo arquivo enxerga os dados
  s = await subir(arquivo);
  assert.equal((await (await fetch(`${s.base}/api/transacoes`)).json()).length, 2);

  r = await fetch(`${s.base}/api/transacoes/${criado.id}`, { method: 'DELETE' });
  assert.equal(r.status, 204);
  r = await fetch(`${s.base}/api/transacoes/${criado.id}`, { method: 'DELETE' });
  assert.equal(r.status, 404);
  assert.equal(JSON.parse(fs.readFileSync(arquivo, 'utf8')).length, 1);
  assert.equal(fs.readdirSync(path.dirname(arquivo)).filter((f) => f.endsWith('.tmp')).length, 0);
  await s.parar();
});

test('rejeita entradas inválidas', async () => {
  const s = await subir(tmp());
  const casos = [
    { ...mercado, valor: 0 },
    { ...mercado, valor: -5 },
    { ...mercado, valor: '10' },
    { ...mercado, descricao: '   ' },
    { ...mercado, descricao: 'x'.repeat(81) },
    { ...mercado, data: '2026-02-30' },
    { ...mercado, tipo: 'x' },
    { ...mercado, categoria: 'Inventada' },
    { ...mercado, id: '../etc' },
  ];
  for (const c of casos) assert.equal((await post(s.base, c)).status, 400, JSON.stringify(c));

  let r = await fetch(`${s.base}/api/transacoes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{quebrado' });
  assert.equal(r.status, 400);
  r = await fetch(`${s.base}/api/transacoes`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(r.status, 415);
  r = await fetch(`${s.base}/api/transacoes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(200 * 1024) }).catch((e) => e);
  assert.ok(r instanceof Error || r.status === 413);
  assert.equal((await (await fetch(`${s.base}/api/transacoes`)).json()).length, 0);
  await s.parar();
});

test('id repetido dá 409 e id próprio é aceito (usado pelo "Desfazer")', async () => {
  const s = await subir(tmp());
  assert.equal((await post(s.base, { ...mercado, id: 'abc123' })).status, 201);
  assert.equal((await post(s.base, { ...mercado, id: 'abc123' })).status, 409);
  await s.parar();
});

test('bloqueia origem externa e host estranho', async () => {
  const s = await subir(tmp());
  assert.equal((await post(s.base, mercado, { Origin: 'https://site-malicioso.com' })).status, 403);
  assert.equal((await post(s.base, mercado, { Origin: s.base })).status, 201);
  const r = await fetch(`${s.base}/api/transacoes`, { headers: { Host: 'evil.example.com' } }).catch(() => null);
  // fetch não deixa trocar o Host; testamos via http cru
  const http = require('node:http');
  const status = await new Promise((res) => {
    http.get({ host: '127.0.0.1', port: s.srv.address().port, path: '/api/transacoes', headers: { Host: 'evil.example.com' } }, (x) => { x.resume(); res(x.statusCode); });
  });
  assert.equal(status, 403);
  void r;
  await s.parar();
});

test('resumo, relatório HTML, CSV e página inicial', async () => {
  const s = await subir(tmp());
  await post(s.base, { data: '2026-09-02', descricao: 'Mercado', valor: 100, tipo: 'd', categoria: 'Alimentação' });
  await post(s.base, { ...mercado, valor: 200 });
  await post(s.base, { data: '2026-10-01', descricao: '=SOMA(A1)', valor: 50, tipo: 'd', categoria: 'Outros' });
  await post(s.base, { data: '2026-10-01', descricao: 'Salário', valor: 4000, tipo: 'r' });

  let r = await fetch(`${s.base}/api/resumo?mes=2026-10`);
  const resumo = await r.json();
  assert.equal(resumo.totalDespesas, 250);
  assert.equal(resumo.totalReceitas, 4000);
  assert.equal(resumo.porCategoria[0].nome, 'Alimentação');
  // outubro (parcial, até o dia 5): 250 contra R$ 100 de setembro no mesmo período
  assert.equal(resumo.variacao, 1.5);

  assert.equal((await fetch(`${s.base}/api/resumo?mes=2030-01`)).status, 404);
  assert.equal((await fetch(`${s.base}/api/resumo?mes=lixo`)).status, 400);

  r = await fetch(`${s.base}/relatorio?mes=2026-10`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Resumo de gastos/);

  r = await fetch(`${s.base}/api/export.csv`);
  const csv = await r.text();
  assert.match(r.headers.get('content-disposition'), /attachment/);
  assert.match(csv, /2026-10-05;"Mercado Extra";-200,00;despesa;Alimentação/);
  assert.match(csv, /"'=SOMA\(A1\)"/); // fórmula neutralizada

  r = await fetch(`${s.base}/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Meus Gastos/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);

  assert.equal((await fetch(`${s.base}/../package.json`)).status, 404);
  assert.equal((await fetch(`${s.base}/src/server.js`)).status, 404);
  await s.parar();
});

test('recusa arquivo de dados corrompido sem sobrescrevê-lo', () => {
  const arquivo = tmp();
  fs.writeFileSync(arquivo, '{isso nao e json');
  assert.throws(() => criarServidor({ arquivo }), /Não consegui ler/);
  assert.equal(fs.readFileSync(arquivo, 'utf8'), '{isso nao e json');
});

test('escritas simultâneas não perdem lançamentos', async () => {
  const arquivo = tmp();
  const s = await subir(arquivo);
  const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => post(s.base, { ...mercado, valor: i + 1 })));
  assert.ok(rs.every((r) => r.status === 201));
  await s.parar();
  assert.equal(JSON.parse(fs.readFileSync(arquivo, 'utf8')).length, 25);
});
