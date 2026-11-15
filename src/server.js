#!/usr/bin/env node
'use strict';

/**
 * Servidor do Meus Gastos. Sem dependências: só módulos nativos do Node.
 *
 *   node src/server.js            → http://127.0.0.1:3000
 *   PORT=8080 node src/server.js
 *   DATA_FILE=C:\dados\gastos.json node src/server.js
 *   HOST=0.0.0.0 node src/server.js   (expõe na rede local; sem autenticação!)
 *
 * API:
 *   GET    /api/transacoes
 *   POST   /api/transacoes          { data, descricao, valor, tipo: "d"|"r", categoria }
 *   DELETE /api/transacoes/:id
 *   GET    /api/resumo?mes=AAAA-MM  análise do mês (JSON)
 *   GET    /api/export.csv
 *   GET    /relatorio?mes=AAAA-MM   relatório HTML do mês
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { carregarConfig } = require('./categorizer');
const { analisar } = require('./analysis');
const { gerarHTML } = require('./report');

const RAIZ = path.join(__dirname, '..');
const INDEX = path.join(RAIZ, 'app', 'index.html');
const LIMITE_CORPO = 100 * 1024;
const MAX_TRANSACOES = 50000;

/* ───────── armazenamento em arquivo JSON ───────── */
function criarStore(arquivo) {
  let txs = [];
  try {
    txs = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    if (!Array.isArray(txs)) throw new Error('o conteúdo não é uma lista');
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // não sobrescreve um arquivo existente que não conseguimos ler
      throw new Error(`Não consegui ler ${arquivo}: ${e.message}. Corrija ou renomeie o arquivo.`);
    }
    txs = [];
  }

  let fila = Promise.resolve();
  const escrever = async () => {
    await fs.promises.mkdir(path.dirname(arquivo), { recursive: true });
    const tmp = `${arquivo}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(txs, null, 2));
    await fs.promises.rename(tmp, arquivo); // troca atômica: nunca deixa o arquivo pela metade
  };
  const salvar = () => {
    const p = fila.catch(() => {}).then(escrever); // uma escrita por vez
    fila = p;
    return p;
  };

  return {
    listar: () => txs,
    async adicionar(t) {
      txs = [...txs, t];
      try { await salvar(); } catch (e) { txs = txs.filter((x) => x !== t); throw e; }
    },
    async remover(id) {
      const antes = txs;
      const alvo = txs.find((t) => t.id === id);
      if (!alvo) return false;
      txs = txs.filter((t) => t.id !== id);
      try { await salvar(); } catch (e) { txs = antes; throw e; }
      return true;
    },
  };
}

/* ───────── validação ───────── */
const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dataValida(s) {
  const m = DATA_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function validar(body, categorias) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { erro: 'Corpo inválido.' };
  const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';
  if (!descricao || descricao.length > 80) return { erro: 'Descrição obrigatória, até 80 caracteres.' };
  if (typeof body.valor !== 'number' || !Number.isFinite(body.valor) || body.valor <= 0 || body.valor > 1e9) {
    return { erro: 'Valor deve ser um número maior que zero.' };
  }
  if (body.tipo !== 'd' && body.tipo !== 'r') return { erro: 'Tipo deve ser "d" (despesa) ou "r" (receita).' };
  if (typeof body.data !== 'string' || !dataValida(body.data)) return { erro: 'Data deve ser AAAA-MM-DD e existir.' };
  const categoria = body.tipo === 'r' ? 'Receita' : body.categoria;
  if (!categorias.has(categoria)) return { erro: `Categoria inválida: ${String(categoria).slice(0, 40)}.` };
  if (body.id !== undefined && !(typeof body.id === 'string' && ID_RE.test(body.id))) return { erro: 'Id inválido.' };
  return {
    tx: {
      id: body.id || `t${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
      data: body.data,
      descricao,
      valor: Math.round(body.valor * 100) / 100,
      tipo: body.tipo,
      categoria,
      at: Number.isFinite(body.at) ? body.at : Date.now(),
    },
  };
}

/* ───────── servidor ───────── */
function criarServidor({ arquivo = path.join(RAIZ, 'data', 'gastos.json'), host = '127.0.0.1' } = {}) {
  const store = criarStore(arquivo);
  const config = carregarConfig();
  const categorias = new Set([...config.categorias.map((c) => c.nome), 'Outros', 'Receita']);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);

  const json = (res, status, obj) => {
    const corpo = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(corpo);
  };
  const erro = (res, status, msg) => json(res, status, { erro: msg });

  function lerCorpo(req) {
    return new Promise((resolve, reject) => {
      let tamanho = 0;
      const partes = [];
      req.on('data', (c) => {
        tamanho += c.length;
        if (tamanho > LIMITE_CORPO) { reject(Object.assign(new Error('Corpo grande demais.'), { status: 413 })); req.destroy(); return; }
        partes.push(c);
      });
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || 'null')); }
        catch { reject(Object.assign(new Error('JSON inválido.'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  function paraAnalise() {
    return store.listar().map((t) => ({
      ...t,
      valor: t.tipo === 'd' ? -t.valor : t.valor,
      tipo: t.tipo === 'd' ? 'despesa' : 'receita',
      ignorada: false,
    }));
  }

  function csv() {
    const linhas = ['data;descricao;valor;tipo;categoria'].concat(
      [...store.listar()]
        .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.at || 0) - (b.at || 0)))
        .map((t) => {
          let desc = String(t.descricao).replace(/"/g, '""');
          if (/^[=+\-@\t\r]/.test(desc)) desc = `'${desc}`; // evita injeção de fórmula no Excel
          const v = (t.tipo === 'd' ? -t.valor : t.valor).toFixed(2).replace('.', ',');
          return [t.data, `"${desc}"`, v, t.tipo === 'd' ? 'despesa' : 'receita', t.categoria].join(';');
        })
    );
    return '\uFEFF' + linhas.join('\n') + '\n';
  }

  async function tratar(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const rota = url.pathname;
    const metodo = req.method;
    const escrita = metodo === 'POST' || metodo === 'DELETE';

    // proteção contra DNS rebinding e requisições de outros sites (CSRF)
    if (loopback) {
      const h = (req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
      if (!['localhost', '127.0.0.1', '::1'].includes(h)) return erro(res, 403, 'Host não permitido.');
    }
    if (escrita && req.headers.origin) {
      let ok = false;
      try { ok = new URL(req.headers.origin).host === req.headers.host; } catch { /* inválida */ }
      if (!ok) return erro(res, 403, 'Origem não permitida.');
    }

    if (metodo === 'GET' && (rota === '/' || rota === '/index.html')) {
      const html = await fs.promises.readFile(INDEX);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
      });
      return res.end(html);
    }

    if (rota === '/api/transacoes') {
      if (metodo === 'GET') return json(res, 200, store.listar());
      if (metodo === 'POST') {
        if (!(req.headers['content-type'] || '').includes('application/json')) return erro(res, 415, 'Use Content-Type: application/json.');
        if (store.listar().length >= MAX_TRANSACOES) return erro(res, 507, 'Limite de lançamentos atingido.');
        const { tx, erro: msg } = validar(await lerCorpo(req), categorias);
        if (msg) return erro(res, 400, msg);
        if (store.listar().some((t) => t.id === tx.id)) return erro(res, 409, 'Já existe um lançamento com esse id.');
        await store.adicionar(tx);
        return json(res, 201, tx);
      }
      res.setHeader('Allow', 'GET, POST');
      return erro(res, 405, 'Método não permitido.');
    }

    const mDel = /^\/api\/transacoes\/([^/]+)$/.exec(rota);
    if (mDel) {
      if (metodo !== 'DELETE') { res.setHeader('Allow', 'DELETE'); return erro(res, 405, 'Método não permitido.'); }
      let id;
      try { id = decodeURIComponent(mDel[1]); } catch { return erro(res, 400, 'Id inválido.'); }
      const ok = await store.remover(id);
      if (!ok) return erro(res, 404, 'Lançamento não encontrado.');
      res.writeHead(204);
      return res.end();
    }

    if (metodo === 'GET' && rota === '/api/export.csv') {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="meus-gastos.csv"',
        'Cache-Control': 'no-store',
      });
      return res.end(csv());
    }

    if (metodo === 'GET' && (rota === '/api/resumo' || rota === '/relatorio')) {
      const mes = url.searchParams.get('mes') || undefined;
      if (mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return erro(res, 400, 'Use mes=AAAA-MM.');
      let resumo;
      try { resumo = analisar(paraAnalise(), mes); } catch (e) { return erro(res, 404, e.message); }
      if (rota === '/api/resumo') return json(res, 200, resumo);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(gerarHTML(resumo, config, { arquivo: path.basename(arquivo) }));
    }

    return erro(res, 404, 'Não encontrado.');
  }

  const servidor = http.createServer((req, res) => {
    tratar(req, res).catch((e) => {
      if (res.headersSent) return res.end();
      if (e.status) return erro(res, e.status, e.message);
      console.error(e);
      erro(res, 500, 'Erro interno.');
    });
  });
  servidor.store = store;
  return servidor;
}

module.exports = { criarServidor, criarStore, validar };

/* ───────── execução direta ───────── */
if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '127.0.0.1';
  const arquivo = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(RAIZ, 'data', 'gastos.json');
  let servidor;
  try {
    servidor = criarServidor({ arquivo, host: HOST });
  } catch (e) {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  }
  servidor.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `✖ A porta ${PORT} já está em uso. Use outra: PORT=3001 node src/server.js` : `✖ ${e.message}`);
    process.exit(1);
  });
  servidor.listen(PORT, HOST, () => {
    console.log(`✔ Meus Gastos rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`  Dados: ${arquivo}`);
    if (HOST !== '127.0.0.1' && HOST !== 'localhost') console.log('  ⚠ Exposto na rede e sem login: qualquer pessoa na rede acessa seus dados.');
    console.log('  Ctrl+C para parar.');
  });
  const parar = () => servidor.close(() => process.exit(0));
  process.on('SIGINT', parar);
  process.on('SIGTERM', parar);
}
