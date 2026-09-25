# Migração de clientes e produtos do Gestão Fácil

Converte os relatórios em PDF do Gestão Fácil em CSVs e importa no HortiFácil.
Escopo: clientes e produtos. Estoque entra **zerado**. Histórico de vendas, fiado e dados fiscais ficam de fora.

## Pré-requisitos

- Python 3.11+ e `pdftotext` (poppler) no PATH. No Windows, o Git Bash já traz um; ou `winget install poppler`.
- Os três PDFs na raiz do repositório: `Clientes.pdf`, `Clientes 2.pdf`, `Produtos Novo.pdf`.
- Os PDFs, `GestaoFacil/` e `migration/out/` ficam no `.gitignore` (dados pessoais). **Nunca** os versione.

## Etapa 1: gerar os CSVs (local, sem banco)

```bash
python migration/parse_pdfs.py --customers "Clientes.pdf" "Clientes 2.pdf" --products "Produtos Novo.pdf"
```

Saída em `migration/out/`: `customers.csv`, `products.csv`, `rejects.csv` e `review.html`.

Abra o `review.html` e confira, principalmente: produtos rejeitados, nomes duplicados renomeados, nomes suspeitos, decisões de unidade e categorias, "Conferir o preço" e os pontos de atenção de clientes. Para corrigir algo, edite o `products.csv` / `customers.csv`. **Prefira um editor de texto** (VS Code, Bloco de Notas): os CSVs usam vírgula e ponto decimal, e um duplo clique no Excel em português joga tudo numa coluna só. Se usar o Excel, importe por *Dados > De Texto/CSV* e defina a coluna `barcode` como **Texto**: aberto como número, o código de barras vira `7,89665E+12` e perde zeros à esquerda. O importador recusa códigos de barras que não sejam só dígitos (6 a 14) e mostra a linha. Ele também aceita CSV salvo pelo Excel (`;`, vírgula decimal, cp1252); **confira o `barcode` e o `price` de algumas linhas depois de salvar**. Categorias novas são criadas automaticamente. `unit_type` deve ser `unit`, `kg`, `gram`, `liter`, `box` ou `bunch`.

## Etapa 2: importar no HortiFácil

O script `backend/import_legacy.py` roda **dentro do container da API**, como o `seed_data.py`. Descubra o nome do container (`docker ps` no servidor, ou o painel do Coolify) e use no lugar de `<api-container>`.

```bash
docker cp backend/import_legacy.py <api-container>:/app/import_legacy.py
docker cp migration/out/products.csv <api-container>:/app/products.csv
docker cp migration/out/customers.csv <api-container>:/app/customers.csv

# 1) dry-run: não grava nada; mostra o plano e os conflitos
docker exec <api-container> python import_legacy.py --customers customers.csv --products products.csv

# 2) só depois do backup do Postgres e da revisão do dry-run:
docker exec -it <api-container> python import_legacy.py --customers customers.csv --products products.csv --apply

# 3) se ainda houver dados de teste no banco (produtos/clientes/pedidos de exemplo):
docker exec -it <api-container> python import_legacy.py --customers customers.csv --products products.csv --apply --clear-test-data
```

`--clear-test-data` apaga pedidos, itens, contas a receber, perdas de estoque, produtos e clientes (usuários e categorias ficam), depois de mostrar as contagens e pedir que você digite `APAGAR`. Tudo acontece em **uma transação**: se algo falhar, nada é apagado nem importado.

Depois de importar, apague os CSVs do container: `docker exec <api-container> rm -f /app/products.csv /app/customers.csv`.

### Códigos de saída

| Código | Significado |
|---|---|
| 0 | Ok (dry-run limpo ou importação concluída) |
| 1 | Conflitos com o que já existe no banco, ou confirmação `APAGAR` não digitada |
| 2 | CSV inválido, ou código/nome repetido dentro do CSV |
| 3 | Erro ao gravar; transação revertida |

### Conflitos

Um produto cujo **código** ou **nome** já existe no HortiFácil com outro cadastro bloqueia o `--apply` (o dry-run lista cada um). Resolva renumerando/renomeando no CSV, ou limpe os dados de teste com `--clear-test-data`. Reexecutar o import é seguro: o que já existe é pulado, nunca sobrescrito.

## Depois da importação

- Novos produtos criados no sistema recebem o código seguinte ao maior existente (6086 em diante).
- Os clientes entram como tipo `counter`, sem limite de crédito e sem saldo de fiado. Ajuste o tipo e o limite pelo cadastro quando quiser.
- NCM, CEST, CFOP e CSOSN **não** vieram dos PDFs; ficam para o sub-projeto de nota fiscal.

## Testes

```bash
cd migration && python -m pytest tests -q
cd ../backend && python -m pytest tests -q
```
