# Meus Gastos

Controle de gastos pessoais em Node.js, **sem dependências** (só módulos nativos, Node >= 18).
Um servidor local entrega o app web, guarda os lançamentos num arquivo JSON e gera análise mensal com gráficos.

## Rodando

```bash
npm start                      # http://127.0.0.1:3000
PORT=8080 npm start            # outra porta
npm test                       # 13 testes
```

No Windows (PowerShell):

```powershell
$env:PORT=8080; npm start
$env:DATA_FILE="C:\projetos\dados\gastos.json"; npm start
```

Variáveis: `PORT` (3000), `HOST` (127.0.0.1), `DATA_FILE` (data/gastos.json).
`HOST=0.0.0.0` expõe o app na rede local **sem login**: qualquer pessoa na rede acessa seus dados.

## O app

Abra a página, lance despesas e receitas (valor, descrição, data, categoria) e veja resumo do mês, comparação com o mês anterior, projeção, categorias, gasto por dia, acumulado, receitas × despesas e a lista de lançamentos. A categoria é sugerida pela descrição e o app aprende com o que você já lançou. Também tem filtro por categoria, "Desfazer" ao remover, exportar CSV e o relatório HTML do mês.

Na primeira abertura aparece um exemplo com dados fictícios; ele some ao adicionar o primeiro lançamento.

## API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/transacoes` | lista os lançamentos |
| POST | `/api/transacoes` | cria `{data:"AAAA-MM-DD", descricao, valor, tipo:"d"\|"r", categoria}` |
| DELETE | `/api/transacoes/:id` | remove |
| GET | `/api/resumo?mes=AAAA-MM` | análise do mês em JSON |
| GET | `/relatorio?mes=AAAA-MM` | relatório HTML com gráficos |
| GET | `/api/export.csv` | todos os lançamentos em CSV (`;`, UTF-8 com BOM) |

Segurança: o servidor valida todos os campos, limita o corpo a 100 KB, recusa `Host` e `Origin` estranhos (DNS rebinding / CSRF), grava o JSON de forma atômica (arquivo temporário + rename) e se recusa a iniciar se o arquivo de dados estiver corrompido, em vez de sobrescrevê-lo. O CSV exportado neutraliza fórmulas (`=`, `+`, `-`, `@`).

## Importar de um extrato CSV (opcional)

O modo antigo continua disponível: gera um relatório HTML a partir de um CSV de banco.

```bash
npm run exemplo                         # cria data/exemplo.csv fictício
node src/cli.js data/exemplo.csv        # saida/relatorio-AAAA-MM.html
node src/cli.js extrato.csv --mes 2026-09 --json
```

CSV: `data;descricao;valor[;tipo][;categoria]`, valor negativo = despesa, aceita `1.234,56`, datas `dd/mm/aaaa` ou `aaaa-mm-dd`.
As categorias e palavras-chave desse modo ficam em `config/categorias.json`.

## Estrutura

```
src/server.js      servidor HTTP + API + armazenamento em JSON
app/index.html     o app (HTML/CSS/JS puro, gráficos em SVG)
src/analysis.js    análise mensal (usada pela API e pelo relatório)
src/report.js      relatório HTML    src/charts.js  gráficos SVG
src/parser.js      leitor de CSV     src/categorizer.js  categorização
src/cli.js         linha de comando para CSV
tests/             13 testes (node --test)
```
