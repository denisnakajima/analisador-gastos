'use strict';

const fs = require('node:fs');
const { normalizar } = require('./format');

const ALIASES = {
  data: ['data', 'date', 'dt', 'data lancamento', 'data da compra', 'data transacao'],
  descricao: ['descricao', 'description', 'historico', 'lancamento', 'estabelecimento', 'memo', 'detalhe', 'titulo'],
  valor: ['valor', 'amount', 'value', 'valor (r$)', 'valor r$', 'quantia'],
  tipo: ['tipo', 'type', 'natureza', 'operacao', 'd/c'],
  categoria: ['categoria', 'category'],
};

function detectarDelimitador(linha) {
  const contagem = { ';': 0, ',': 0, '\t': 0 };
  let aspas = false;
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas;
    else if (!aspas && ch in contagem) contagem[ch]++;
  }
  return Object.entries(contagem).sort((a, b) => b[1] - a[1])[0][0];
}

function dividirLinha(linha, delim) {
  const campos = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (ch === '"') aspas = false;
      else atual += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === delim) { campos.push(atual); atual = ''; }
    else atual += ch;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

/** Aceita "1.234,56", "1234.56", "-R$ 50,00", "(50,00)". Sinal negativo = saída. */
function parseValor(bruto) {
  let s = String(bruto ?? '').trim();
  if (!s) return NaN;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  if (s.includes('-')) negativo = true;
  s = s.replace(/[^\d.,]/g, '');
  const ultimaVirgula = s.lastIndexOf(',');
  const ultimoPonto = s.lastIndexOf('.');
  if (ultimaVirgula > -1 && ultimoPonto > -1) {
    s = ultimaVirgula > ultimoPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultimaVirgula > -1) {
    s = s.replace(',', '.');
  } else if (ultimoPonto > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // "1.234" = mil duzentos e trinta e quatro
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) return NaN;
  return negativo ? -Math.abs(n) : n;
}

/** Aceita dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd. Retorna 'AAAA-MM-DD' ou null. */
function parseData(bruto) {
  const s = String(bruto ?? '').trim();
  let a, m, d;
  let r = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (r) [, a, m, d] = r;
  else if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/))) {
    [, d, m, a] = r;
    if (a.length === 2) a = `20${a}`;
  } else return null;
  const dt = new Date(Date.UTC(+a, +m - 1, +d));
  if (dt.getUTCFullYear() !== +a || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function mapearColunas(cabecalho) {
  const idx = {};
  const norm = cabecalho.map(normalizar);
  for (const [campo, nomes] of Object.entries(ALIASES)) {
    const i = norm.findIndex((h) => nomes.includes(h));
    if (i > -1) idx[campo] = i;
  }
  return idx;
}

function parseCSV(texto) {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) throw new Error('O CSV precisa de um cabeçalho e ao menos uma linha de dados.');
  const delim = detectarDelimitador(linhas[0]);
  const colunas = mapearColunas(dividirLinha(linhas[0], delim));
  for (const obrigatoria of ['data', 'descricao', 'valor']) {
    if (colunas[obrigatoria] === undefined) {
      throw new Error(`Coluna "${obrigatoria}" não encontrada no cabeçalho. Use: data;descricao;valor[;tipo][;categoria]`);
    }
  }

  const transacoes = [];
  const avisos = [];
  linhas.slice(1).forEach((linha, i) => {
    const c = dividirLinha(linha, delim);
    const nLinha = i + 2;
    const data = parseData(c[colunas.data]);
    let valor = parseValor(c[colunas.valor]);
    if (!data || Number.isNaN(valor)) {
      avisos.push(`Linha ${nLinha} ignorada (data ou valor inválido): ${linha}`);
      return;
    }
    if (colunas.tipo !== undefined) {
      const t = normalizar(c[colunas.tipo]);
      if (/deb|desp|saida|saque|compra/.test(t)) valor = -Math.abs(valor);
      else if (/cred|rec|entrada|deposito/.test(t)) valor = Math.abs(valor);
    }
    transacoes.push({
      id: transacoes.length + 1,
      data,
      descricao: c[colunas.descricao] || '(sem descrição)',
      valor,
      tipo: valor < 0 ? 'despesa' : 'receita',
      categoriaCsv: colunas.categoria !== undefined ? c[colunas.categoria] || '' : '',
    });
  });
  return { transacoes, avisos };
}

function carregarTransacoes(caminho) {
  return parseCSV(fs.readFileSync(caminho, 'utf8'));
}

module.exports = { parseCSV, carregarTransacoes, parseValor, parseData, detectarDelimitador };
