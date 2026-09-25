# Migração de clientes e produtos do Gestão Fácil (via PDF) — Design

Data: 2026-09-24
Sub-projeto A do plano "substituir o Gestão Fácil" (B = hardware, C = nota fiscal, ambos fora deste documento).

## 1. Objetivo e contexto

Trazer o cadastro de **clientes** e **produtos** da Galego Hortifruti, hoje no Gestão Fácil (Delphi + Firebird 2.5), para o HortiFácil PDV (FastAPI + PostgreSQL).

O `GestaoFacil/Dados/DADOS.FDB` disponível localmente é uma instalação limpa (0 produtos, 2 pessoas-padrão, 0 vendas), então a fonte da migração passou a ser **três relatórios em PDF** gerados pelo Gestão Fácil em 11/09/2026:

| Arquivo | Conteúdo |
|---|---|
| `Clientes.pdf` | 47 clientes (códigos 0–48) |
| `Clientes 2.pdf` | 59 clientes (códigos 2–266) |
| `Produtos Novo.pdf` | listagem de produtos ativos (código até 6085), 37 páginas |

Todos têm texto extraível (sem OCR); a extração via `pdftotext -layout` sai em Latin-1 (cp1252).

### Critério de sucesso

- Todos os clientes e produtos lidos com confiança entram no HortiFácil, com o código antigo do produto preservado.
- Nada entra com valor duvidoso: linha que o parser não consegue validar vai para revisão, não para o banco.
- A execução em produção é verificável (dry-run, contagens) e reversível (transação única + backup).

### Fora do escopo

Estoque, histórico de vendas, saldo de fiado / limite de crédito, campos fiscais (NCM, CEST, CFOP, CSOSN, origem), balança, impressora, nota fiscal. Os PDFs não trazem esses dados ou eles pertencem aos sub-projetos B e C.

## 2. O que os PDFs revelaram (premissas do desenho)

1. **Códigos de cliente colidem entre os dois PDFs.** 12 códigos aparecem nos dois arquivos e, nesses 12, nome, documento, endereço e bairro diferem — são pessoas diferentes. O código antigo, portanto, não é chave de identidade de cliente.
2. **Clientes têm pouco dado.** Campos disponíveis: código, CPF/CNPJ, IE/RG, razão, fantasia, endereço, bairro, cidade, UF, fones e celulares. Aproximadamente metade tem CPF/CNPJ e um terço tem telefone. Não há limite de crédito nem saldo.
3. **Layout de produtos quebra linhas.** Cerca de 235 linhas de texto do relatório de produtos são fragmentos de produtos partidos em duas ou mais linhas (descrição em uma, números em outra). O número exato de produtos sai do parser (estimativa: 800 a 900).
4. **O PDF traz uma checagem embutida:** `TOTAL = ESTOQUE × PREÇO`. Isso valida cada linha reconstruída.
5. **Estoque é inconsistente:** 124 itens negativos, 154 acima de 1.000 unidades, valor total no rodapé de R$ 70 milhões.
6. **A coluna de unidade é pouco confiável:** `GR`, `ML`, `LT` (lata), `EMB` são pacotes/latas/garrafas vendidos por unidade; alguns itens de peso estão com unidade errada (ex.: "… KG" marcado como `GR` ou `CX`).
7. **Modelo de destino:** `Product.code` é inteiro único; `create_product` usa `max(code)+1`, então importar códigos até 6085 faz os novos produtos começarem em 6086 sem mudança. O nome de produto é único (case-insensitive) apenas na camada de serviço, não no banco. `category` é texto livre no produto (tabela `categories` alimenta a lista). Preço deve ser > 0 (todos os produtos do PDF têm).

## 3. Decisões tomadas

| Tema | Decisão |
|---|---|
| Código do produto | **Manter o código antigo** (1–6085); código antigo do cliente vira só referência (`legacy_code`) |
| Unidade | Regra combinada: `kg` se a coluna for `KG` **ou** a descrição terminar com token `KG`; `box` para `CX` e `SC`; `unit` para o resto (UN, PCT, PC, PT, EMB, GR, ML, LT, GF). Cada decisão vai para o relatório de revisão |
| Categoria | Classificação por palavras-chave (Frutas, Verduras, Legumes, Mercearia, Limpeza, Outros...), auditável no relatório de revisão |
| Estoque | **Entra com 0** para todos os produtos |
| Execução | **Duas etapas por script**: parser local → CSVs + revisão; importador no backend com dry-run |
| Base atual de produção | Só há dados de teste; limpeza dos dados de teste é etapa manual, explícita e confirmada |

## 4. Arquitetura

```
PDFs (raiz)  ──►  migration/parse_pdfs.py  ──►  migration/out/
                    (local, Windows)               customers.csv
                                                   products.csv
                                                   rejects.csv
                                                   review.html
                                                      │  (usuário revisa/corrige)
                                                      ▼
                       docker cp  ──►  backend/import_legacy.py  ──►  PostgreSQL
                                          (container da API)
```

Duas unidades independentes, ligadas apenas por um contrato de arquivo (os CSVs):

- **Parser** (`migration/`): sem acesso a banco; entrada = PDFs, saída = arquivos. Testável isoladamente.
- **Importador** (`backend/import_legacy.py`): não conhece PDF; entrada = CSVs limpos, saída = linhas no banco. Segue o padrão do `seed_data.py` (script na raiz de `backend/`, executado por `docker exec`).

### 4.1 Parser (`migration/parse_pdfs.py`)

Dependência de sistema: `pdftotext` (poppler). Saída em `migration/out/`, que **não é versionada**.

**Clientes**
- Cada bloco iniciado por `CÓDIGO:` vira um registro; lê os dois PDFs.
- Normaliza CPF/CNPJ (só dígitos), telefone (só dígitos) e nomes (espaços, caixa).
- Identidade: CPF/CNPJ normalizado; sem documento, nome + endereço normalizados.
- Registros idênticos são unificados; registros que compartilham identidade mas divergem em outros campos, e códigos colidentes com pessoas diferentes, vão para a seção "conflitos" do `review.html`.
- Colunas do `customers.csv` importadas: `name` (razão), `document`, `phone` (primeiro celular/fone disponível), `address` (endereço, bairro, cidade/UF, CEP concatenados) e `notes`. Padrões: `customer_type = counter`, `credit_limit = 0`, ativo.
- `notes` recebe uma linha de rastreio no formato `Gestão Fácil: cód. 28 (Clientes 2.pdf)`, mais o nome fantasia (quando difere da razão) e IE/RG. Assim o código antigo fica registrado **sem** coluna nova no schema. O CSV também traz `legacy_code` e `legacy_source` como colunas de referência, que o importador ignora.
- O cliente de código 0 ("CONSUMIDOR FINAL") é ignorado e listado no relatório como descartado.

**Produtos**
- Reconstrói produtos cujas linhas foram quebradas, juntando fragmentos adjacentes.
- Valida cada produto com `estoque × preço ≈ total` (tolerância de centavos). Falhou → `rejects.csv`, com o texto original e a página.
- Campos: `code` (antigo), `name`, `barcode`, `unit_type` (regra combinada), `price`, `category` (palavras-chave), `stock = 0`, além de `legacy_unit`, `legacy_stock` e `cost` como colunas de referência (não importadas).
- `review.html` mostra: produtos por categoria, decisões de unidade (com a unidade original ao lado), nomes duplicados (case-insensitive), códigos duplicados, rejeitados.

**Garantia de conferência:** o relatório termina com totais (linhas lidas, produtos reconstruídos, rejeitados) para comparar com o rodapé/paginação do PDF.

### 4.2 Importador (`backend/import_legacy.py`)

Uso (dentro do container):

```
python import_legacy.py --customers customers.csv --products products.csv            # dry-run (padrão)
python import_legacy.py --customers customers.csv --products products.csv --apply
python import_legacy.py ... --apply --clear-test-data
```

Comportamento:
- **Dry-run por padrão:** não grava; imprime o que criaria, o que pularia e os conflitos.
- **Transação única** no `--apply`: entra tudo ou nada.
- **Idempotente e não destrutivo:** chave do produto = `code`; chave do cliente = CPF/CNPJ (ou nome + endereço). Já existente → pulado e listado. Nunca sobrescreve.
- **Conflitos abortam o `--apply`:** colisão de código ou de nome (case-insensitive, respeitando a regra de `_check_name_unique`) com produto existente. O dry-run lista tudo.
- **Categorias:** cria em `categories` as que os produtos usam e ainda não existem.
- **`--clear-test-data`:** apaga, na mesma transação do import, contas a receber, itens de pedido, pedidos, perdas de estoque, produtos e clientes (mesmo escopo do `reset_data` do `seed_data.py`). **Preserva usuários e categorias.** Antes imprime contagens exatas e exige digitar `APAGAR`.
- **Sem alterações de schema:** nenhuma migration Alembic.
- Ao final imprime a conferência: lidos, criados, pulados, rejeitados — para clientes e produtos.

## 5. Tratamento de erros

| Situação | Comportamento |
|---|---|
| Linha de produto sem validação `estoque × preço = total` | vai para `rejects.csv`; não entra |
| Nome de produto duplicado dentro dos CSVs | destacado no `review.html`; importador aborta até ser resolvido |
| Código de produto duplicado nos CSVs | destacado; importador aborta |
| Colisão com produto/cliente existente | listada no dry-run; `--apply` aborta (exceto pulo idempotente de registro idêntico) |
| Falha durante o `--apply` | rollback da transação inteira |
| CSV com colunas faltando ou valor inválido (preço ≤ 0, unidade fora do enum) | erro claro antes de qualquer gravação |

## 6. Testes e verificação

- **Parser:** testes `pytest` para as partes puras: reconstrução de linha quebrada, checagem `estoque × preço`, regra de unidade, regra de categoria, normalização de documento/telefone, detecção de conflitos de cliente.
- **Importador:** o backend não tem suíte de testes; validação por dry-run e `--apply` num PostgreSQL local descartável (Docker), conferindo contagens e a criação de produtos novos após a importação (esperado: código 6086+). Sem tocar em produção durante o desenvolvimento.
- **Produção:** dry-run → revisão do usuário → backup do Postgres pelo Coolify → `--apply` (com `--clear-test-data`, se aprovado) → conferência final.

## 7. Segurança, privacidade e operação

- `.gitignore` deve cobrir: `GestaoFacil/` (certificado digital A1, senha do banco em `Banco.ini`, dados de clientes), os PDFs de origem (`Clientes.pdf`, `Clientes 2.pdf`, `Produtos Novo.pdf`) e `migration/out/`.
- **Deploy:** nenhuma etapa aciona o Coolify. O script e os CSVs vão ao container em execução por `docker cp`. Qualquer deploy exige o "pode fazer o deploy" explícito do usuário.
- A limpeza de dados de teste em produção só ocorre com confirmação explícita do usuário no momento da execução.

## 8. Ligações com os outros sub-projetos

- **C (nota fiscal):** os produtos importados não têm NCM/CEST/CFOP/CSOSN; o sub-projeto C precisará de um passo próprio para obtê-los (o `DADOS.FDB` local traz as tabelas de referência NCM/CEST/CFOP/IBPT, úteis para isso). Parâmetros fiscais conhecidos: regime Simples Nacional (CRT = 1), NF-e modelo 55 emitida em PE, certificado A1.
- **B (hardware):** o prefixo de balança do sistema antigo é `200`, e o modelo/porta da balança e impressora **não** existem no `DADOS.FDB` local (tabela de terminais vazia). Manter os códigos antigos preserva compatibilidade com etiquetas de balança já em uso.
