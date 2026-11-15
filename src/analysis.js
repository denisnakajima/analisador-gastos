'use strict';

const { r2, brl, pct, mesNome, mesCurto, mesLabel, diaMes, diasNoMes, addMes } = require('./format');

function somar(lista) {
  return r2(lista.reduce((s, t) => s + Math.abs(t.valor), 0));
}

function totaisPorCategoria(despesas) {
  const mapa = new Map();
  for (const t of despesas) {
    const m = mapa.get(t.categoria) || { total: 0, qtd: 0 };
    m.total += Math.abs(t.valor);
    m.qtd += 1;
    mapa.set(t.categoria, m);
  }
  return mapa;
}

function serieDiaria(despesas, mes, ate) {
  const dim = diasNoMes(mes);
  const dias = Array.from({ length: dim }, (_, i) => ({
    dia: i + 1,
    data: `${mes}-${String(i + 1).padStart(2, '0')}`,
    total: 0,
    qtd: 0,
    acum: null,
  }));
  for (const t of despesas) {
    const d = dias[Number(t.data.slice(8, 10)) - 1];
    d.total += Math.abs(t.valor);
    d.qtd += 1;
  }
  let acum = 0;
  for (const d of dias) {
    d.total = r2(d.total);
    if (d.dia <= ate) {
      acum += d.total;
      d.acum = r2(acum);
    }
  }
  return dias;
}

/**
 * Analisa um mês. `mes` no formato AAAA-MM (padrão: último mês com dados).
 * Transações devem já ter passado por categorizar().
 */
function analisar(transacoes, mes) {
  const ativas = transacoes.filter((t) => !t.ignorada);
  const meses = [...new Set(ativas.map((t) => t.data.slice(0, 7)))].sort();
  if (!meses.length) throw new Error('Nenhuma transação válida encontrada.');
  mes = mes || meses[meses.length - 1];
  const doMes = ativas.filter((t) => t.data.startsWith(mes));
  if (!doMes.length) {
    throw new Error(`Nenhuma transação em ${mes}. Meses disponíveis: ${meses.join(', ')}`);
  }

  const despesas = doMes.filter((t) => t.tipo === 'despesa');
  const receitas = doMes.filter((t) => t.tipo === 'receita');
  const totalDespesas = somar(despesas);
  const totalReceitas = somar(receitas);
  const saldo = r2(totalReceitas - totalDespesas);

  // O mês está completo? Só é parcial se for o último mês dos dados e os dados acabarem antes do fim dele.
  const dim = diasNoMes(mes);
  const ultimaData = ativas.reduce((m, t) => (t.data > m ? t.data : m), '0000-00-00');
  const parcial = mes === meses[meses.length - 1] && ultimaData.slice(0, 7) === mes && Number(ultimaData.slice(8, 10)) < dim;
  const diasDecorridos = parcial ? Number(ultimaData.slice(8, 10)) : dim;

  // mês anterior
  const mesAnterior = addMes(mes, -1);
  const despAnt = ativas.filter((t) => t.data.startsWith(mesAnterior) && t.tipo === 'despesa');
  const temAnterior = despAnt.length > 0;
  const catAnt = totaisPorCategoria(despAnt);
  const anteriorDiario = temAnterior ? serieDiaria(despAnt, mesAnterior, diasNoMes(mesAnterior)) : null;
  const totalAnteriorTodo = somar(despAnt);
  // comparação justa: mês parcial é comparado ao mesmo período do mês anterior
  const totalAnteriorComparavel = temAnterior
    ? parcial
      ? anteriorDiario.filter((d) => d.dia <= diasDecorridos).reduce((s, d) => r2(s + d.total), 0)
      : totalAnteriorTodo
    : null;
  const variacao = temAnterior && totalAnteriorComparavel > 0 ? (totalDespesas - totalAnteriorComparavel) / totalAnteriorComparavel : null;

  const porCategoria = [...totaisPorCategoria(despesas)]
    .map(([nome, v]) => {
      const anterior = catAnt.has(nome) ? r2(catAnt.get(nome).total) : 0;
      return {
        nome,
        total: r2(v.total),
        qtd: v.qtd,
        pct: totalDespesas ? v.total / totalDespesas : 0,
        anterior: temAnterior ? anterior : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  const diario = serieDiaria(despesas, mes, diasDecorridos);
  const mediaDiaria = r2(totalDespesas / diasDecorridos);
  const projecao = parcial ? r2(mediaDiaria * dim) : null;

  const maioresDespesas = [...despesas].sort((a, b) => a.valor - b.valor).slice(0, 10);
  const diaMaisCaro = diario.filter((d) => d.dia <= diasDecorridos).sort((a, b) => b.total - a.total)[0];

  // histórico dos últimos 6 meses até `mes`
  const historico = [];
  for (let i = 5; i >= 0; i--) {
    const m = addMes(mes, -i);
    const doM = ativas.filter((t) => t.data.startsWith(m));
    if (!doM.length) continue;
    const d = somar(doM.filter((t) => t.tipo === 'despesa'));
    const r = somar(doM.filter((t) => t.tipo === 'receita'));
    historico.push({ mes: m, label: mesCurto(m), receitas: r, despesas: d, saldo: r2(r - d), parcial: m === mes && parcial });
  }

  const resumo = {
    mes,
    mesLabel: mesLabel(mes),
    mesesDisponiveis: meses,
    parcial,
    diasDecorridos,
    diasNoMes: dim,
    totalDespesas,
    totalReceitas,
    saldo,
    taxaPoupanca: totalReceitas > 0 ? saldo / totalReceitas : null,
    mediaDiaria,
    projecao,
    mesAnterior: temAnterior ? { mes: mesAnterior, label: mesLabel(mesAnterior), nome: mesNome(mesAnterior), total: totalAnteriorTodo, comparavel: r2(totalAnteriorComparavel) } : null,
    variacao,
    porCategoria,
    diario,
    anteriorDiario,
    historico,
    maioresDespesas,
    diaMaisCaro,
    qtdDespesas: despesas.length,
    qtdReceitas: receitas.length,
    qtdIgnoradas: transacoes.filter((t) => t.ignorada && t.data.startsWith(mes)).length,
    transacoes: doMes.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.valor - b.valor)),
  };
  resumo.insights = gerarInsights(resumo, despesas);
  return resumo;
}

function gerarInsights(r, despesas) {
  const out = [];
  const top = r.porCategoria[0];
  if (top) {
    out.push(`<b>${top.nome}</b> foi a maior categoria: ${brl(top.total)} (${pct(top.pct)} das despesas).`);
  }

  if (r.variacao !== null) {
    const sinal = r.variacao >= 0 ? 'acima' : 'abaixo';
    const ref = r.parcial ? `do mesmo período de ${r.mesAnterior.nome}` : `de ${r.mesAnterior.nome}`;
    out.push(`Despesas ${pct(Math.abs(r.variacao))} ${sinal} ${ref} (${brl(r.totalDespesas)} vs ${brl(r.mesAnterior.comparavel)}).`);
  }

  const crescimentos = r.porCategoria
    .filter((c) => c.anterior !== null && !r.parcial)
    .map((c) => ({ ...c, delta: c.total - c.anterior }))
    .filter((c) => c.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  if (crescimentos[0] && crescimentos[0].anterior > 0) {
    const c = crescimentos[0];
    out.push(`Maior aumento: <b>${c.nome}</b>, +${brl(c.delta)} em relação a ${r.mesAnterior.nome}.`);
  }

  if (r.diaMaisCaro && r.diaMaisCaro.total > 0) {
    out.push(`Dia mais caro: ${diaMes(r.diaMaisCaro.data)}, com ${brl(r.diaMaisCaro.total)} em ${r.diaMaisCaro.qtd} lançamento(s).`);
  }

  if (r.parcial) {
    out.push(`Ritmo atual: ${brl(r.mediaDiaria)}/dia. Se continuar assim, o mês fecha em cerca de <b>${brl(r.projecao)}</b>.`);
  }

  if (r.taxaPoupanca !== null) {
    out.push(
      r.saldo >= 0
        ? `Você guardou ${pct(r.taxaPoupanca)} da receita (${brl(r.saldo)}).`
        : `Despesas superaram a receita em ${brl(-r.saldo)}.`
    );
  }

  const outros = r.porCategoria.find((c) => c.nome === 'Outros');
  if (outros && outros.pct >= 0.15) {
    const exemplos = despesas
      .filter((t) => t.categoria === 'Outros')
      .sort((a, b) => a.valor - b.valor)
      .slice(0, 3)
      .map((t) => t.descricao);
    out.push(`${pct(outros.pct, 0)} das despesas estão em "Outros" (ex.: ${exemplos.join('; ')}). Adicione palavras-chave em config/categorias.json.`);
  }
  return out;
}

module.exports = { analisar };
