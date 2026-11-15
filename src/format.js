'use strict';

const brl = (v) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

const num = (v, casas = 0) =>
  Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const pct = (fracao, casas = 1) => `${(fracao * 100).toFixed(casas).replace('.', ',')}%`;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function dataDoMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

const mesLabel = (mes) =>
  dataDoMes(mes).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const mesNome = (mes) =>
  dataDoMes(mes).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });

const mesCurto = (mes) =>
  dataDoMes(mes).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '');

const diaMes = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const diasNoMes = (mes) => {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

function addMes(mes, delta) {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

const normalizar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

module.exports = { brl, num, pct, esc, r2, mesLabel, mesNome, mesCurto, diaMes, diasNoMes, addMes, normalizar };
