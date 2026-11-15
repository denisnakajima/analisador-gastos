'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizar } = require('./format');

const CONFIG_PADRAO = path.join(__dirname, '..', 'config', 'categorias.json');
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// palavra inteira: "extra" casa com "MERCADO EXTRA" mas não com "extraordinario"
const regexPalavra = (p) => new RegExp(`(^|[^a-z0-9])${escapar(normalizar(p))}([^a-z0-9]|$)`);

function carregarConfig(caminho = CONFIG_PADRAO) {
  const bruto = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  return compilarConfig(bruto);
}

function compilarConfig(bruto) {
  return {
    categorias: bruto.categorias.map((c) => ({
      nome: c.nome,
      cor: c.cor,
      chave: normalizar(c.nome),
      regexes: c.palavras.map(regexPalavra),
    })),
    ignorar: (bruto.ignorar || []).map(regexPalavra),
  };
}

/** Preenche categoria / ignorada em cada transação (não muta a original). */
function categorizar(transacoes, config) {
  return transacoes.map((t) => {
    const desc = normalizar(t.descricao);
    if (config.ignorar.some((r) => r.test(desc))) return { ...t, categoria: null, ignorada: true };
    if (t.tipo === 'receita') return { ...t, categoria: 'Receita', ignorada: false };

    const doCsv = config.categorias.find((c) => c.chave === normalizar(t.categoriaCsv));
    if (doCsv) return { ...t, categoria: doCsv.nome, ignorada: false };

    const achada = config.categorias.find((c) => c.regexes.some((r) => r.test(desc)));
    return { ...t, categoria: achada ? achada.nome : 'Outros', ignorada: false };
  });
}

module.exports = { carregarConfig, compilarConfig, categorizar };
