'use strict';
// Gera data/exemplo.csv com 6 meses de movimentações fictícias (determinístico).
// O último mês termina no dia 28, para demonstrar mês parcial + projeção.

const fs = require('node:fs');
const path = require('node:path');

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(2026);
const entre = (min, max) => min + rnd() * (max - min);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const linhas = [];
const add = (ano, mes, dia, desc, valor) => linhas.push({ ano, mes, dia, desc, valor: Math.round(valor * 100) / 100 });

const MESES = [[2026, 5], [2026, 6], [2026, 7], [2026, 8], [2026, 9], [2026, 10]];
const mercados = ['MERCADO EXTRA', 'CARREFOUR BAIRRO', 'ATACADAO', 'PAO DE ACUCAR', 'PADARIA SAO JOSE', 'HORTIFRUTI VILA'];
const comidas = ['IFOOD *RESTAURANTE', 'IFOOD *PIZZARIA', 'RESTAURANTE DO ZE', 'LANCHONETE CENTRAL', 'RAPPI *BR'];
const compras = ['AMAZON MARKETPLACE', 'MERCADOLIVRE*VENDEDOR', 'SHOPEE BR', 'MAGALU', 'RENNER LOJAS'];
const lazer = ['CINEMARK INGRESSO', 'BAR DO CHICO', 'SHOW LIVE INGRESSO', 'PARQUE IBIRAPUERA'];
const saude = ['DROGASIL', 'FARMACIAS PACHECO', 'DROGARIA RAIA', 'CLINICA VIDA CONSULTA'];
const outros = ['PAG*JOSE 4821', 'PIX FULANO DE TAL', 'TARIFA BANCARIA', 'LOJA DO SEU ZE', 'PAG*MARIA 77'];

for (const [ano, mes] of MESES) {
  const ultimo = ano === 2026 && mes === 10 ? 28 : new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const ok = (d) => d <= ultimo;

  add(ano, mes, 5, 'SALARIO EMPRESA XYZ LTDA', 7850);
  if (mes % 2 === 0 && ok(18)) add(ano, mes, 18, 'FREELA PIX CLIENTE', entre(600, 1400));
  add(ano, mes, 10, 'ALUGUEL APTO 42', -2100);
  add(ano, mes, 10, 'CONDOMINIO EDIFICIO SOL', -480);
  if (ok(12)) add(ano, mes, 12, 'ENEL ENERGIA', -entre(150, 260));
  if (ok(14)) add(ano, mes, 14, 'SABESP', -entre(70, 110));
  if (ok(15)) add(ano, mes, 15, 'VIVO FIBRA', -129.9);
  if (ok(6)) add(ano, mes, 6, 'NETFLIX.COM', -55.9);
  if (ok(6)) add(ano, mes, 6, 'SPOTIFY AB', -23.9);
  if (ok(8)) add(ano, mes, 8, 'SMARTFIT MENSALIDADE', -119.9);
  if (ok(22)) add(ano, mes, 22, 'PAGAMENTO FATURA CARTAO', -entre(1500, 2500)); // ignorada

  for (let d = 1; d <= ultimo; d++) {
    if (rnd() < 0.32) add(ano, mes, d, pick(mercados), -entre(35, 290));
    if (rnd() < 0.2) add(ano, mes, d, pick(comidas), -entre(28, 120));
    if (rnd() < 0.38) add(ano, mes, d, pick(['UBER *TRIP', '99 POP', 'UBER *TRIP']), -entre(12, 58));
    if (rnd() < 0.05) add(ano, mes, d, pick(['POSTO SHELL', 'POSTO IPIRANGA']), -entre(120, 260));
    if (rnd() < 0.09) add(ano, mes, d, pick(compras), -entre(40, 420));
    if (rnd() < 0.07) add(ano, mes, d, pick(lazer), -entre(30, 250));
    if (rnd() < 0.06) add(ano, mes, d, pick(saude), -entre(25, 230));
    if (rnd() < 0.07) add(ano, mes, d, pick(outros), -entre(20, 320));
  }
  if (mes === 8) add(ano, mes, 20, 'UDEMY CURSO NODE', -89.9);
  if (mes === 10 && ok(15)) add(ano, mes, 15, 'ALURA ASSINATURA ANUAL', -768);
  if (mes === 7) add(ano, mes, 25, 'AIRBNB VIAGEM', -1150);
}

linhas.sort((a, b) => a.ano - b.ano || a.mes - b.mes || a.dia - b.dia);
const fmtBR = (v) => v.toFixed(2).replace('.', ',');
const csv = ['data;descricao;valor']
  .concat(linhas.map((l) => `${String(l.dia).padStart(2, '0')}/${String(l.mes).padStart(2, '0')}/${l.ano};${l.desc};${fmtBR(l.valor)}`))
  .join('\n');

const destino = path.join(__dirname, '..', 'data', 'exemplo.csv');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, csv + '\n');
console.log(`✔ ${linhas.length} lançamentos gravados em ${path.relative(process.cwd(), destino)}`);
