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
3. **Layout de produtos quebra linhas.** O relatório imprime números largos quebrados em linhas vizinhas. Um produto é sempre um **grupo de linhas consecutivas sem linha em branco entre elas**: dos 810 grupos do PDF, 694 têm 1 linha e 116 têm 2. Há ainda 5 fragmentos numéricos soltos (sem produto), descartados como ruído. As colunas numéricas são alinhadas à direita, mas **as posições deslocam de página para página**, então o parser calibra as colunas pelo cabeçalho de cada página.
4. **A checagem `TOTAL = ESTOQUE × PREÇO` é apenas informativa.** O estoque e o total também quebram entre linhas, então a conta não fecha para parte dos produtos mesmo com o preço certo. Com os PDFs reais: 752 conferem, 16 divergem e 37 não têm dados legíveis. Só a **falta de código, descrição, unidade ou preço (ou preço ≤ 0)** rejeita o produto; a divergência vira um alerta no relatório de revisão.
5. **Estoque é inconsistente:** 124 itens negativos, 154 acima de 1.000 unidades, valor total no rodapé de R$ 70 milhões.
6. **A coluna de unidade é pouco confiável:** `GR`, `ML`, `LT` (lata), `EMB` são pacotes/latas/garrafas vendidos por unidade; alguns itens de peso estão com unidade errada (ex.: "… KG" marcado como `GR` ou `CX`).
7. **Modelo de destino:** `Product.code` é inteiro único; `create_product` usa `max(code)+1`, então importar códigos até 6085 faz os novos produtos começarem em 6086 sem mudança. O nome de produto é único (case-insensitive) apenas na camada de serviço, não no banco. `category` é texto livre no produto (tabela `categories` alimenta a lista). Preço deve ser > 0 (todos os produtos do PDF têm).

## 3. Decisões tomadas

| Tema | Decisão |
|---|---|
| Código do produto | **Manter o código antigo** (1–6085); código antigo do cliente vira só referência (`legacy_code`) |
| Unidade | Regra combinada: `kg` se a coluna for `KG` **ou** a descrição terminar com o token `KG` **sem número antes** ("UVA VITORIA KG" é `kg`; "ALHO TRITURADO 1 KG" é embalagem e fica `unit`); `box` para `CX` e `SC`; `unit` para o resto (UN, PCT, PC, PT, EMB, GR, ML, LT, GF, RL, CJ). Cada decisão que difere da coluna antiga vai para o relatório de revisão |
| Nome de produto duplicado | O nome é único no HortiFácil (sem diferenciar maiúsculas/acentos). O produto de **menor código mantém o nome** e os demais recebem o sufixo ` (código)`; o nome original fica na coluna `renamed_from` e na seção "Nomes duplicados" do relatório. *(Refina a versão aprovada, que abortava a importação até resolver.)* |
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
- Identidade: CPF/CNPJ normalizado; sem documento, nome + rua + número normalizados.
- Registros idênticos são unificados em silêncio (contados no resumo). Registros com a mesma identidade mas dados divergentes (`dados-divergentes`) mantêm o **primeiro** (ordem dos PDFs) e vão para os pontos de atenção do `review.html`. Um mesmo código para pessoas diferentes (`codigo-repetido`) importa **as duas** e também é listado.
- Telefone: prefere celular a fixo; telefones extras vão para `notes` ("Outros fones"). CPF/CNPJ e telefones são gravados formatados, como o PDF os imprime.
- Colunas do `customers.csv` importadas: `name` (razão), `document`, `phone` (primeiro celular/fone disponível), `address` (endereço, bairro, cidade/UF, CEP concatenados) e `notes`. Padrões: `customer_type = counter`, `credit_limit = 0`, ativo.
- `notes` recebe uma linha de rastreio no formato `Gestão Fácil: cód. 28 (Clientes 2.pdf)`, mais o nome fantasia (quando difere da razão) e IE/RG. Assim o código antigo fica registrado **sem** coluna nova no schema. O CSV também traz `legacy_code` e `legacy_source` como colunas de referência, que o importador ignora.
- O cliente de código 0 ("CONSUMIDOR FINAL") é ignorado e listado no relatório como descartado.

**Produtos**
- Agrupa as linhas por registro (linhas consecutivas sem linha em branco) e calibra as colunas pelo cabeçalho de cada página. Código e código de barras vêm do início da linha, descrição da faixa entre "Referência" e "Und", unidade da coluna "Und", preço da coluna "Preço".
- Fragmentos numéricos soltos (sem código nem descrição) são descartados e contados como ruído.
- Rejeita, com o texto original e o número da linha, o registro sem código, descrição, unidade ou preço, com unidade fora da lista que o Gestão Fácil imprime (KG, UN, CX, SC, PCT, PC, PT, EMB, GR, ML, LT, GF, RL, CJ; evita ler `KG` como `G`) ou com preço ≤ 0 (`rejects.csv`).
- A conta `estoque × preço ≈ total` (tolerância de 2%) é apenas informativa: gera a coluna `check` (`ok` / `divergente` / `sem-dados`) e a seção "Conferir o preço" do relatório.
- Campos exportados: `code` (antigo), `barcode`, `name`, `unit_type` (regra combinada), `price`, `category` (palavras-chave), `stock = 0`, `legacy_unit`, `legacy_cost`, `legacy_stock`, `check` e `renamed_from`. As colunas `legacy_*`, `check` e `renamed_from` são só referência; o importador as ignora.
- Nomes duplicados são renomeados conforme a tabela de decisões (§3).
- Categorias: Frutas, Verduras, Legumes, Temperos e Ervas, Ovos e Laticínios, Bebidas, Limpeza e Higiene, Descartáveis e Utilidades, Mercearia e Outros (a regra é ordenada; exceções como "batata palha" ou "leite de coco" vêm antes das regras gerais).
- `review.html` mostra: resumo, rejeitados, nomes duplicados renomeados, nomes suspeitos (2 letras ou menos, ou só números), unidade antiga → nova, decisões de unidade que diferem da coluna antiga, produtos por categoria, preços a conferir, clientes ignorados, pontos de atenção de clientes e preenchimento dos campos de cliente.
- O CLI falha alto (e não escreve nada) se **qualquer** PDF de clientes não tiver nenhum cliente, ou se o PDF de produtos não tiver nenhum produto, para pegar PDF trocado.

**Garantia de conferência:** o relatório abre com totais (lidos, prontos, rejeitados, ruído) para comparar com os PDFs.

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
- **Conflitos abortam o `--apply`:** colisão de código ou de nome (sem diferenciar maiúsculas/acentos, respeitando a regra de `_check_name_unique`) com produto existente, e código ou nome repetido dentro do próprio CSV. O dry-run lista tudo.
- **Categorias:** cria em `categories` as que os produtos novos usam e ainda não existem.
- **`--clear-test-data`:** apaga, na mesma transação do import, contas a receber, itens de pedido, pedidos, perdas de estoque, clientes e produtos, nessa ordem por causa das chaves estrangeiras. **Preserva usuários e categorias.** Mostra as contagens exatas (também no dry-run) e exige digitar `APAGAR`. Com essa opção, o plano é calculado como se o banco já estivesse limpo.
- **Recusa código de barras que não seja só dígitos (6 a 14):** o Excel converte EAN para notação científica (`7,89665E+12`) e apaga zeros à esquerda; isso não pode entrar em silêncio.
- **Aceita CSV salvo pelo Excel em português:** separador `;`, vírgula decimal (`1.234,56`) e codificação cp1252, além do UTF-8 gerado pelo parser.
- **Falha ao gravar:** rollback, mensagem curta sem parâmetros do SQL (que conteriam dados de clientes) e código de saída 3.
- **Códigos de saída:** 0 = ok / dry-run limpo; 1 = conflitos ou confirmação não dada; 2 = CSV inválido; 3 = erro ao gravar.
- **Sem alterações de schema:** nenhuma migration Alembic.
- Ao final imprime a conferência: produtos e clientes no banco após a importação.

## 5. Tratamento de erros

| Situação | Comportamento |
|---|---|
| Produto sem código, descrição, unidade ou preço (ou preço ≤ 0) | vai para `rejects.csv`; não entra |
| Estoque × preço não bate com o total impresso | só alerta no `review.html`; o produto entra |
| Nome de produto duplicado nos PDFs | o parser renomeia com sufixo ` (código)` e lista no relatório |
| Nome ou código repetido dentro do CSV editado à mão | importador aborta antes de tocar no banco (saída 2) |
| Colisão de código/nome com produto existente no banco | listada no dry-run; `--apply` aborta (saída 1); registro idêntico é só pulado |
| Falha durante o `--apply` | rollback da transação inteira; mensagem curta; saída 3 |
| CSV com colunas faltando ou valor inválido (preço ≤ 0, unidade fora do enum, texto longo demais) | todas as linhas ruins são listadas com o número da linha, antes de qualquer gravação (saída 2) |
| PDF trocado (sem nenhum cliente ou nenhum produto) | o parser para sem escrever nada |

## 6. Testes e verificação

- **Parser:** testes `pytest` com texto sintético no formato do `pdftotext -layout` (nenhum dado real de cliente nos testes): reconstrução de linha quebrada, calibração por página, fragmentos soltos, rejeições, checagem informativa, preço com separador de milhar, regras de unidade e de categoria (com nomes reais do catálogo), fusão e conflitos de clientes, CSVs, relatório e CLI de ponta a ponta.
- **Importador:** os testes `pytest` cobrem a parte pura (leitura/validação de CSV, incluindo Excel pt-BR, e o plano). A parte de banco não tem teste unitário; foi **validada num PostgreSQL 16 descartável com o schema dos modelos atuais**, seguindo o fluxo de produção (`docker cp` + `docker exec`): dry-run com conflitos, dry-run com `--clear-test-data`, recusa sem digitar `APAGAR`, `--apply` completo, reexecução idempotente, próximo produto criado pelo serviço do app com código 6086, e rollback forçado por uma restrição `CHECK` que faz um cliente falhar no meio da transação. Sem tocar em produção durante o desenvolvimento.
- **Produção:** dry-run → revisão do usuário → backup do Postgres pelo Coolify → `--apply` (com `--clear-test-data`, se aprovado) → conferência final.

## 7. Segurança, privacidade e operação

- `.gitignore` deve cobrir: `GestaoFacil/` (certificado digital A1, senha do banco em `Banco.ini`, dados de clientes), os PDFs de origem (`Clientes.pdf`, `Clientes 2.pdf`, `Produtos Novo.pdf`) e `migration/out/`.
- **Deploy:** nenhuma etapa aciona o Coolify. O script e os CSVs vão ao container em execução por `docker cp`. Qualquer deploy exige o "pode fazer o deploy" explícito do usuário.
- A limpeza de dados de teste em produção só ocorre com confirmação explícita do usuário no momento da execução.

## 8. Ligações com os outros sub-projetos

- **C (nota fiscal):** os produtos importados não têm NCM/CEST/CFOP/CSOSN; o sub-projeto C precisará de um passo próprio para obtê-los (o `DADOS.FDB` local traz as tabelas de referência NCM/CEST/CFOP/IBPT, úteis para isso). Parâmetros fiscais conhecidos: regime Simples Nacional (CRT = 1), NF-e modelo 55 emitida em PE, certificado A1.
- **B (hardware):** o prefixo de balança do sistema antigo é `200`, e o modelo/porta da balança e impressora **não** existem no `DADOS.FDB` local (tabela de terminais vazia). Manter os códigos antigos preserva compatibilidade com etiquetas de balança já em uso.

## 9. Resultado medido com os PDFs reais (validação do desenho)

| Item | Resultado |
|---|---|
| Produtos lidos | **805** (0 rejeitados, 5 fragmentos soltos descartados, 805 códigos únicos, nenhum preço ≤ 0) |
| Produtos com código de barras | 467 |
| Unidade final | 555 `unit`, 210 `kg`, 40 `box` |
| Categorias | Mercearia 272, Temperos e Ervas 117, Frutas 117, Limpeza e Higiene 93, Legumes 63, Outros 48 (só nomes de 1 letra, números e "DIVERSOS"), Ovos e Laticínios 35, Descartáveis e Utilidades 31, Bebidas 17, Verduras 12 |
| Nomes duplicados renomeados | 35 |
| Conta estoque × preço | 752 conferem, 16 divergem, 37 sem dados |
| Clientes lidos / prontos | 106 lidos (47 + 59) → **94 prontos**, 1 ignorado (Consumidor Final), 5 duplicados idênticos fundidos |
| Pontos de atenção em clientes | 11 `codigo-repetido` (importados os dois) e 6 `dados-divergentes` (mantido o primeiro) |
| Preenchimento dos clientes | 43 com CPF/CNPJ, 28 com telefone, 76 com endereço |
| Importação no Postgres descartável | 805 produtos e 94 clientes; pedidos, itens, fiado e perdas zerados por `--clear-test-data`; usuário e categorias preservados; estoque total 0; `max(code) = 6085`; próximo produto = 6086 |

## 10. Observações fora do escopo (encontradas durante a validação)

- `backend/seed_data.py` cria `Product(...)` sem `code`, que é `NOT NULL` desde a migration 006; o script provavelmente está quebrado hoje.
- A cadeia de migrations do Alembic não constrói um banco novo do zero (a `000` é vazia e a `001` altera a tabela `users`); o schema de produção veio de outra origem. Para o teste, o schema foi criado a partir dos modelos atuais.
- Os clientes importados têm CNPJ e são, em boa parte, hotéis e pousadas; o tipo `external`/`hotel`/`inn` do HortiFácil poderia descrevê-los melhor que `counter`. Ficou como `counter` (decisão aprovada); vale revisar depois.
