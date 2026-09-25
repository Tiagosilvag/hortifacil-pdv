# Migração de clientes e produtos do Gestão Fácil (via PDF) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter os relatórios em PDF do Gestão Fácil (clientes e produtos) em CSVs revisáveis e importá-los no PostgreSQL do HortiFácil com dry-run, transação única e rollback.

**Architecture:** Duas etapas ligadas só por arquivos CSV. (1) `migration/` é um parser local, sem banco, que lê `pdftotext -layout` e gera `customers.csv`, `products.csv`, `rejects.csv` e `review.html`. (2) `backend/import_legacy.py` lê os CSVs e grava no Postgres, rodando dentro do container da API como o `seed_data.py`. A parte pura de cada etapa é testada com `pytest`; a parte de banco é validada num Postgres descartável.

**Tech Stack:** Python 3.11+ (biblioteca padrão apenas), `pdftotext` (poppler), pytest (só desenvolvimento), SQLAlchemy 2.0 async + asyncpg (já no backend), Docker (só para validação).

**Spec:** `docs/superpowers/specs/2026-09-24-migracao-legado-pdf-design.md` (aprovada). Leia-a junto com este plano: as tabelas de decisões (§3), os números medidos com os PDFs reais (§9) e as observações (§10) valem para todas as tarefas.

## Global Constraints

- Escopo: só **clientes** e **produtos**. Fora: estoque, histórico de vendas, fiado, campos fiscais (NCM/CEST/CFOP/CSOSN), balança, impressora.
- Código do produto: **manter o código antigo** do Gestão Fácil (1–6085). O código antigo do cliente vai só em `customers.notes`, sem coluna nova.
- Estoque de todos os produtos importados: **0**.
- Unidade (`unit_type`): `kg` se a coluna for `KG` ou a descrição terminar com o token `KG` **sem número antes**; `box` para `CX` e `SC`; `unit` para o resto. Valores válidos do enum do HortiFácil: `unit`, `kg`, `gram`, `liter`, `box`, `bunch`.
- Categoria por palavras-chave, uma das: Frutas, Verduras, Legumes, Temperos e Ervas, Ovos e Laticínios, Bebidas, Limpeza e Higiene, Descartáveis e Utilidades, Mercearia, Outros.
- Nome do produto é único no HortiFácil (sem diferenciar maiúsculas/acentos): o menor código mantém o nome, os demais ganham o sufixo ` (código)`.
- Cliente: `customer_type = counter`, `credit_limit = 0`, ativo. Cliente "CONSUMIDOR FINAL" (código 0) é ignorado.
- Limites do banco: nome do produto e do cliente ≤ 255, categoria ≤ 100, código de barras ≤ 50, documento e telefone ≤ 20, preço em `(0, 99999999.99]`.
- CSVs em UTF-8 com BOM (`utf-8-sig`); colunas exatas: produtos `code, barcode, name, unit_type, price, category, stock, legacy_unit, legacy_cost, legacy_stock, check, renamed_from`; clientes `name, document, phone, address, notes, legacy_code, legacy_source`.
- A parte pura de `backend/import_legacy.py` **não pode importar `app`** no topo do arquivo (`app.core.config` exige `DATABASE_URL`/`SECRET_KEY` no import). Imports de banco ficam dentro das funções.
- Nenhuma migration Alembic, nenhuma alteração de schema, nenhuma alteração fora de `migration/`, `backend/import_legacy.py`, `backend/tests/`, `.gitignore` e `docs/`.
- **Nada de dados pessoais no git:** `GestaoFacil/`, os três PDFs de origem e `migration/out/` ficam no `.gitignore`. Os testes usam só texto sintético.
- **Nunca acionar o Coolify** (deploy) e **nunca rodar nada contra o banco de produção** sem o "pode fazer o deploy" / autorização explícita do usuário naquele momento. Toda a construção e validação usa um Postgres descartável.
- Commits terminam com a linha `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Ambiente: os comandos abaixo são para o Git Bash na raiz do repositório. `pdftotext` precisa estar no PATH (o Git Bash já traz um). Todo comando `python` / `pytest` roda com o venv de `migration/.venv` ativo (`source migration/.venv/Scripts/activate`).

## Review Focus

Entradas que a spec implica, mas que nenhum requisito descreve, e que mais provavelmente vão morder quem usar isto. Cada uma tem teste na tarefa dona.

1. **CSV salvo pelo Excel em português** (separador `;`, vírgula decimal `6,99`, codificação cp1252) depois de o usuário corrigir categorias à mão: deve importar normalmente. → teste `test_read_products_accepts_excel_ptbr_csv` (Task 6).
2. **PDF trocado** (passar o PDF de clientes no lugar do de produtos, ou um PDF qualquer): deve parar com mensagem clara e sem escrever arquivos. → teste `test_run_fails_loudly_when_a_pdf_has_no_customers_or_products` (Task 5).
3. **Preço a partir de R$ 1.000** com separador de milhar (`1.234,50`): deve virar `1234.50`. → teste `test_price_with_thousands_separator` (Task 2).
4. **Página com colunas deslocadas** em relação às anteriores (o relatório real desloca 1–2 caracteres): o preço e a unidade não podem trocar de coluna. → teste `test_columns_are_calibrated_per_page` (Task 2).
5. **Mesma pessoa nos dois PDFs de clientes, e o mesmo código para pessoas diferentes:** o primeiro caso funde sem ruído; o segundo importa as duas e avisa. → testes `test_identical_duplicate_across_pdfs_is_merged_silently` e `test_same_code_different_people_keeps_both_and_reports` (Task 4).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `.gitignore` (modificar) | Impede versionar dados pessoais, certificado e senha do banco |
| `migration/legacy_import/normalize.py` | `only_digits`, `fold`, `format_document`, `format_phone` (funções puras) |
| `migration/legacy_import/products_parser.py` | Texto do relatório de produtos → `ParsedProduct` / `Reject` |
| `migration/legacy_import/product_rules.py` | `classify_unit` e `classify_category` |
| `migration/legacy_import/customers_parser.py` | Texto do relatório de clientes → `RawCustomer`; fusão em `MergedCustomer` |
| `migration/legacy_import/export.py` | `ExportProduct`, renomear duplicados, escrever os CSVs |
| `migration/legacy_import/review.py` | `review.html` |
| `migration/legacy_import/cli.py` | Orquestra: PDFs → CSVs + relatório |
| `migration/parse_pdfs.py` | Ponto de entrada |
| `migration/tests/` | `pytest` com texto sintético (`report_builders.py` monta o layout do `pdftotext`) |
| `migration/README.md` | Runbook |
| `backend/import_legacy.py` | Ler/validar CSV, montar o plano (puro) e gravar no Postgres |
| `backend/tests/` | `pytest` da parte pura do importador |

---

### Task 1: Base de `migration/`, `.gitignore` e normalização

**Files:**
- Modify: `.gitignore`
- Create: `migration/legacy_import/__init__.py`
- Create: `migration/legacy_import/normalize.py`
- Create: `migration/tests/conftest.py`
- Create: `migration/tests/test_normalize.py`
- Create: `migration/requirements-dev.txt`

**Interfaces:**
- Produces (usados por todas as tarefas seguintes):
  - `only_digits(value: str | None) -> str`
  - `fold(value: str | None) -> str` (maiúsculas, sem acento, espaços colapsados)
  - `format_document(value: str | None) -> str` (CPF `000.000.000-00`, CNPJ `00.000.000/0000-00`, outro tamanho → só dígitos)
  - `format_phone(value: str | None) -> str` (11 dígitos `(00) 00000-0000`, 10 dígitos `(00) 0000-0000`, outro → só dígitos)

- [ ] **Step 1: Criar o ambiente virtual e instalar o pytest**

```bash
cd migration
python -m venv .venv
source .venv/Scripts/activate
echo "pytest" > requirements-dev.txt
pip install -q -r requirements-dev.txt
python -m pytest --version
cd ..
```
Expected: imprime `pytest 8.x` ou superior. (`.venv/` já está no `.gitignore` do projeto.)

- [ ] **Step 2: Escrever o teste que falha**

Create `migration/tests/conftest.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
```

Create `migration/tests/test_normalize.py`:

```python
from legacy_import.normalize import fold, format_document, format_phone, only_digits


def test_only_digits_strips_everything_else():
    assert only_digits("12.345.678/0001-95") == "12345678000195"
    assert only_digits(None) == ""


def test_fold_removes_accents_case_and_extra_spaces():
    assert fold("  maçã   Argentina ") == "MACA ARGENTINA"
    assert fold(None) == ""


def test_format_document_cpf_cnpj_and_other():
    assert format_document("12345678901") == "123.456.789-01"
    assert format_document("12345678000195") == "12.345.678/0001-95"
    assert format_document("123") == "123"
    assert format_document("") == ""


def test_format_phone_mobile_landline_and_other():
    assert format_phone("(81) 9 8888-7777") == "(81) 98888-7777"
    assert format_phone("8133334444") == "(81) 3333-4444"
    assert format_phone("3333444") == "3333444"
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd migration && python -m pytest tests/test_normalize.py -q; cd ..
```
Expected: FAIL com `ModuleNotFoundError: No module named 'legacy_import'`.

- [ ] **Step 4: Implementar**

Create `migration/legacy_import/__init__.py`:

```python
"""Parser dos relatórios em PDF do Gestão Fácil (migração de clientes e produtos)."""
```

Create `migration/legacy_import/normalize.py`:

```python
"""Funções puras de normalização de texto, documentos e telefones."""
import re
import unicodedata


def only_digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def fold(value: str | None) -> str:
    """Maiúsculas, sem acento e com espaços colapsados — para comparar textos."""
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip().upper()


def format_document(value: str | None) -> str:
    """CPF (11 dígitos) e CNPJ (14) formatados; qualquer outro tamanho vira só dígitos."""
    digits = only_digits(value)
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return digits


def format_phone(value: str | None) -> str:
    """Celular (11 dígitos) e fixo (10) formatados; qualquer outro tamanho vira só dígitos."""
    digits = only_digits(value)
    if len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    return digits
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd migration && python -m pytest tests/test_normalize.py -q; cd ..
```
Expected: `4 passed`.

- [ ] **Step 6: Proteger os dados sensíveis no `.gitignore`**

Acrescente ao **final** do `.gitignore` da raiz:

```gitignore

# Migração do Gestão Fácil: dados pessoais de clientes, certificado digital e senha do banco. NUNCA versionar.
GestaoFacil/
/Clientes.pdf
/Clientes 2.pdf
/Produtos Novo.pdf
migration/out/
```

- [ ] **Step 7: Conferir que está tudo ignorado**

```bash
git check-ignore -v GestaoFacil/Banco.ini "Clientes.pdf" "Clientes 2.pdf" "Produtos Novo.pdf" migration/out/customers.csv migration/.venv/pyvenv.cfg
git status --short
```
Expected: as seis linhas do `check-ignore` mostram a regra que casou; `git status --short` **não** lista mais `GestaoFacil/`, os PDFs nem `migration/.venv`, e lista apenas `.gitignore`, `migration/...` e os arquivos que já estavam modificados antes (`.impeccable/config.json`, `frontend/src/pages/orders/NewOrder.tsx`, `.claude/scheduled_tasks.lock`).

- [ ] **Step 8: Commit**

```bash
git add .gitignore migration/legacy_import/__init__.py migration/legacy_import/normalize.py migration/tests/conftest.py migration/tests/test_normalize.py migration/requirements-dev.txt
git commit -m "feat(migration): base do parser de PDFs e proteção de dados sensíveis no .gitignore"
```
(Não use `git add .` nem `git add -A`: há arquivos alheios modificados na árvore.)

---

### Task 2: Parser do relatório de produtos

**Files:**
- Create: `migration/legacy_import/products_parser.py`
- Create: `migration/tests/report_builders.py`
- Create: `migration/tests/test_products_parser.py`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `ParsedProduct(code:int, barcode:str|None, name:str, legacy_unit:str, price:Decimal, legacy_cost:str|None, legacy_stock:str|None, check:str, line:int)`, com `check` em `"ok" | "divergente" | "sem-dados"`
  - `Reject(line:int, reason:str, raw:str)`
  - `ProductsResult(products:list[ParsedProduct], rejects:list[Reject], noise_groups:int)`
  - `parse_products_text(text: str) -> ProductsResult`
  - `parse_decimal(text: str) -> Decimal` (`"1.234,56"` → `Decimal("1234.56")`)
  - Em `tests/report_builders.py`: `header(shift=0)`, `row(code, barcode, desc, unit, custo, preco, estoque, total, shift=0)`, `page(*records, shift=0, number=1)`

Contexto: o relatório imprime números largos quebrados em linhas vizinhas. Um produto é um **grupo de linhas consecutivas sem linha em branco**. As colunas numéricas são alinhadas à direita, e as posições **mudam de página para página**, então são calibradas pelo cabeçalho de cada página.

- [ ] **Step 1: Escrever os testes que falham**

Create `migration/tests/report_builders.py` (constrói texto sintético no formato do `pdftotext -layout`; o construtor de clientes entra na Task 4):

```python
"""Construtores de texto sintético no formato do pdftotext -layout (sem dados reais)."""


def _put(buf: list[str], col: int, text: str) -> None:
    buf[col:col + len(text)] = list(text)


def _put_right(buf: list[str], end: int, text: str) -> None:
    _put(buf, end - len(text), text)


def header(shift: int = 0) -> str:
    buf = [" "] * 130
    for col, text in [(0, "CÓDIGO"), (7, "CÓD.BARRA"), (19, "REFERÊNCIA"), (30, "DESCRIÇÃO"), (62, "GRUPO"),
                      (80 + shift, "UND"), (85 + shift, "Custo"), (92 + shift, "Preço"),
                      (98 + shift, "ESTOQUE"), (107 + shift, "TOTAL")]:
        _put(buf, col, text)
    return "".join(buf).rstrip()


def row(code=None, barcode=None, desc=None, unit=None, custo=None, preco=None,
        estoque=None, total=None, shift: int = 0) -> str:
    buf = [" "] * 130
    if code is not None:
        _put(buf, 0, str(code))
    if barcode:
        _put(buf, len(str(code)) + 1, barcode)  # o relatório imprime o código de barras logo após o código
    if desc:
        _put(buf, 19, desc)
    if unit:
        _put(buf, 80 + shift, unit)
    if custo:
        _put_right(buf, 90 + shift, custo)
    if preco:
        _put_right(buf, 97 + shift, preco)
    if estoque:
        _put_right(buf, 105 + shift, estoque)
    if total:
        _put_right(buf, 114 + shift, total)
    return "".join(buf).rstrip()


def page(*records: list[str], shift: int = 0, number: int = 1) -> str:
    """Uma página: cabeçalho do relatório, cabeçalho de colunas e registros separados por linha em branco."""
    lines = ["GALEGO HORTIFRUTI", "", "LISTAGEM DE PRODUTOS", "",
             "| SITUAÇÃO:1 | ORDENADO: código", "", header(shift), ""]
    for record in records:
        lines.extend(record)
        lines.append("")
    lines.append(f"Relatório emitido em 11/09/2026- 15:30:45     Pág.{number}")
    return "\n".join(lines) + "\n"
```

Create `migration/tests/test_products_parser.py`:

```python
from decimal import Decimal

from legacy_import.products_parser import parse_products_text
from report_builders import page, row


def test_clean_row_is_parsed():
    text = page([row(21, None, "BANANA PRATA KG", "KG", "5,00", "6,99", "174,424", "1219,22")])
    result = parse_products_text(text)
    assert result.rejects == []
    (p,) = result.products
    assert (p.code, p.barcode, p.name, p.legacy_unit) == (21, None, "BANANA PRATA KG", "KG")
    assert p.price == Decimal("6.99")
    assert p.legacy_cost == "5,00"
    assert p.check == "ok"


def test_barcode_is_captured():
    text = page([row(518, "7896646570284", "MINI PIMENTAO 150G", "PCT", "8,00", "12,00", "988", "11856,00")])
    (p,) = parse_products_text(text).products
    assert p.barcode == "7896646570284"
    assert p.legacy_stock == "988"
    assert p.check == "ok"


def test_record_wrapped_in_two_lines_is_one_product():
    top = row(unit="UN", custo="1,50", total="5")
    bottom = row(28, None, "COUVE FOLHA MOE", None, None, "1,99", "-722,40", "-1437,59")
    result = parse_products_text(page([top, bottom]))
    (p,) = result.products
    assert (p.code, p.name, p.legacy_unit, p.price) == (28, "COUVE FOLHA MOE", "UN", Decimal("1.99"))
    assert p.legacy_cost == "1,50"


def test_description_above_and_code_below():
    top = row(None, None, "DIVERSOS", "UN", "0,00", None, None, "15")
    bottom = row(202, None, None, None, None, "1,00", "-72477,", "-72477,52")
    (p,) = parse_products_text(page([top, bottom])).products
    assert (p.code, p.name, p.price) == (202, "DIVERSOS", Decimal("1.00"))


def test_loose_numeric_fragment_is_noise_not_reject():
    fragment = [" " * 99 + "75"]
    good = [row(1, None, "ALFACE", "UN", "1,00", "2,50", "10", "25,00")]
    result = parse_products_text(page(fragment, good))
    assert len(result.products) == 1
    assert result.rejects == []
    assert result.noise_groups == 1


def test_missing_unit_is_rejected_with_reason():
    result = parse_products_text(page([row(7, None, "SEM UNIDADE", None, "1,00", "2,00", "1", "2,00")]))
    assert result.products == []
    assert [r.reason for r in result.rejects] == ["sem unidade"]


def test_zero_price_is_rejected():
    result = parse_products_text(page([row(8, None, "PRECO ZERO", "UN", "1,00", "0,00", "1", "0,00")]))
    assert [r.reason for r in result.rejects] == ["preço zero ou negativo"]


def test_missing_price_is_rejected():
    result = parse_products_text(page([row(9, None, "SEM PRECO", "UN", "1,00", None, "3", "6,00")]))
    assert [r.reason for r in result.rejects] == ["sem preço"]


def test_stock_check_divergent_and_no_data():
    divergent = row(10, None, "DIVERGENTE", "UN", "1,00", "2,00", "10", "99,00")
    nodata = row(11, None, "SEM DADOS", "UN", "1,00", "2,00")
    products = {p.code: p for p in parse_products_text(page([divergent], [nodata])).products}
    assert products[10].check == "divergente"
    assert products[11].check == "sem-dados"


def test_columns_are_calibrated_per_page():
    normal = page([row(1, None, "NORMAL", "UN", "3,00", "5,00", "2", "10,00")], number=1)
    shifted = page([row(2, None, "DESLOCADO", "KG", "4,00", "7,50", "2", "15,00", shift=2)], shift=2, number=2)
    products = {p.code: p for p in parse_products_text(normal + shifted).products}
    assert products[1].price == Decimal("5.00")
    assert products[2].price == Decimal("7.50")
    assert products[2].legacy_unit == "KG"
    assert products[2].legacy_cost == "4,00"


def test_price_with_thousands_separator():
    text = page([row(5, None, "CX BANANA 20KG", "CX", None, "1.234,50", "2", "2469,00")])
    (p,) = parse_products_text(text).products
    assert p.price == Decimal("1234.50")
    assert p.check == "ok"
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd migration && python -m pytest tests/test_products_parser.py -q; cd ..
```
Expected: FAIL com `ModuleNotFoundError: No module named 'legacy_import.products_parser'`.

- [ ] **Step 3: Implementar**

Create `migration/legacy_import/products_parser.py`:

```python
"""Parser do relatório 'LISTAGEM DE PRODUTOS' do Gestão Fácil.

Entrada: texto gerado por `pdftotext -layout`. O relatório imprime números largos
quebrados em linhas vizinhas; um produto é sempre um grupo de linhas consecutivas
sem linha em branco entre elas. Colunas numéricas são alinhadas à direita, e as
posições são calibradas pelo cabeçalho de cada página (elas deslocam de página em página).
"""
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

HEADER_PREFIX = "CÓDIGO CÓD.BARRA"
NOISE_PREFIXES = ("Relatório emitido", "GALEGO", "END:", "FONE:", "LISTAGEM", "CUSTO TOTAL")
CODE_LINE = re.compile(r"^(\d{1,6})(?:\s+(\d{6,14}))?(?=\s)")
MONEY = re.compile(r"-?\d[\d\.]*,\d+")
NUMBER = re.compile(r"-?\d[\d\.]*(?:,\d+)?")
UNIT = re.compile(r"([A-Z]{1,4})(?=\s|$)")
COLUMN_TOLERANCE = 3


@dataclass(frozen=True)
class ParsedProduct:
    code: int
    barcode: str | None
    name: str
    legacy_unit: str
    price: Decimal
    legacy_cost: str | None
    legacy_stock: str | None
    check: str  # "ok" | "divergente" | "sem-dados"
    line: int


@dataclass(frozen=True)
class Reject:
    line: int
    reason: str
    raw: str


@dataclass(frozen=True)
class ProductsResult:
    products: list[ParsedProduct]
    rejects: list[Reject]
    noise_groups: int


def parse_decimal(text: str) -> Decimal:
    """'1.234,56' -> Decimal('1234.56')."""
    try:
        return Decimal(text.replace(".", "").replace(",", "."))
    except InvalidOperation as exc:
        raise ValueError(f"número inválido: {text!r}") from exc


def _is_noise(line: str) -> bool:
    stripped = line.strip()
    return (not stripped) or stripped.startswith(NOISE_PREFIXES) or "SITUAÇÃO" in stripped


def _calibrate(header: str) -> dict:
    def end(name: str) -> int:
        return header.find(name) + len(name)

    return {
        "ref": header.find("REFERÊNCIA"),
        "und": header.find("UND"),
        "ends": {
            "custo": end("Custo") + 1,
            "preco": end("Preço") + 1,
            "estoque": end("ESTOQUE"),
            "total": end("TOTAL") + 3,
        },
    }


def _split_groups(text: str) -> list[tuple[int, list[str], dict]]:
    groups: list[tuple[int, list[str], dict]] = []
    current: list[str] = []
    start = 0
    cols: dict | None = None

    def flush() -> None:
        nonlocal current
        if current and cols is not None:
            groups.append((start, current, cols))
        current = []

    for number, line in enumerate(text.split("\n"), start=1):
        if line.startswith(HEADER_PREFIX):
            flush()
            cols = _calibrate(line)
        elif _is_noise(line):
            flush()
        else:
            if not current:
                start = number
            current.append(line)
    flush()
    return groups


def _money_by_column(lines: list[str], cols: dict) -> dict[str, str]:
    found: dict[str, str] = {}
    for line in lines:
        for match in MONEY.finditer(line):
            if match.start() > 0 and line[match.start() - 1] in ",.":
                continue
            column = min(cols["ends"], key=lambda k: abs(cols["ends"][k] - match.end()))
            if abs(cols["ends"][column] - match.end()) <= COLUMN_TOLERANCE:
                found[column] = match.group()
    return found


def _stock_check(price: str, lines: list[str]) -> tuple[str, str | None]:
    """Compara estoque x preço com o total impresso. Retorna (resultado, estoque impresso)."""
    for line in lines:
        for match in MONEY.finditer(line):
            if match.group() != price:
                continue
            tail = NUMBER.findall(line[match.end():])
            if len(tail) < 2:
                continue
            try:
                stock, total = parse_decimal(tail[0]), parse_decimal(tail[1])
            except ValueError:
                continue
            expected = stock * parse_decimal(price)
            tolerance = max(abs(total) * Decimal("0.02"), Decimal("0.5"))
            return ("ok" if abs(expected - total) <= tolerance else "divergente"), tail[0]
    return "sem-dados", None


def parse_products_text(text: str) -> ProductsResult:
    products: list[ParsedProduct] = []
    rejects: list[Reject] = []
    noise = 0

    for start, lines, cols in _split_groups(text):
        code = barcode = None
        for line in lines:
            match = CODE_LINE.match(line)
            if match:
                code, barcode = int(match.group(1)), match.group(2)
                break

        name = re.sub(
            r"\s+", " ",
            " ".join(seg for seg in (ln[cols["ref"]:cols["und"] - 1].strip() for ln in lines) if seg),
        )
        if code is None and not name:
            noise += 1  # fragmento numérico solto, sem produto
            continue

        unit = None
        for line in lines:
            match = UNIT.search(line[cols["und"] - 1:cols["und"] + 5])
            if match:
                unit = match.group(1)

        money = _money_by_column(lines, cols)
        raw = "\n".join(lines)

        problem = None
        if code is None:
            problem = "sem código"
        elif not name:
            problem = "sem descrição"
        elif unit is None:
            problem = "sem unidade"
        elif "preco" not in money:
            problem = "sem preço"
        elif parse_decimal(money["preco"]) <= 0:
            problem = "preço zero ou negativo"
        if problem:
            rejects.append(Reject(line=start, reason=problem, raw=raw))
            continue

        check, printed_stock = _stock_check(money["preco"], lines)
        products.append(
            ParsedProduct(
                code=code,
                barcode=barcode,
                name=name,
                legacy_unit=unit,
                price=parse_decimal(money["preco"]),
                legacy_cost=money.get("custo"),
                legacy_stock=printed_stock,
                check=check,
                line=start,
            )
        )
    return ProductsResult(products=products, rejects=rejects, noise_groups=noise)
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd migration && python -m pytest tests/test_products_parser.py -q; cd ..
```
Expected: `11 passed`.

- [ ] **Step 5: Conferir contra o PDF real**

```bash
TMP=$(mktemp -d)
pdftotext -enc UTF-8 -layout "Produtos Novo.pdf" "$TMP/produtos.txt"
cd migration && python - "$TMP/produtos.txt" <<'EOF'
import sys, collections
from legacy_import.products_parser import parse_products_text
text = open(sys.argv[1], encoding="utf-8").read()
r = parse_products_text(text)
print("produtos:", len(r.products), "| rejeitados:", len(r.rejects), "| ruído:", r.noise_groups)
print("checks:", dict(collections.Counter(p.check for p in r.products)))
print("códigos únicos:", len({p.code for p in r.products}))
print("com código de barras:", sum(1 for p in r.products if p.barcode))
EOF
cd ..
```
Expected (números medidos com os PDFs de 11/09/2026):
```
produtos: 805 | rejeitados: 0 | ruído: 5
checks: {'ok': 752, 'sem-dados': 37, 'divergente': 16}
códigos únicos: 805
com código de barras: 467
```
Se os números diferirem, **pare**: o PDF mudou ou o parser regrediu; investigue antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add migration/legacy_import/products_parser.py migration/tests/report_builders.py migration/tests/test_products_parser.py
git commit -m "feat(migration): parser do relatório de produtos com calibração de colunas por página"
```

---

### Task 3: Regras de unidade e de categoria

**Files:**
- Create: `migration/legacy_import/product_rules.py`
- Create: `migration/tests/test_product_rules.py`

**Interfaces:**
- Consumes: `fold(value) -> str` de `legacy_import.normalize`.
- Produces:
  - `classify_unit(legacy_unit: str, name: str) -> str` (devolve `"kg"`, `"box"` ou `"unit"`)
  - `classify_category(name: str) -> str` (uma das 10 categorias; `"Outros"` por padrão)
  - `DEFAULT_CATEGORY = "Outros"`

As regras de categoria são uma lista **ordenada**: a primeira que casar vence, e as exceções (batata palha, leite de coco, "SALGADINHO QUEIJO"...) vêm antes das gerais. A lista foi calibrada contra os 770 nomes distintos do catálogo real.

- [ ] **Step 1: Escrever o teste que falha**

Create `migration/tests/test_product_rules.py`:

```python
import pytest

from legacy_import.product_rules import classify_category, classify_unit


@pytest.mark.parametrize(
    "legacy_unit,name,expected",
    [
        ("KG", "BANANA PRATA KG", "kg"),
        ("KG", "SACO CEBOLA 20KG", "kg"),  # coluna KG manda, mesmo com peso no nome
        ("UN", "UVA VITORIA KG", "kg"),  # descrição termina com KG
        ("GR", "AMENDOIM CRU C/ CASCA KG", "kg"),  # unidade errada no cadastro antigo
        ("CX", "UVA BALAIO FORA KG", "kg"),
        ("UN", "ALHO TRITUR DA LIA 1 KG", "unit"),  # "1 KG" é embalagem, não venda por peso
        ("UN", "ALHO TRITUR FELIZ 1KG", "unit"),
        ("CX", "CX DETERGENTE LIMPOL 500ML", "box"),
        ("SC", "SACO LARANJA 20KG", "box"),
        ("UN", "OVOS UND", "unit"),
        ("PCT", "BOLACHA COQ TWO 200G", "unit"),
        ("GR", "MAIONESE HELLMANNS SACHE 200G", "unit"),
        ("ML", "VINAGRE MINHOTO 500ML", "unit"),
        ("LT", "FEIJOADA ODERICH LT 420G", "unit"),  # LT é lata, não litro
        ("EMB", "OVOS VERM BD C/15", "unit"),
    ],
)
def test_classify_unit(legacy_unit, name, expected):
    assert classify_unit(legacy_unit, name) == expected


@pytest.mark.parametrize(
    "name,expected",
    [
        ("BANANA PRATA KG", "Frutas"),
        ("LARANJA CRAVO KG", "Frutas"),  # CRAVO da fruta não é o tempero
        ("MELANCIA KG", "Frutas"),  # MEL não casa dentro de MELANCIA
        ("POLPA MORANGO PRIM KG", "Frutas"),
        ("ALFACE CRESPO UND", "Verduras"),
        ("COUVE FLOR KG", "Legumes"),
        ("BATATA INGLESA KG", "Legumes"),
        ("PIMENTA CHEIRO KG", "Legumes"),  # pimenta fresca
        ("PIMENTAO VERDE KG", "Legumes"),
        ("BATATA PALHA RAINHA 80G", "Mercearia"),
        ("UVA PASSA KG", "Mercearia"),
        ("GOIABADA XAVANTE 250G", "Mercearia"),
        ("BROWNIE DUGUGA DOCE LEITE 95G", "Mercearia"),  # LEITE no nome não vira laticínio
        ("SALGADINHO QUEIJO CIA 150G", "Mercearia"),
        ("LEITE COCO SOCOCO 500ML", "Mercearia"),
        ("PIMENTA CONSERVA 300ML", "Mercearia"),
        ("VINAGTRE MINHOTO 250ML", "Mercearia"),  # erro de digitação do cadastro antigo
        ("MEL ZUMBI 700G", "Mercearia"),
        ("LEITE LIQ BETANIA 1LT", "Ovos e Laticínios"),
        ("OVOS TABIRA BD C/30", "Ovos e Laticínios"),
        ("QUEIJO MANTEIGA KG", "Ovos e Laticínios"),
        ("SAZON FRANGO 60G", "Temperos e Ervas"),
        ("PIMEMNTA MOIDA RONALDO 20G", "Temperos e Ervas"),
        ("PIMENTA DO REINO VERCOSA 70G", "Temperos e Ervas"),
        ("ALHO TRITURADO 160G", "Temperos e Ervas"),
        ("ALHO KG", "Legumes"),
        ("AGUA SANITARIA BRILUX AZUL", "Limpeza e Higiene"),
        ("AMACIANTE SONHO AZUL 500ML", "Limpeza e Higiene"),
        ("AMAC CARNE VERCOSA 100G", "Temperos e Ervas"),  # AMAC = amaciante de carne
        ("SACO LIXO PT 50LTS", "Limpeza e Higiene"),
        ("COPO DESC. IDEAL 250ML", "Descartáveis e Utilidades"),
        ("AGUA DE COCO 600ML", "Bebidas"),
        ("ADOCANTE ADOCYL 100ML", "Mercearia"),
        ("COCO VERDE GELADO", "Frutas"),
        ("DIVERSOS", "Outros"),
        ("A", "Outros"),
    ],
)
def test_classify_category(name, expected):
    assert classify_category(name) == expected
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd migration && python -m pytest tests/test_product_rules.py -q; cd ..
```
Expected: FAIL com `ModuleNotFoundError: No module named 'legacy_import.product_rules'`.

- [ ] **Step 3: Implementar**

Create `migration/legacy_import/product_rules.py`:

```python
"""Regras de unidade e de categoria dos produtos importados (funções puras)."""
import re

from legacy_import.normalize import fold

_NUMERIC = re.compile(r"[\d.,]+")


def classify_unit(legacy_unit: str, name: str) -> str:
    """Devolve o valor de UnitType do HortiFácil (kg / box / unit).

    `kg` se a unidade do Gestão Fácil for KG, ou se a descrição terminar com o
    token KG sem número antes (ex.: "UVA VITORIA KG"; "ALHO 1 KG" é embalagem e fica `unit`).
    `box` para CX e SC. Todo o resto (UN, PCT, PC, PT, EMB, GR, ML, LT, GF...) é `unit`.
    """
    unit = (legacy_unit or "").strip().upper()
    if unit == "KG":
        return "kg"
    tokens = fold(name).split()
    if tokens and tokens[-1] == "KG" and not (len(tokens) > 1 and _NUMERIC.fullmatch(tokens[-2])):
        return "kg"
    if unit in {"CX", "SC"}:
        return "box"
    return "unit"


DEFAULT_CATEGORY = "Outros"

# Ordem importa: a primeira regra que casar vence. Exceções específicas vêm antes das gerais.
# O texto comparado é `fold(nome)`: maiúsculo e sem acento.
_RULES: list[tuple[str, str]] = [
    # exceções: parecem fruta/legume/laticínio no nome, mas são outra coisa
    ("Mercearia", r"BATATA PALHA|LEITE (DE )?COCO|OLEO COCO|COCO RALADO|COCO SECO|COCADA|GOIABADA|"
                  r"BANANA PASSA|UVA PASSA|AMEIXA SECA|FRUTAS CRISTALIZADAS|EXTRATO TOM|CHAMPIGNON|"
                  r"MILHO (VD|TORRADO)|SARD|PASSA|MEL|NESCAU|ADOCANTE|MASSA MANDIOCA"),
    ("Mercearia", r"BISC\w*|BOLACHA|BOLCHA|BROWNIE|BOLINHO|BOLO|BROA|BROAS|DOCE|LOLITA|MASSA|ROSQ|"
                  r"KI PIMENTA|LANCHINHO|LAMB|SALGADINHO"),
    ("Legumes", r"PIMENTA (CHEIRO|DEDO MOCA|MALAGUETA|BIQUINHO GRAO) KG"),
    ("Limpeza e Higiene", r"AGUA SANIT\w*|ALCOOL|AMACIANTE|DESIFETANTE|DETERG\w*|ESPONJA|FLANELA|LA ACO|"
                          r"LIMPADOR|LUSTRA|PANO CHAO|PAPEL (HIG\w*|HING\w*|TOALHA)|POLIDOR|RODO|SABAO|"
                          r"SABONETE|SAB|SAO LIXO|SACO LIXO|TOALHA UMEDECIDA|VASSOURA|VEJA|PASTILHA|"
                          r"INSETICIDA|CREME DENTA[LI]|HIPLOCLORITO|BICARBONATO|BIRCABONATO"),
    ("Descartáveis e Utilidades", r"COPO|CANUDO|PALITO|GUARDANAPO|FOSFORO|ISQUEIRO|VELA|CARVAO|GELO|"
                                  r"FILTRO PAPEL|PAPEL ALUMINIO"),
    ("Bebidas", r"AGUA MINERAL|AGUA DIAMANTE|AGUA SANTA JOANA|AGUA DE COCO|ACHOC|CHA ICE|CHA LEAO|"
                r"COCA COLA|POWERADE"),
    ("Ovos e Laticínios", r"OVOS|LEITE|QUEIJO|MANTEIGA|MARGARINA|CREME LEITE|CREMOGEMA|FIAMBRE|KITUT"),
    ("Temperos e Ervas", r"ACAFRAO|ALECRIM|ALECRIN|AMAC|BOLDO|CAMOMILA|CANELA|CHIMICHURRI|COENTRO|COLORAL|"
                         r"COLORAU|COMINHO|CORRY|CRAVO INDIA|CURRY|EDU GUEDES|ERVA DOCE|GENGIBRE|HIBISCO|"
                         r"HORTELA|LEMON PEPPER|LOURO|MANJERICAO|OREGANO|PAPRICA|PEGA MARIDO|SALSA|SAL|SAZON|"
                         r"TEMP\w*|TOMILHO|CEBOLINHO|VINAGRETE|BREDO|"
                         r"PIM\w*TA (MOIDA|GRAO|REINO|DO REINO|CALAB\w*|CASEIRA)|"
                         r"ALHO (FRITO|FLOCOS|TRITUR\w*|CEBOLA E SALSA|CREMOSO)"),
    ("Mercearia", r"PIMENTA \w+ .*(ML|CONSERVA)|PIMENTA (CONSERVA|ARTESANAL|1 CAROLINA|KOISA|MIXTA|MISTA|"
                  r"CHORA|PREMIUM|MALAGUETA CHORA)|MOLHO|ACUCAR|AMENDOAS|AMENDOIM|ARROZ|AVEIA|AZEITE|"
                  r"AZEITONA?S?|CAFE|CASTANHA|CAT CHUP|CHARQUE|DUETO|ERVILHA|FARINHA|FAROFA|FEIJAO|FEIJOADA|"
                  r"FERMENTO|FLOCAO|GOMA|GRANOLA|KNNOR|MACARRAO|MAIONESE|MIOJO|MOSTARDA|MUCILON|NOZES|OLEO|"
                  r"PACOCA|PISTACHE|QUEBRA QUEIXO|RAPADURA|SALGADINHO|SEMENTE|TAMARA|TARECO|TRIGO|VINAG\w+|"
                  r"XAROPE|DAMASCO|NEGO BOM|CHA|PIMENTA"),
    ("Verduras", r"ALFACE|ACELGA|AGRIAO|BROCOLIS|COUVE FOLHA|ESPINAFRE|RUCULA|REPOLHO\w*"),
    ("Legumes", r"ABOBRINHA|ABORBORA|BATATA|BERIJELA|BETERRABA|CEBOLA|CENOURA|CHUCHU|COUVE FLOR|INHAME|JILO|"
                r"MACAXEIRA|MANDIOQUINHA|MAXIXE|MORANGA|NABO|PEPINO|PIMENTAO|QUIABO|TOMATE|VAGEM|JERIMUN|"
                r"MILHO VERDE|MAO (DE )?MILHO|FEIJAO VERDE|SALSAO|COGUMELO|ALHO|CARA|JACAREZINHO"),
    ("Frutas", r"ABACATE|ABACAXI|ACEROLA|AMEIXA|ATIMOIA|BANANA|CAJU|CAQUI|CARAMBOLA|CEREJA|COCO VERDE|FIGO|"
               r"GOIABA|GRAVIOLA|JABUTICABA|JACA|JAMBO|KIWI|LARANJA|LIMAO|MACA|MACAIBA|MAMAO|MANGA|MANGABA|"
               r"MARACUJA|MELANCIA|MELAO|MORANGO|NECTARINA|PERA|PESSEGO|PHYSALIS|PINHA|PITAYA|PITOMBA|"
               r"RAMBOTA[NM]|ROMA|SAPOTI|SERIGUELA|TAMARINDO|TANGERINA|UMBU|UVA|CUPUACU|CAJA|POLPA|POLKPA"),
]
# `\b(?:...)\b` em volta de cada regra garante palavra inteira (MEL não casa MELANCIA).
_COMPILED = [(category, re.compile(rf"\b(?:{pattern})\b")) for category, pattern in _RULES]


def classify_category(name: str) -> str:
    folded = fold(name)
    for category, pattern in _COMPILED:
        if pattern.search(folded):
            return category
    return DEFAULT_CATEGORY
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd migration && python -m pytest tests/test_product_rules.py -q; cd ..
```
Expected: todos passam (51 casos), 0 failed.

- [ ] **Step 5: Conferir a distribuição contra o catálogo real**

```bash
TMP=$(mktemp -d)
pdftotext -enc UTF-8 -layout "Produtos Novo.pdf" "$TMP/produtos.txt"
cd migration && python - "$TMP/produtos.txt" <<'EOF'
import sys, collections
from legacy_import.products_parser import parse_products_text
from legacy_import.product_rules import classify_category, classify_unit
r = parse_products_text(open(sys.argv[1], encoding="utf-8").read())
cats = collections.Counter(classify_category(p.name) for p in r.products)
for name, n in cats.most_common(): print(f"{name}: {n}")
print("unidades:", dict(collections.Counter(classify_unit(p.legacy_unit, p.name) for p in r.products)))
outros = sorted({p.name for p in r.products if classify_category(p.name) == "Outros"})
print("Outros:", " | ".join(outros))
EOF
cd ..
```
Expected:
```
Mercearia: 272
Temperos e Ervas: 117
Frutas: 117
Limpeza e Higiene: 93
Legumes: 63
Outros: 48
Ovos e Laticínios: 35
Descartáveis e Utilidades: 31
Bebidas: 17
Verduras: 12
unidades: {'unit': 555, 'kg': 210, 'box': 40}
Outros: 1 | 10 | 11 | 23 | 5 | 6 | 7 | A | B | C | C. | DIVERSOS | K | L | M | O | P | R | S | T | U
```
Os 48 de "Outros" são nomes de uma letra, só números e "DIVERSOS": lixo do cadastro antigo, que a Task 5 lista em "Nomes suspeitos".

- [ ] **Step 6: Commit**

```bash
git add migration/legacy_import/product_rules.py migration/tests/test_product_rules.py
git commit -m "feat(migration): regras de unidade e de categoria por palavras-chave"
```

---

### Task 4: Parser de clientes e fusão de duplicados

**Files:**
- Create: `migration/legacy_import/customers_parser.py`
- Modify: `migration/tests/report_builders.py` (acrescentar `customer_block` e `customers_page`)
- Create: `migration/tests/test_customers_parser.py`

**Interfaces:**
- Consumes: `fold`, `format_document`, `format_phone`, `only_digits` de `legacy_import.normalize`.
- Produces:
  - `RawCustomer(legacy_code:int, source:str, document:str, ie:str, razao:str, fantasia:str, street:str, number:str, cep:str, bairro:str, cidade:str, uf:str, phones:tuple[str,...])`
  - `MergedCustomer(name:str, document:str, phone:str, address:str, notes:str, legacy_code:int, legacy_source:str)`
  - `Conflict(kind:str, detail:str)` com `kind` em `"dados-divergentes" | "codigo-repetido"`
  - `MergeResult(customers:list[MergedCustomer], skipped:list[str], conflicts:list[Conflict], duplicates_merged:int)`
  - `parse_customers_text(text: str, source: str) -> list[RawCustomer]`
  - `merge_customers(raws: list[RawCustomer]) -> MergeResult`
  - Em `tests/report_builders.py`: `customer_block(code, doc="", ie="", razao="", fantasia="", street="", number="", cep="", bairro="", cidade="", uf="", cel1="", fone1="", cel2="", fone2="") -> list[str]` e `customers_page(*blocks) -> str`

- [ ] **Step 1: Escrever os testes que falham**

Em `migration/tests/report_builders.py`, insira as duas funções abaixo **imediatamente antes** de `def page(`:

```python
def customer_block(code, doc="", ie="", razao="", fantasia="", street="", number="", cep="",
                   bairro="", cidade="", uf="", cel1="", fone1="", cel2="", fone2="") -> list[str]:
    """Um bloco de 'LISTAGEM DE PESSOAS' no formato do pdftotext -layout."""
    empty_fone, empty_cel = "( )         -", "( )                   -"
    return [
        f"CÓDIGO: {code}             CNPJ/CPF: {doc}        IE/RG: {ie}",
        "",
        f"RAZÃO: {razao}",
        "",
        f"FANTASIA: {fantasia}",
        "",
        f"ENDEREÇO {street}, {number}, CEP:{cep}",
        "",
        f"BAIRRO: {bairro:<35}CIDADE: {cidade}" + (f"      UF: {uf}" if uf else ""),
        f"FONE1: {fone1 or empty_fone}          CEL1: {cel1 or empty_cel}",
        f"FONE2: {fone2 or empty_fone}          CEL2: {cel2 or empty_cel}",
        "",
    ]


def customers_page(*blocks: list[str]) -> str:
    lines = ["GALEGO HORTIFRUTI", "", "LISTAGEM DE PESSOAS", "",
             "TIPO:Clientes | SITUAÇÃO:Todos | ORDENADO: Código", ""]
    for block in blocks:
        lines.extend(block)
    lines.append("Relatório emitido em 11/09/2026- 15:21:42     Pág.1")
    return "\n".join(lines) + "\n"
```

Create `migration/tests/test_customers_parser.py`:

```python
from legacy_import.customers_parser import merge_customers, parse_customers_text
from report_builders import customer_block, customers_page


def parse(*blocks, source="Clientes.pdf"):
    return parse_customers_text(customers_page(*blocks), source)


def test_full_block_is_parsed():
    block = customer_block(
        7, doc="12.345.678/0001-95", ie="1234567-89", razao="POUSADA EXEMPLO LTDA", fantasia="POUSADA EXEMPLO",
        street="RUA DAS FLORES", number="120", cep="55590000", bairro="CENTRO", cidade="IPOJUCA", uf="PE",
        cel1="(81) 9 8888-7777", fone1="(81) 3333-4444")
    (c,) = parse(block)
    assert c.legacy_code == 7
    assert c.document == "12.345.678/0001-95"
    assert c.ie == "1234567-89"
    assert (c.razao, c.fantasia) == ("POUSADA EXEMPLO LTDA", "POUSADA EXEMPLO")
    assert (c.street, c.number, c.cep) == ("RUA DAS FLORES", "120", "55590000")
    assert (c.bairro, c.cidade, c.uf) == ("CENTRO", "IPOJUCA", "PE")
    assert c.phones == ("(81) 98888-7777", "(81) 3333-4444")  # celular vem antes do fixo


def test_empty_fields_do_not_break_parsing():
    (c,) = parse(customer_block(9, razao="SONIA", fantasia="SONIA", cidade="RECIFE"))
    assert (c.document, c.street, c.number, c.cep, c.bairro) == ("", "", "", "", "")
    assert c.cidade == "RECIFE"
    assert c.phones == ()


def test_uf_is_read_from_the_city_line():
    (c,) = parse(customer_block(3, razao="MARIA", cidade="RECIFE", uf="PE"))
    assert (c.cidade, c.uf) == ("RECIFE", "PE")


def test_several_blocks_in_one_page():
    result = parse(customer_block(1, razao="UM"), customer_block(2, razao="DOIS"))
    assert [c.legacy_code for c in result] == [1, 2]


def test_merge_builds_address_notes_and_phone():
    raws = parse(customer_block(
        7, doc="123.456.789-01", ie="99", razao="JOSE DA SILVA", fantasia="ZE DO SITIO", street="RUA A", number="5",
        cep="55590000", bairro="CENTRO", cidade="IPOJUCA", uf="PE",
        cel1="(81) 9 8888-7777", fone1="(81) 3333-4444"))
    (c,) = merge_customers(raws).customers
    assert c.name == "JOSE DA SILVA"
    assert c.document == "123.456.789-01"
    assert c.phone == "(81) 98888-7777"
    assert c.address == "RUA A, 5 - CENTRO - IPOJUCA/PE - CEP 55590-000"
    assert c.notes == ("Gestão Fácil: cód. 7 (Clientes.pdf) | Fantasia: ZE DO SITIO | IE/RG: 99 | "
                       "Outros fones: (81) 3333-4444")
    assert (c.legacy_code, c.legacy_source) == (7, "Clientes.pdf")


def test_consumidor_final_is_skipped():
    result = merge_customers(parse(customer_block(0, razao="CONSUMIDOR FINAL"), customer_block(1, razao="ANA")))
    assert [c.name for c in result.customers] == ["ANA"]
    assert len(result.skipped) == 1


def test_identical_duplicate_across_pdfs_is_merged_silently():
    a = parse(customer_block(5, doc="123.456.789-01", razao="ANA", street="RUA B"), source="Clientes.pdf")
    b = parse(customer_block(5, doc="123.456.789-01", razao="ANA", street="RUA B"), source="Clientes 2.pdf")
    result = merge_customers(a + b)
    assert len(result.customers) == 1
    assert result.duplicates_merged == 1
    assert result.conflicts == []


def test_same_document_with_different_data_is_a_conflict_and_keeps_first():
    a = parse(customer_block(5, doc="123.456.789-01", razao="ANA LIMA", street="RUA B"), source="Clientes.pdf")
    b = parse(customer_block(9, doc="123.456.789-01", razao="ANA SOUZA", street="RUA C"), source="Clientes 2.pdf")
    result = merge_customers(a + b)
    assert [c.name for c in result.customers] == ["ANA LIMA"]
    assert [c.kind for c in result.conflicts] == ["dados-divergentes"]


def test_same_code_different_people_keeps_both_and_reports():
    a = parse(customer_block(5, doc="123.456.789-01", razao="ANA"), source="Clientes.pdf")
    b = parse(customer_block(5, doc="987.654.321-00", razao="BRUNO"), source="Clientes 2.pdf")
    result = merge_customers(a + b)
    assert sorted(c.name for c in result.customers) == ["ANA", "BRUNO"]
    assert [c.kind for c in result.conflicts] == ["codigo-repetido"]


def test_customers_without_document_are_matched_by_name_and_street():
    a = parse(customer_block(1, razao="DONA MARIA", street="RUA X"), source="Clientes.pdf")
    b = parse(customer_block(2, razao="Dona  Maria", street="rua x"), source="Clientes 2.pdf")
    c = parse(customer_block(3, razao="DONA MARIA", street="RUA Y"), source="Clientes 2.pdf")
    result = merge_customers(a + b + c)
    assert len(result.customers) == 2  # a e b são a mesma pessoa; c mora em outra rua
    assert result.duplicates_merged == 1
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd migration && python -m pytest tests/test_customers_parser.py -q; cd ..
```
Expected: FAIL com `ModuleNotFoundError: No module named 'legacy_import.customers_parser'`.

- [ ] **Step 3: Implementar**

Create `migration/legacy_import/customers_parser.py`:

```python
"""Parser do relatório 'LISTAGEM DE PESSOAS' (clientes) do Gestão Fácil e fusão de duplicados."""
import re
from dataclasses import dataclass

from legacy_import.normalize import fold, format_document, format_phone, only_digits

BLOCK_START = re.compile(r"(?=^CÓDIGO:\s*\d+\s+CNPJ)", re.MULTILINE)
CODE = re.compile(r"CÓDIGO:\s*(\d+)")
DOCUMENT = re.compile(r"CNPJ/CPF:\s*([\d./-]*)")
IE_RG = re.compile(r"IE/RG:[ \t]*(\S*)")
RAZAO = re.compile(r"^RAZÃO:[ \t]*(.*)$", re.MULTILINE)
FANTASIA = re.compile(r"^FANTASIA:[ \t]*(.*)$", re.MULTILINE)
ADDRESS = re.compile(r"^ENDEREÇO[ \t]*(.*?)[ \t]*,[ \t]*(.*?)[ \t]*,[ \t]*CEP:[ \t]*(\d*)", re.MULTILINE)
ADDRESS_FALLBACK = re.compile(r"^ENDEREÇO[ \t]*(.*)$", re.MULTILINE)
BAIRRO_CIDADE = re.compile(r"^BAIRRO:[ \t]*(.*?)[ \t]{2,}CIDADE:[ \t]*(.*)$", re.MULTILINE)
UF = re.compile(r"\bUF:[ \t]*([A-Z]{2})\b")
PHONE = re.compile(r"\b(FONE|CEL)(\d):[ \t]*(\([ \t]*\d{2}[ \t]*\)[\d \t-]*\d)")
GENERIC_NAMES = {"CONSUMIDOR FINAL"}


@dataclass(frozen=True)
class RawCustomer:
    legacy_code: int
    source: str
    document: str
    ie: str
    razao: str
    fantasia: str
    street: str
    number: str
    cep: str
    bairro: str
    cidade: str
    uf: str
    phones: tuple[str, ...]  # celulares primeiro, depois fixos; já formatados


@dataclass(frozen=True)
class MergedCustomer:
    name: str
    document: str
    phone: str
    address: str
    notes: str
    legacy_code: int
    legacy_source: str


@dataclass(frozen=True)
class Conflict:
    kind: str  # "dados-divergentes" | "codigo-repetido"
    detail: str


@dataclass(frozen=True)
class MergeResult:
    customers: list[MergedCustomer]
    skipped: list[str]
    conflicts: list[Conflict]
    duplicates_merged: int


def parse_customers_text(text: str, source: str) -> list[RawCustomer]:
    customers: list[RawCustomer] = []
    for block in BLOCK_START.split(text):
        code_match = CODE.match(block)
        if not code_match:
            continue
        street = number = cep = ""
        address = ADDRESS.search(block)
        if address:
            street, number, cep = address.group(1), address.group(2), address.group(3)
        else:
            fallback = ADDRESS_FALLBACK.search(block)
            street = fallback.group(1).strip() if fallback else ""

        bairro = cidade = ""
        place = BAIRRO_CIDADE.search(block)
        if place:
            bairro = place.group(1).strip()
            cidade = re.sub(r"\s+UF:.*$", "", place.group(2)).strip()
        uf = UF.search(block)

        phones = sorted(
            ((kind, int(index), only_digits(raw)) for kind, index, raw in PHONE.findall(block)),
            key=lambda item: (item[0] != "CEL", item[1]),
        )
        formatted = tuple(format_phone(d) for _, _, d in phones if len(d) >= 10)

        def first(pattern: re.Pattern) -> str:
            match = pattern.search(block)
            return match.group(1).strip() if match else ""

        customers.append(
            RawCustomer(
                legacy_code=int(code_match.group(1)),
                source=source,
                document=format_document(first(DOCUMENT)),
                ie=first(IE_RG),
                razao=first(RAZAO),
                fantasia=first(FANTASIA),
                street=street.strip(),
                number=number.strip(),
                cep=only_digits(cep),
                bairro=bairro,
                cidade=cidade,
                uf=uf.group(1) if uf else "",
                phones=formatted,
            )
        )
    return customers


def _identity(raw: RawCustomer) -> tuple:
    digits = only_digits(raw.document)
    if len(digits) in (11, 14):
        return ("doc", digits)
    return ("name", fold(raw.razao), fold(raw.street))


def _same_person_data(a: RawCustomer, b: RawCustomer) -> bool:
    return (fold(a.razao), fold(a.street), fold(a.bairro), set(a.phones)) == (
        fold(b.razao), fold(b.street), fold(b.bairro), set(b.phones))


def _address(raw: RawCustomer) -> str:
    parts = []
    street = ", ".join(p for p in (raw.street, raw.number) if p)
    if street:
        parts.append(street)
    if raw.bairro:
        parts.append(raw.bairro)
    city = "/".join(p for p in (raw.cidade, raw.uf) if p)
    if city:
        parts.append(city)
    if len(raw.cep) == 8:
        parts.append(f"CEP {raw.cep[:5]}-{raw.cep[5:]}")
    return " - ".join(parts)


def _notes(raw: RawCustomer) -> str:
    parts = [f"Gestão Fácil: cód. {raw.legacy_code} ({raw.source})"]
    if raw.fantasia and fold(raw.fantasia) != fold(raw.razao):
        parts.append(f"Fantasia: {raw.fantasia}")
    if raw.ie:
        parts.append(f"IE/RG: {raw.ie}")
    if len(raw.phones) > 1:
        parts.append("Outros fones: " + ", ".join(raw.phones[1:]))
    return " | ".join(parts)


def merge_customers(raws: list[RawCustomer]) -> MergeResult:
    """Deduplica por CPF/CNPJ (ou nome + endereço). Mantém o primeiro registro de cada identidade."""
    kept: dict[tuple, RawCustomer] = {}
    code_owner: dict[int, tuple] = {}
    skipped: list[str] = []
    conflicts: list[Conflict] = []
    duplicates = 0

    for raw in raws:
        if raw.legacy_code == 0 or fold(raw.razao) in GENERIC_NAMES:
            skipped.append(f"cód. {raw.legacy_code} ({raw.source}): {raw.razao or '(sem nome)'} — cliente genérico")
            continue
        if not raw.razao:
            skipped.append(f"cód. {raw.legacy_code} ({raw.source}): sem nome")
            continue

        key = _identity(raw)
        if key in kept:
            original = kept[key]
            if _same_person_data(original, raw):
                duplicates += 1
            else:
                conflicts.append(Conflict(
                    "dados-divergentes",
                    f"{raw.razao} (cód. {raw.legacy_code}, {raw.source}) repete a identidade de "
                    f"{original.razao} (cód. {original.legacy_code}, {original.source}) com dados diferentes; "
                    "mantido o primeiro"))
            continue

        owner = code_owner.get(raw.legacy_code)
        if owner is not None and owner != key:
            other = kept[owner]
            conflicts.append(Conflict(
                "codigo-repetido",
                f"cód. {raw.legacy_code} é {other.razao} em {other.source} e {raw.razao} em {raw.source}; "
                "são pessoas diferentes, os dois foram importados"))
        code_owner.setdefault(raw.legacy_code, key)
        kept[key] = raw

    customers = [
        MergedCustomer(
            name=raw.razao,
            document=raw.document,
            phone=raw.phones[0] if raw.phones else "",
            address=_address(raw),
            notes=_notes(raw),
            legacy_code=raw.legacy_code,
            legacy_source=raw.source,
        )
        for raw in kept.values()
    ]
    return MergeResult(customers=customers, skipped=skipped, conflicts=conflicts, duplicates_merged=duplicates)
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd migration && python -m pytest tests -q; cd ..
```
Expected: todos os testes da pasta passam, 0 failed (normalize + products_parser + product_rules + customers_parser).

- [ ] **Step 5: Conferir contra os PDFs reais**

```bash
TMP=$(mktemp -d)
pdftotext -enc UTF-8 -layout "Clientes.pdf" "$TMP/c1.txt"
pdftotext -enc UTF-8 -layout "Clientes 2.pdf" "$TMP/c2.txt"
cd migration && python - "$TMP/c1.txt" "$TMP/c2.txt" <<'EOF'
import sys, collections
from legacy_import.customers_parser import parse_customers_text, merge_customers
raws = []
for path, source in [(sys.argv[1], "Clientes.pdf"), (sys.argv[2], "Clientes 2.pdf")]:
    part = parse_customers_text(open(path, encoding="utf-8").read(), source)
    print(source, "registros:", len(part))
    raws += part
m = merge_customers(raws)
print("importáveis:", len(m.customers), "| ignorados:", len(m.skipped), "| duplicados idênticos fundidos:", m.duplicates_merged)
print("pontos de atenção:", dict(collections.Counter(c.kind for c in m.conflicts)))
print("com CPF/CNPJ:", sum(1 for c in m.customers if c.document), "| com telefone:", sum(1 for c in m.customers if c.phone))
EOF
cd ..
```
Expected:
```
Clientes.pdf registros: 47
Clientes 2.pdf registros: 59
importáveis: 94 | ignorados: 1 | duplicados idênticos fundidos: 5
pontos de atenção: {'codigo-repetido': 11, 'dados-divergentes': 6}
com CPF/CNPJ: 43 | com telefone: 28
```

- [ ] **Step 6: Commit**

```bash
git add migration/legacy_import/customers_parser.py migration/tests/report_builders.py migration/tests/test_customers_parser.py
git commit -m "feat(migration): parser de clientes com fusão de duplicados e pontos de atenção"
```

---

### Task 5: Exportação dos CSVs, relatório de revisão e CLI

**Files:**
- Create: `migration/legacy_import/export.py`
- Create: `migration/legacy_import/review.py`
- Create: `migration/legacy_import/cli.py`
- Create: `migration/parse_pdfs.py`
- Create: `migration/tests/test_export_review_cli.py`

**Interfaces:**
- Consumes (das tarefas 1–4): `ParsedProduct`, `Reject`, `parse_products_text`, `classify_unit`, `classify_category`, `MergedCustomer`, `MergeResult`, `Conflict`, `parse_customers_text`, `merge_customers`, `fold`.
- Produces:
  - `ExportProduct(code:int, barcode:str, name:str, unit_type:str, price:str, category:str, stock:str, legacy_unit:str, legacy_cost:str, legacy_stock:str, check:str, renamed_from:str)`
  - `build_export_products(parsed: list[ParsedProduct]) -> list[ExportProduct]`
  - `write_products_csv(path, products)`, `write_customers_csv(path, customers)`, `write_rejects_csv(path, rejects)`; constante `CSV_ENCODING = "utf-8-sig"`
  - `build_review_html(*, products, rejects, noise_groups, merge, raw_customer_count) -> str`
  - `run(customer_pdfs: list[Path], products_pdf: Path, out_dir: Path, extract=extract_text) -> dict[str, int]` com as chaves `customers_read, customers_ready, customers_skipped, customer_conflicts, products_ready, products_rejected, products_renamed`
  - `extract_text(pdf: Path, pdftotext: str = "pdftotext") -> str`; `main(argv=None) -> int`
  - Esses CSVs são o **contrato** consumido por `backend/import_legacy.py` (Task 6).

- [ ] **Step 1: Escrever os testes que falham**

Create `migration/tests/test_export_review_cli.py`:

```python
import csv
from decimal import Decimal
from pathlib import Path

import pytest

from legacy_import.cli import run
from legacy_import.customers_parser import Conflict, MergeResult
from legacy_import.export import CSV_ENCODING, build_export_products, write_products_csv
from legacy_import.products_parser import ParsedProduct, Reject
from legacy_import.review import build_review_html
from report_builders import customer_block, customers_page, page, row


def parsed(code, name, unit="UN", price="5.00", check="ok"):
    return ParsedProduct(code=code, barcode=None, name=name, legacy_unit=unit, price=Decimal(price),
                         legacy_cost=None, legacy_stock=None, check=check, line=1)


# ---------- export

def test_export_applies_rules_and_zero_stock():
    (row_,) = build_export_products([parsed(28, "UVA VITORIA KG", unit="CX", price="6.9")])
    assert (row_.code, row_.unit_type, row_.category, row_.stock, row_.price) == (28, "kg", "Frutas", "0", "6.90")


def test_duplicate_names_keep_lowest_code_and_suffix_the_rest():
    rows = build_export_products([parsed(30, "Alface"), parsed(10, "ALFACE"), parsed(20, "alface")])
    by_code = {r.code: r for r in rows}
    assert by_code[10].name == "ALFACE" and by_code[10].renamed_from == ""
    assert by_code[20].name == "alface (20)" and by_code[20].renamed_from == "alface"
    assert by_code[30].name == "Alface (30)" and by_code[30].renamed_from == "Alface"


def test_products_csv_roundtrip_is_utf8_with_bom(tmp_path: Path):
    path = tmp_path / "products.csv"
    write_products_csv(path, build_export_products([parsed(1, "MAÇÃ NACIONAL KG", unit="KG")]))
    assert path.read_bytes().startswith(b"\xef\xbb\xbf")
    with path.open(encoding=CSV_ENCODING, newline="") as handle:
        (record,) = list(csv.DictReader(handle))
    assert record["name"] == "MAÇÃ NACIONAL KG"
    assert list(record) == ["code", "barcode", "name", "unit_type", "price", "category", "stock",
                            "legacy_unit", "legacy_cost", "legacy_stock", "check", "renamed_from"]


# ---------- review

def test_review_lists_key_sections_and_escapes_html():
    products = build_export_products([parsed(1, "A"), parsed(2, "<b>X</b> KG", unit="KG", check="divergente")])
    html = build_review_html(
        products=products,
        rejects=[Reject(line=9, reason="sem preço", raw="linha <original>")],
        noise_groups=3,
        merge=MergeResult(customers=[], skipped=["cód. 0: CONSUMIDOR FINAL"],
                          conflicts=[Conflict("codigo-repetido", "detalhe")], duplicates_merged=2),
        raw_customer_count=5,
    )
    for expected in ["Produtos rejeitados (1)", "Nomes suspeitos", "Conferir o preço", "Categorias",
                     "Clientes ignorados (1)", "codigo-repetido"]:
        assert expected in html
    assert "linha &lt;original&gt;" in html
    assert "<b>X</b>" not in html


# ---------- cli de ponta a ponta com extrator falso

def test_run_writes_all_outputs(tmp_path: Path):
    customers_text = customers_page(
        customer_block(0, razao="CONSUMIDOR FINAL"),
        customer_block(1, doc="123.456.789-01", razao="ANA", street="RUA A"))
    products_text = page(
        [row(1, None, "BANANA PRATA KG", "KG", "5,00", "6,99", "10", "69,90")],
        [row(2, None, "SEM PRECO", "UN", "1,00", None, "3", "6,00")])
    texts = {"c.pdf": customers_text, "p.pdf": products_text}

    summary = run([Path("c.pdf")], Path("p.pdf"), tmp_path, extract=lambda pdf: texts[pdf.name])

    assert summary == {"customers_read": 2, "customers_ready": 1, "customers_skipped": 1,
                       "customer_conflicts": 0, "products_ready": 1, "products_rejected": 1,
                       "products_renamed": 0}
    for name in ["customers.csv", "products.csv", "rejects.csv", "review.html"]:
        assert (tmp_path / name).exists()
    with (tmp_path / "customers.csv").open(encoding=CSV_ENCODING, newline="") as handle:
        (customer,) = list(csv.DictReader(handle))
    assert customer["name"] == "ANA" and customer["document"] == "123.456.789-01"


def test_run_fails_loudly_when_a_pdf_has_no_customers_or_products(tmp_path: Path):
    good_customers = customers_page(customer_block(1, razao="ANA"))
    good_products = page([row(1, None, "ALFACE", "UN", "1,00", "2,50", "10", "25,00")])
    texts = {"c.pdf": good_customers, "p.pdf": good_products, "vazio.pdf": "texto qualquer\n"}

    with pytest.raises(SystemExit, match="Nenhum cliente"):
        run([Path("vazio.pdf")], Path("p.pdf"), tmp_path, extract=lambda pdf: texts[pdf.name])
    with pytest.raises(SystemExit, match="Nenhum produto"):
        run([Path("c.pdf")], Path("vazio.pdf"), tmp_path, extract=lambda pdf: texts[pdf.name])
    assert list(tmp_path.iterdir()) == []  # nada é escrito quando falha
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd migration && python -m pytest tests/test_export_review_cli.py -q; cd ..
```
Expected: FAIL com `ModuleNotFoundError: No module named 'legacy_import.cli'`.

- [ ] **Step 3: Implementar a exportação**

Create `migration/legacy_import/export.py`:

```python
"""Montagem das linhas de produto exportadas e escrita dos CSVs (contrato com o importador)."""
import csv
from dataclasses import asdict, dataclass, fields
from pathlib import Path

from legacy_import.customers_parser import MergedCustomer
from legacy_import.normalize import fold
from legacy_import.product_rules import classify_category, classify_unit
from legacy_import.products_parser import ParsedProduct, Reject

CSV_ENCODING = "utf-8-sig"  # abre certo no Excel; o importador lê com o mesmo encoding


@dataclass(frozen=True)
class ExportProduct:
    code: int
    barcode: str
    name: str
    unit_type: str
    price: str
    category: str
    stock: str
    legacy_unit: str
    legacy_cost: str
    legacy_stock: str
    check: str
    renamed_from: str


def build_export_products(parsed: list[ParsedProduct]) -> list[ExportProduct]:
    """Converte produtos lidos em linhas de CSV.

    Estoque entra sempre 0 (o do relatório é inconsistente). O nome de produto é único no
    HortiFácil (sem diferenciar maiúsculas): o de menor código mantém o nome, os demais ganham
    o sufixo " (código)" e o nome original vai para `renamed_from`.
    """
    seen: set[str] = set()
    rows: list[ExportProduct] = []
    for product in sorted(parsed, key=lambda p: p.code):
        name, renamed_from = product.name, ""
        if fold(name) in seen:
            name, renamed_from = f"{product.name} ({product.code})", product.name
        seen.add(fold(name))
        rows.append(
            ExportProduct(
                code=product.code,
                barcode=product.barcode or "",
                name=name,
                unit_type=classify_unit(product.legacy_unit, product.name),
                price=f"{product.price:.2f}",
                category=classify_category(product.name),
                stock="0",
                legacy_unit=product.legacy_unit,
                legacy_cost=product.legacy_cost or "",
                legacy_stock=product.legacy_stock or "",
                check=product.check,
                renamed_from=renamed_from,
            )
        )
    return rows


def _write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding=CSV_ENCODING, newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def write_products_csv(path: Path, products: list[ExportProduct]) -> None:
    _write_csv(path, [f.name for f in fields(ExportProduct)], [asdict(p) for p in products])


def write_customers_csv(path: Path, customers: list[MergedCustomer]) -> None:
    _write_csv(path, [f.name for f in fields(MergedCustomer)], [asdict(c) for c in customers])


def write_rejects_csv(path: Path, rejects: list[Reject]) -> None:
    _write_csv(path, ["line", "reason", "raw"], [asdict(r) for r in rejects])
```

- [ ] **Step 4: Implementar o relatório de revisão**

Create `migration/legacy_import/review.py`:

```python
"""Relatório de revisão em HTML: tudo que o usuário precisa conferir antes de importar."""
import re
from collections import Counter
from html import escape

from legacy_import.customers_parser import MergeResult
from legacy_import.export import ExportProduct
from legacy_import.normalize import fold
from legacy_import.products_parser import Reject

_NAIVE_UNIT = {"KG": "kg", "CX": "box", "SC": "box"}
_STYLE = (
    "body{font:14px/1.4 system-ui,sans-serif;margin:24px;max-width:1100px}"
    "table{border-collapse:collapse;margin:8px 0 20px}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}"
    "th{background:#f3f3f3}.warn{color:#b45309}details{margin:6px 0}pre{margin:0;white-space:pre-wrap}"
)


def _table(headers: list[str], rows: list[list]) -> str:
    head = "".join(f"<th>{escape(str(h))}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{escape(str(c))}</td>" for c in row) + "</tr>" for row in rows)
    return f"<table><tr>{head}</tr>{body}</table>"


def _section(title: str, content: str) -> str:
    return f"<h2>{escape(title)}</h2>{content}"


def _is_suspicious_name(name: str) -> bool:
    compact = fold(name).replace(" ", "")
    return len(compact) <= 2 or re.fullmatch(r"[\d\W]+", compact) is not None


def build_review_html(
    *,
    products: list[ExportProduct],
    rejects: list[Reject],
    noise_groups: int,
    merge: MergeResult,
    raw_customer_count: int,
) -> str:
    sections: list[str] = []

    # --- resumo
    checks = Counter(p.check for p in products)
    summary = [
        ["Produtos prontos para importar", len(products)],
        ["Produtos rejeitados (não entram)", len(rejects)],
        ["Fragmentos numéricos soltos descartados", noise_groups],
        ["Conta estoque × preço confere", checks.get("ok", 0)],
        ["Conta estoque × preço diverge", checks.get("divergente", 0)],
        ["Sem dados para a conta", checks.get("sem-dados", 0)],
        ["Clientes lidos nos PDFs", raw_customer_count],
        ["Clientes prontos para importar", len(merge.customers)],
        ["Clientes ignorados", len(merge.skipped)],
        ["Duplicados idênticos fundidos", merge.duplicates_merged],
        ["Pontos de atenção em clientes", len(merge.conflicts)],
    ]
    sections.append(_section("Resumo", _table(["Item", "Quantidade"], summary)))

    # --- produtos
    sections.append(_section(
        f"Produtos rejeitados ({len(rejects)})",
        _table(["Linha do texto", "Motivo", "Texto original"], [[r.line, r.reason, r.raw] for r in rejects])
        if rejects else "<p>Nenhum.</p>"))

    renamed = [p for p in products if p.renamed_from]
    sections.append(_section(
        f"Nomes duplicados, renomeados com o código ({len(renamed)})",
        _table(["Código", "Nome original", "Novo nome"], [[p.code, p.renamed_from, p.name] for p in renamed])
        if renamed else "<p>Nenhum.</p>"))

    suspicious = [p for p in products if _is_suspicious_name(p.name)]
    sections.append(_section(
        f"Nomes suspeitos: 2 letras ou menos, ou só números ({len(suspicious)})",
        _table(["Código", "Nome", "Preço", "Unidade"], [[p.code, p.name, p.price, p.legacy_unit] for p in suspicious])
        if suspicious else "<p>Nenhum.</p>"))

    unit_counts = Counter((p.legacy_unit, p.unit_type) for p in products)
    sections.append(_section(
        "Unidade: do Gestão Fácil para o HortiFácil",
        _table(["Unidade antiga", "Unidade nova", "Produtos"],
               [[old, new, n] for (old, new), n in sorted(unit_counts.items())])))
    changed = [p for p in products if p.unit_type != _NAIVE_UNIT.get(p.legacy_unit, "unit")]
    sections.append(_section(
        f"Unidade decidida pela descrição, diferente da coluna antiga ({len(changed)})",
        _table(["Código", "Nome", "Unidade antiga", "Unidade nova"],
               [[p.code, p.name, p.legacy_unit, p.unit_type] for p in changed])
        if changed else "<p>Nenhum.</p>"))

    by_category: dict[str, list[ExportProduct]] = {}
    for p in products:
        by_category.setdefault(p.category, []).append(p)
    listing = "".join(
        f"<details><summary>{escape(cat)} ({len(items)})</summary>"
        + _table(["Código", "Nome", "Preço"], [[p.code, p.name, p.price] for p in items]) + "</details>"
        for cat, items in sorted(by_category.items(), key=lambda kv: -len(kv[1])))
    sections.append(_section("Categorias (classificação por palavras-chave)", listing))

    divergent = [p for p in products if p.check == "divergente"]
    sections.append(_section(
        f"Conferir o preço: estoque × preço não bate com o total impresso ({len(divergent)})",
        "<p>O estoque do relatório vem quebrado em várias linhas, então quase sempre é só isso; "
        "vale olhar o preço de cada um.</p>"
        + (_table(["Código", "Nome", "Preço lido", "Estoque impresso"],
                  [[p.code, p.name, p.price, p.legacy_stock] for p in divergent]) if divergent else "")))

    # --- clientes
    sections.append(_section(
        f"Clientes ignorados ({len(merge.skipped)})",
        "<ul>" + "".join(f"<li>{escape(s)}</li>" for s in merge.skipped) + "</ul>" if merge.skipped else "<p>Nenhum.</p>"))
    sections.append(_section(
        f"Clientes: pontos de atenção ({len(merge.conflicts)})",
        _table(["Tipo", "Detalhe"], [[c.kind, c.detail] for c in merge.conflicts])
        if merge.conflicts else "<p>Nenhum.</p>"))
    with_doc = sum(1 for c in merge.customers if c.document)
    with_phone = sum(1 for c in merge.customers if c.phone)
    with_address = sum(1 for c in merge.customers if c.address)
    sections.append(_section("Clientes: preenchimento", _table(
        ["Campo", "Preenchidos"], [["CPF/CNPJ", with_doc], ["Telefone", with_phone], ["Endereço", with_address]])))

    return (
        f"<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'>"
        f"<title>Revisão da migração</title><style>{_STYLE}</style></head><body>"
        f"<h1>Revisão da migração Gestão Fácil → HortiFácil</h1>" + "".join(sections) + "</body></html>"
    )
```

- [ ] **Step 5: Implementar o CLI e o ponto de entrada**

Create `migration/legacy_import/cli.py`:

```python
"""Orquestra a etapa 1: PDFs -> customers.csv, products.csv, rejects.csv e review.html."""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Callable

from legacy_import.customers_parser import merge_customers, parse_customers_text
from legacy_import.export import (
    build_export_products,
    write_customers_csv,
    write_products_csv,
    write_rejects_csv,
)
from legacy_import.products_parser import parse_products_text
from legacy_import.review import build_review_html

DEFAULT_OUT = Path(__file__).resolve().parents[1] / "out"


def extract_text(pdf: Path, pdftotext: str = "pdftotext") -> str:
    """Texto do PDF preservando o layout de colunas, sempre em UTF-8."""
    if shutil.which(pdftotext) is None and not Path(pdftotext).exists():
        raise SystemExit(
            "pdftotext não encontrado. Instale o poppler (Windows: `winget install poppler`; ou use o "
            "Git Bash, que já inclui) ou passe o caminho com --pdftotext."
        )
    result = subprocess.run(
        [pdftotext, "-enc", "UTF-8", "-layout", str(pdf), "-"], capture_output=True, check=True
    )
    return result.stdout.decode("utf-8")


def run(
    customer_pdfs: list[Path],
    products_pdf: Path,
    out_dir: Path,
    extract: Callable[[Path], str] = extract_text,
) -> dict[str, int]:
    raw_customers = []
    for pdf in customer_pdfs:
        raw_customers.extend(parse_customers_text(extract(pdf), pdf.name))
    if not raw_customers:
        raise SystemExit("Nenhum cliente encontrado nos PDFs de clientes. Confira se são mesmo a 'Listagem de pessoas'.")
    merge = merge_customers(raw_customers)

    parsed = parse_products_text(extract(products_pdf))
    if not parsed.products and not parsed.rejects:
        raise SystemExit("Nenhum produto encontrado no PDF de produtos. Confira se é mesmo a 'Listagem de produtos'.")
    products = build_export_products(parsed.products)

    out_dir.mkdir(parents=True, exist_ok=True)
    write_customers_csv(out_dir / "customers.csv", merge.customers)
    write_products_csv(out_dir / "products.csv", products)
    write_rejects_csv(out_dir / "rejects.csv", parsed.rejects)
    (out_dir / "review.html").write_text(
        build_review_html(
            products=products,
            rejects=parsed.rejects,
            noise_groups=parsed.noise_groups,
            merge=merge,
            raw_customer_count=len(raw_customers),
        ),
        encoding="utf-8",
    )
    return {
        "customers_read": len(raw_customers),
        "customers_ready": len(merge.customers),
        "customers_skipped": len(merge.skipped),
        "customer_conflicts": len(merge.conflicts),
        "products_ready": len(products),
        "products_rejected": len(parsed.rejects),
        "products_renamed": sum(1 for p in products if p.renamed_from),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Converte os PDFs do Gestão Fácil em CSVs para importação.")
    parser.add_argument("--customers", nargs="+", required=True, type=Path, help="PDFs de clientes")
    parser.add_argument("--products", required=True, type=Path, help="PDF de produtos")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="pasta de saída (padrão: migration/out)")
    parser.add_argument("--pdftotext", default="pdftotext", help="caminho do executável pdftotext")
    args = parser.parse_args(argv)

    summary = run(
        args.customers, args.products, args.out, extract=lambda pdf: extract_text(pdf, args.pdftotext)
    )
    print(f"Clientes: {summary['customers_read']} lidos, {summary['customers_ready']} prontos, "
          f"{summary['customers_skipped']} ignorados, {summary['customer_conflicts']} pontos de atenção")
    print(f"Produtos: {summary['products_ready']} prontos, {summary['products_rejected']} rejeitados, "
          f"{summary['products_renamed']} renomeados por nome duplicado")
    print(f"Saída em {args.out}. Abra review.html e confira antes de importar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Create `migration/parse_pdfs.py`:

```python
"""Ponto de entrada: python migration/parse_pdfs.py --customers "Clientes.pdf" "Clientes 2.pdf" --products "Produtos Novo.pdf" """
import sys

from legacy_import.cli import main

if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 6: Rodar toda a suíte**

```bash
cd migration && python -m pytest tests -q; cd ..
```
Expected: `82 passed`.

- [ ] **Step 7: Rodar de ponta a ponta com os PDFs reais**

```bash
python migration/parse_pdfs.py --customers "Clientes.pdf" "Clientes 2.pdf" --products "Produtos Novo.pdf"
ls migration/out
```
Expected (o console do Windows pode mostrar `�` nos acentos; os arquivos ficam em UTF-8):
```
Clientes: 106 lidos, 94 prontos, 1 ignorados, 17 pontos de atenção
Produtos: 805 prontos, 0 rejeitados, 35 renomeados por nome duplicado
Saída em .../migration/out. Abra review.html e confira antes de importar.
customers.csv  products.csv  rejects.csv  review.html
```
Confira: `products.csv` tem 806 linhas (cabeçalho + 805) e `customers.csv` tem 95. Abra `migration/out/review.html` no navegador e confirme que as seções (Resumo, rejeitados, nomes duplicados, nomes suspeitos, unidades, categorias, preços a conferir, clientes) aparecem e que o resumo bate com os números acima. `migration/out/` está no `.gitignore`.

- [ ] **Step 8: Commit**

```bash
git add migration/legacy_import/export.py migration/legacy_import/review.py migration/legacy_import/cli.py migration/parse_pdfs.py migration/tests/test_export_review_cli.py
git commit -m "feat(migration): CSVs, relatório de revisão e CLI de conversão dos PDFs"
```
Antes de commitar, `git status --short` **não** deve listar nada de `migration/out/`.

---

### Task 6: Importador no backend (leitura de CSV, plano e gravação)

**Files:**
- Create: `backend/import_legacy.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_import_legacy.py`

**Interfaces:**
- Consumes: os CSVs da Task 5 (colunas exatas nas Global Constraints; o importador ignora `legacy_*`, `check`, `renamed_from` e `legacy_code`/`legacy_source`).
- Produces (parte pura, testada aqui):
  - `ProductRow(code:int, name:str, barcode:str|None, unit_type:str, price:Decimal, category:str, stock:Decimal)`, `CustomerRow(name, document, phone, address, notes)` (todos `str|None` exceto `name`)
  - `ExistingProduct(code, name)`, `ExistingCustomer(name, document, address)`
  - `Plan(products_new, products_skipped, conflicts, customers_new, customers_skipped, categories_new)`
  - `read_products(path) -> list[ProductRow]`, `read_customers(path) -> list[CustomerRow]` (levantam `CsvError` com **todas** as linhas ruins)
  - `find_internal_conflicts(products) -> list[str]`
  - `build_plan(products, customers, existing_products, existing_customers, existing_categories) -> Plan`
  - `format_plan(plan, *, apply: bool, clear_counts: dict[str,int] | None) -> str`
- Produces (parte de banco, validada na Task 7): `run_import(products, customers, *, apply, clear_test_data, confirm=...) -> int` e `main(argv=None) -> int`, com códigos de saída 0 ok, 1 conflitos ou confirmação não dada, 2 CSV inválido, 3 erro ao gravar.

- [ ] **Step 1: Escrever os testes que falham**

Create `backend/tests/conftest.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
```

Create `backend/tests/test_import_legacy.py`:

```python
import csv
from decimal import Decimal
from pathlib import Path

import pytest

from import_legacy import (
    CsvError,
    CustomerRow,
    ExistingCustomer,
    ExistingProduct,
    ProductRow,
    build_plan,
    find_internal_conflicts,
    format_plan,
    read_customers,
    read_products,
)

PRODUCT_COLUMNS = ["code", "barcode", "name", "unit_type", "price", "category", "stock"]
CUSTOMER_COLUMNS = ["name", "document", "phone", "address", "notes"]


def write_csv(path: Path, columns: list[str], rows: list[dict]) -> Path:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    return path


def product(code=1, name="BANANA PRATA KG", unit="kg", price="6.99", category="Frutas") -> ProductRow:
    return ProductRow(code, name, None, unit, Decimal(price), category, Decimal("0"))


def prow(**overrides) -> dict:
    base = {"code": "1", "barcode": "", "name": "BANANA PRATA KG", "unit_type": "kg", "price": "6.99",
            "category": "Frutas", "stock": "0"}
    return {**base, **overrides}


# ---------- leitura de CSV

def test_read_products_parses_valid_rows(tmp_path):
    path = write_csv(tmp_path / "p.csv", PRODUCT_COLUMNS, [prow(), prow(code="2", name="MAÇÃ", barcode="789")])
    rows = read_products(path)
    assert [r.code for r in rows] == [1, 2]
    assert rows[1].barcode == "789" and rows[0].barcode is None
    assert rows[0].price == Decimal("6.99")


def test_read_products_accepts_excel_ptbr_csv(tmp_path):
    """O Excel em português salva com ';', vírgula decimal e (às vezes) em cp1252."""
    text = ("code;barcode;name;unit_type;price;category;stock\r\n"
            "1;;MAÇÃ NACIONAL KG;kg;1.234,56;Frutas;0\r\n"
            "2;;BANANA;kg;6,99;Frutas;0\r\n")
    path = tmp_path / "excel.csv"
    path.write_bytes(text.encode("cp1252"))
    rows = read_products(path)
    assert [r.name for r in rows] == ["MAÇÃ NACIONAL KG", "BANANA"]
    assert [r.price for r in rows] == [Decimal("1234.56"), Decimal("6.99")]


def test_read_products_reports_every_bad_line_with_its_number(tmp_path):
    path = write_csv(tmp_path / "p.csv", PRODUCT_COLUMNS, [
        prow(unit_type="dozen"), prow(code="2", price="0.00"), prow(code="x"), prow(code="4", name=" ")])
    with pytest.raises(CsvError) as info:
        read_products(path)
    message = str(info.value)
    assert "linha 2" in message and "unit_type inválido" in message
    assert "linha 3" in message and "preço" in message
    assert "linha 4" in message
    assert "linha 5" in message and "nome vazio" in message


def test_read_products_rejects_missing_columns(tmp_path):
    path = write_csv(tmp_path / "p.csv", ["code", "name"], [{"code": "1", "name": "X"}])
    with pytest.raises(CsvError, match="faltam as colunas"):
        read_products(path)


def test_read_customers_and_validation(tmp_path):
    ok = write_csv(tmp_path / "c.csv", CUSTOMER_COLUMNS, [
        {"name": "ANA", "document": "123.456.789-01", "phone": "", "address": "RUA A", "notes": "n"}])
    (row,) = read_customers(ok)
    assert (row.name, row.document, row.phone, row.address) == ("ANA", "123.456.789-01", None, "RUA A")

    bad = write_csv(tmp_path / "b.csv", CUSTOMER_COLUMNS, [
        {"name": "", "document": "", "phone": "", "address": "", "notes": ""},
        {"name": "BIA", "document": "1" * 21, "phone": "", "address": "", "notes": ""}])
    with pytest.raises(CsvError) as info:
        read_customers(bad)
    assert "linha 2" in str(info.value) and "linha 3" in str(info.value)


def test_internal_conflicts_detect_duplicate_code_and_name():
    rows = [product(1, "ALFACE"), product(1, "COUVE"), product(2, "alface")]
    conflicts = find_internal_conflicts(rows)
    assert any("código 1 repetido" in c for c in conflicts)
    assert any("nome 'alface' repetido" in c for c in conflicts)


# ---------- plano

def test_plan_creates_everything_on_an_empty_database():
    plan = build_plan([product(1), product(2, "MAÇÃ", category="Frutas")], [CustomerRow("ANA", None, None, None, None)],
                      [], [], [])
    assert len(plan.products_new) == 2 and plan.products_skipped == [] and plan.conflicts == []
    assert plan.categories_new == ["Frutas"]
    assert len(plan.customers_new) == 1


def test_plan_is_idempotent_for_already_imported_rows():
    plan = build_plan([product(1)], [], [ExistingProduct(1, "banana prata kg")], [], ["Frutas"])
    assert plan.products_new == [] and len(plan.products_skipped) == 1 and plan.conflicts == []


def test_plan_conflicts_on_same_code_with_different_name():
    plan = build_plan([product(1, "BANANA")], [], [ExistingProduct(1, "Alface Crespa")], [], [])
    assert plan.products_new == []
    assert plan.conflicts == ["código 1: já existe 'Alface Crespa' no HortiFácil e o CSV traz 'BANANA'"]


def test_plan_conflicts_on_same_name_with_different_code():
    plan = build_plan([product(50, "Banana Prata")], [], [ExistingProduct(3, "BANANA PRATA")], [], [])
    assert plan.products_new == []
    assert len(plan.conflicts) == 1 and "já existe no HortiFácil com o código 3" in plan.conflicts[0]


def test_plan_creates_only_missing_categories_case_insensitively():
    plan = build_plan([product(1, category="frutas"), product(2, "X", category="Legumes"),
                       product(3, "Y", category="Legumes")], [], [], [], ["Frutas"])
    assert plan.categories_new == ["Legumes"]


def test_plan_skips_customers_that_already_exist():
    existing = [ExistingCustomer("ANA LIMA", "123.456.789-01", None), ExistingCustomer("DONA MARIA", None, "Rua X")]
    customers = [
        CustomerRow("ANA L.", "12345678901", None, None, None),      # mesmo CPF, formatação diferente
        CustomerRow("dona  maria", None, None, "RUA X", None),      # mesmo nome + endereço
        CustomerRow("BRUNO", "987.654.321-00", None, None, None),   # novo
    ]
    plan = build_plan([], customers, [], existing, [])
    assert [c.name for c in plan.customers_new] == ["BRUNO"]
    assert len(plan.customers_skipped) == 2


def test_format_plan_mentions_conflicts_counts_and_mode():
    plan = build_plan([product(1, "BANANA")], [], [ExistingProduct(1, "Alface")], [], [])
    text = format_plan(plan, apply=False, clear_counts={"produtos": 12, "pedidos": 3})
    assert "produtos: 12" in text and "pedidos: 3" in text
    assert "CONFLITOS (1)" in text
    assert "dry-run" in text
    assert "APLICAR" in format_plan(plan, apply=True, clear_counts=None)
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd backend && python -m pytest tests -q; cd ..
```
Expected: FAIL com `ModuleNotFoundError: No module named 'import_legacy'`. (Usa o pytest do venv de `migration/`; o importador puro só precisa da biblioteca padrão.)

- [ ] **Step 3: Implementar o importador**

Create `backend/import_legacy.py`:

```python
"""
Importa clientes e produtos do Gestão Fácil a partir dos CSVs gerados por migration/parse_pdfs.py.

Uso (dentro do container da API, com os CSVs copiados por `docker cp`):

  python import_legacy.py --customers customers.csv --products products.csv            # dry-run (padrão)
  python import_legacy.py --customers customers.csv --products products.csv --apply
  python import_legacy.py --customers customers.csv --products products.csv --apply --clear-test-data

- Sem --apply nada é gravado: só imprime o plano e os conflitos.
- --apply grava tudo em UMA transação (entra tudo ou nada). Nunca sobrescreve o que já existe.
- --clear-test-data apaga pedidos, itens, contas a receber, perdas de estoque, produtos e clientes
  na mesma transação, depois de mostrar as contagens e pedir para digitar APAGAR.
  Usuários e categorias são preservados.

A parte pura (leitura de CSV e plano) não importa `app`, então roda sem banco.
"""
import argparse
import asyncio
import csv
import io
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Callable

VALID_UNIT_TYPES = {"unit", "kg", "gram", "liter", "box", "bunch"}  # valores de app.models.product.UnitType
CSV_ENCODING = "utf-8-sig"
CONFIRM_WORD = "APAGAR"
MAX_PRICE = Decimal("99999999.99")  # Numeric(10, 2)


class CsvError(Exception):
    pass


@dataclass(frozen=True)
class ProductRow:
    code: int
    name: str
    barcode: str | None
    unit_type: str
    price: Decimal
    category: str
    stock: Decimal


@dataclass(frozen=True)
class CustomerRow:
    name: str
    document: str | None
    phone: str | None
    address: str | None
    notes: str | None


@dataclass(frozen=True)
class ExistingProduct:
    code: int
    name: str


@dataclass(frozen=True)
class ExistingCustomer:
    name: str
    document: str | None
    address: str | None


@dataclass
class Plan:
    products_new: list[ProductRow] = field(default_factory=list)
    products_skipped: list[ProductRow] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)
    customers_new: list[CustomerRow] = field(default_factory=list)
    customers_skipped: list[CustomerRow] = field(default_factory=list)
    categories_new: list[str] = field(default_factory=list)


# ----------------------------------------------------------------------------- leitura de CSV

def fold(value: str | None) -> str:
    """Maiúsculas, sem acento, espaços colapsados (mesma regra do parser em migration/)."""
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip().upper()


def _read_text(path: Path) -> str:
    """UTF-8 (com ou sem BOM); se o arquivo foi salvo pelo Excel em cp1252, cai para cp1252."""
    try:
        return path.read_text(encoding=CSV_ENCODING)
    except UnicodeDecodeError:
        return path.read_text(encoding="cp1252")


def _read_rows(path: Path, required: list[str]) -> list[tuple[int, dict[str, str]]]:
    text = _read_text(path)
    header = text.splitlines()[0] if text.strip() else ""
    delimiter = ";" if header.count(";") > header.count(",") else ","  # Excel pt-BR salva com ";"
    reader = csv.DictReader(io.StringIO(text, newline=""), delimiter=delimiter)
    missing = [c for c in required if c not in (reader.fieldnames or [])]
    if missing:
        raise CsvError(f"{path.name}: faltam as colunas {', '.join(missing)}")
    return [(line, row) for line, row in enumerate(reader, start=2)]


def _parse_decimal(text: str) -> Decimal:
    """Aceita 6.99 e o formato brasileiro do Excel (1.234,56)."""
    value = text.strip()
    if "," in value:
        value = value.replace(".", "").replace(",", ".")
    return Decimal(value)


def read_products(path: Path) -> list[ProductRow]:
    rows: list[ProductRow] = []
    errors: list[str] = []
    for line, r in _read_rows(path, ["code", "name", "barcode", "unit_type", "price", "category", "stock"]):
        try:
            code = int(r["code"])
            if code <= 0:
                raise ValueError("código deve ser maior que zero")
            name = r["name"].strip()
            if not name or len(name) > 255:
                raise ValueError("nome vazio ou com mais de 255 caracteres")
            unit_type = r["unit_type"].strip()
            if unit_type not in VALID_UNIT_TYPES:
                raise ValueError(f"unit_type inválido: {unit_type!r}")
            price = _parse_decimal(r["price"])
            if price <= 0 or price > MAX_PRICE:
                raise ValueError(f"preço fora do intervalo aceito: {r['price']}")
            stock = _parse_decimal(r["stock"] or "0")
            if stock < 0:
                raise ValueError("estoque negativo")
            category = r["category"].strip()
            if not category or len(category) > 100:
                raise ValueError("categoria vazia ou com mais de 100 caracteres")
            barcode = r["barcode"].strip() or None
            if barcode and len(barcode) > 50:
                raise ValueError("código de barras com mais de 50 caracteres")
        except (ValueError, InvalidOperation) as exc:
            errors.append(f"{path.name} linha {line}: {exc}")
            continue
        rows.append(ProductRow(code, name, barcode, unit_type, price, category, stock))
    if errors:
        raise CsvError("\n".join(errors))
    return rows


def read_customers(path: Path) -> list[CustomerRow]:
    rows: list[CustomerRow] = []
    errors: list[str] = []
    for line, r in _read_rows(path, ["name", "document", "phone", "address", "notes"]):
        name = r["name"].strip()
        document = r["document"].strip() or None
        phone = r["phone"].strip() or None
        if not name or len(name) > 255:
            errors.append(f"{path.name} linha {line}: nome vazio ou com mais de 255 caracteres")
        elif document and len(document) > 20:
            errors.append(f"{path.name} linha {line}: documento com mais de 20 caracteres")
        elif phone and len(phone) > 20:
            errors.append(f"{path.name} linha {line}: telefone com mais de 20 caracteres")
        else:
            rows.append(CustomerRow(name, document, phone, r["address"].strip() or None, r["notes"].strip() or None))
    if errors:
        raise CsvError("\n".join(errors))
    return rows


def find_internal_conflicts(products: list[ProductRow]) -> list[str]:
    conflicts: list[str] = []
    codes: dict[int, ProductRow] = {}
    names: dict[str, ProductRow] = {}
    for p in products:
        if p.code in codes:
            conflicts.append(f"código {p.code} repetido no CSV ('{codes[p.code].name}' e '{p.name}')")
        codes.setdefault(p.code, p)
        key = fold(p.name)
        if key in names:
            conflicts.append(f"nome '{p.name}' repetido no CSV (códigos {names[key].code} e {p.code})")
        names.setdefault(key, p)
    return conflicts


# ----------------------------------------------------------------------------- plano (puro)

def _customer_key(name: str, document: str | None, address: str | None) -> tuple:
    digits = re.sub(r"\D", "", document or "")
    if len(digits) in (11, 14):
        return ("doc", digits)
    return ("name", fold(name), fold(address))


def build_plan(
    products: list[ProductRow],
    customers: list[CustomerRow],
    existing_products: list[ExistingProduct],
    existing_customers: list[ExistingCustomer],
    existing_categories: list[str],
) -> Plan:
    plan = Plan()
    by_code = {e.code: e for e in existing_products}
    by_name = {fold(e.name): e for e in existing_products}

    for p in products:
        same_code = by_code.get(p.code)
        if same_code is not None:
            if fold(same_code.name) == fold(p.name):
                plan.products_skipped.append(p)  # já importado antes (reexecução)
            else:
                plan.conflicts.append(
                    f"código {p.code}: já existe '{same_code.name}' no HortiFácil e o CSV traz '{p.name}'")
            continue
        same_name = by_name.get(fold(p.name))
        if same_name is not None:
            plan.conflicts.append(
                f"nome '{p.name}' (cód. {p.code}) já existe no HortiFácil com o código {same_name.code}")
            continue
        plan.products_new.append(p)

    known = {_customer_key(e.name, e.document, e.address) for e in existing_customers}
    for c in customers:
        key = _customer_key(c.name, c.document, c.address)
        if key in known:
            plan.customers_skipped.append(c)
        else:
            known.add(key)
            plan.customers_new.append(c)

    existing = {fold(name) for name in existing_categories}
    for p in plan.products_new:
        if fold(p.category) not in existing:
            existing.add(fold(p.category))
            plan.categories_new.append(p.category)
    return plan


def format_plan(plan: Plan, *, apply: bool, clear_counts: dict[str, int] | None) -> str:
    lines = ["=== Plano da importação ==="]
    if clear_counts is not None:
        lines.append("Será APAGADO antes de importar (dados de teste):")
        lines.extend(f"  - {label}: {count}" for label, count in clear_counts.items())
    lines += [
        f"Produtos: {len(plan.products_new)} a criar, {len(plan.products_skipped)} já existentes (pulados)",
        f"Clientes: {len(plan.customers_new)} a criar, {len(plan.customers_skipped)} já existentes (pulados)",
        f"Categorias novas: {len(plan.categories_new)}"
        + (f" ({', '.join(plan.categories_new)})" if plan.categories_new else ""),
    ]
    if plan.conflicts:
        lines.append(f"CONFLITOS ({len(plan.conflicts)}) — a importação não será aplicada:")
        lines.extend(f"  - {c}" for c in plan.conflicts)
    lines.append("Modo: APLICAR" if apply else "Modo: dry-run (nada será gravado)")
    return "\n".join(lines)


# ----------------------------------------------------------------------------- banco

async def _load_existing(db):
    from sqlalchemy import select

    from app.models.category import Category
    from app.models.customer import Customer
    from app.models.product import Product

    products = [ExistingProduct(c, n) for c, n in (await db.execute(select(Product.code, Product.name))).all()]
    customers = [ExistingCustomer(n, d, a) for n, d, a in
                 (await db.execute(select(Customer.name, Customer.document, Customer.address))).all()]
    categories = list((await db.execute(select(Category.name))).scalars().all())
    return products, customers, categories


async def _test_data_counts(db) -> dict[str, int]:
    from sqlalchemy import func, select

    from app.models.customer import Customer
    from app.models.order import Order, OrderItem
    from app.models.product import Product
    from app.models.receivable import Receivable
    from app.models.stock_loss import StockLoss

    counts = {}
    for label, model in [("contas a receber", Receivable), ("itens de pedido", OrderItem), ("pedidos", Order),
                         ("perdas de estoque", StockLoss), ("produtos", Product), ("clientes", Customer)]:
        counts[label] = (await db.execute(select(func.count()).select_from(model))).scalar_one()
    return counts


async def _delete_test_data(db) -> None:
    from sqlalchemy import delete

    from app.models.customer import Customer
    from app.models.order import Order, OrderItem
    from app.models.product import Product
    from app.models.receivable import Receivable
    from app.models.stock_loss import StockLoss

    # Ordem respeita as chaves estrangeiras: quem referencia vem antes.
    for model in (Receivable, OrderItem, Order, StockLoss, Customer, Product):
        await db.execute(delete(model))


async def run_import(
    products: list[ProductRow],
    customers: list[CustomerRow],
    *,
    apply: bool,
    clear_test_data: bool,
    confirm: Callable[[], str] = lambda: input(f"Digite {CONFIRM_WORD} para confirmar: "),
) -> int:
    from sqlalchemy import func, select

    from app.core.database import AsyncSessionLocal
    from app.models.category import Category
    from app.models.customer import Customer, CustomerType
    from app.models.product import Product, UnitType

    async with AsyncSessionLocal() as db:
        existing_products, existing_customers, categories = await _load_existing(db)
        clear_counts = await _test_data_counts(db) if clear_test_data else None
        if clear_test_data:  # o que vai ser apagado não conta como existente
            existing_products, existing_customers = [], []

        plan = build_plan(products, customers, existing_products, existing_customers, categories)
        print(format_plan(plan, apply=apply, clear_counts=clear_counts))
        if plan.conflicts:
            return 1
        if not apply:
            return 0
        if clear_test_data and confirm().strip() != CONFIRM_WORD:
            print("Cancelado: confirmação não recebida. Nada foi alterado.")
            return 1

        try:
            if clear_test_data:
                await _delete_test_data(db)
            db.add_all(Category(name=name) for name in plan.categories_new)
            db.add_all(
                Product(code=p.code, name=p.name, barcode=p.barcode, unit_type=UnitType(p.unit_type),
                        price=p.price, category=p.category, stock=p.stock)
                for p in plan.products_new)
            db.add_all(
                Customer(name=c.name, document=c.document, phone=c.phone, address=c.address, notes=c.notes,
                         customer_type=CustomerType.counter)
                for c in plan.customers_new)
            await db.commit()
        except Exception as exc:
            await db.rollback()
            # Sem traceback: o erro do SQLAlchemy inclui os parâmetros do INSERT (dados de clientes).
            reason = str(getattr(exc, "orig", exc)).strip().splitlines()[0] if str(exc).strip() else ""
            print(f"ERRO ao gravar; transação revertida, nada foi alterado. {type(exc).__name__}: {reason}")
            return 3

        total_products = (await db.execute(select(func.count()).select_from(Product))).scalar_one()
        total_customers = (await db.execute(select(func.count()).select_from(Customer))).scalar_one()
        print(f"Importação concluída. Agora no banco: {total_products} produtos, {total_customers} clientes.")
        return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Importa clientes e produtos do Gestão Fácil (CSV).")
    parser.add_argument("--customers", required=True, type=Path)
    parser.add_argument("--products", required=True, type=Path)
    parser.add_argument("--apply", action="store_true", help="grava no banco (sem isso é dry-run)")
    parser.add_argument("--clear-test-data", action="store_true",
                        help="apaga pedidos, produtos e clientes de teste antes de importar (pede confirmação)")
    args = parser.parse_args(argv)

    if args.clear_test_data and not args.apply:
        print("--clear-test-data só faz sentido com --apply (o dry-run apenas mostra as contagens).")

    try:
        products = read_products(args.products)
        customers = read_customers(args.customers)
    except CsvError as exc:
        print(f"CSV inválido:\n{exc}")
        return 2
    internal = find_internal_conflicts(products)
    if internal:
        print("Conflitos dentro do próprio CSV de produtos (corrija antes de importar):")
        print("\n".join(f"  - {c}" for c in internal))
        return 2

    return asyncio.run(run_import(products, customers, apply=args.apply, clear_test_data=args.clear_test_data))


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd backend && python -m pytest tests -q; cd ..
```
Expected: `13 passed`. Confirme também que o módulo importa sem variáveis de ambiente do app:

```bash
cd backend && python -c "import import_legacy; print('import puro ok')"; cd ..
```
Expected: `import puro ok` (sem `ValidationError` de `DATABASE_URL`).

- [ ] **Step 5: Commit**

```bash
git add backend/import_legacy.py backend/tests/conftest.py backend/tests/test_import_legacy.py
git commit -m "feat(backend): importador de clientes e produtos do Gestão Fácil com dry-run e transação única"
```

---

### Task 7: Validar o importador num PostgreSQL descartável (schema real)

**Files:**
- Create (fora do repositório, **não commitar**): `mk_testdata.py` num diretório temporário
- Nenhuma alteração no repositório, a menos que a validação exponha um defeito (nesse caso: corrigir `backend/import_legacy.py`, acrescentar um teste em `backend/tests/` que reproduza o defeito e commitar com a mensagem `fix(backend): ...`).

**Interfaces:**
- Consumes: `backend/import_legacy.py` (Task 6), `migration/out/products.csv` e `migration/out/customers.csv` (Task 5), modelos atuais do backend.
- Produces: evidência de que os 6 comportamentos abaixo funcionam contra o Postgres real. Nada usado por outras tarefas.

Esta é a única verificação da parte de banco, que não tem teste unitário. **Execute tudo; não pule cenários.** Use `MSYS_NO_PATHCONV=1` no Git Bash para o Docker não reescrever caminhos. Nada aqui toca o banco de produção.

Observação: a cadeia de migrations do Alembic **não** constrói um banco novo (a `000` é vazia), então o schema é criado direto dos modelos atuais.

- [ ] **Step 1: Subir um Postgres e um container Python 3.11 com o backend**

```bash
export MSYS_NO_PATHCONV=1
docker rm -f pgtest apitest >/dev/null 2>&1; docker network rm legacytest >/dev/null 2>&1
docker network create legacytest
docker run -d --name pgtest --network legacytest -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=hortifacil postgres:16-alpine
docker run -d --name apitest --network legacytest -w /app \
  -e DATABASE_URL=postgresql+asyncpg://postgres:pw@pgtest/hortifacil \
  -e DATABASE_URL_SYNC=postgresql://postgres:pw@pgtest/hortifacil -e SECRET_KEY=test \
  python:3.11-slim sleep infinity
docker cp backend/. apitest:/app/
docker exec apitest pip install -q -r requirements.txt
docker exec apitest sh -c 'until python -c "import socket;socket.create_connection((\"pgtest\",5432),2)" 2>/dev/null; do sleep 1; done'
```
Expected: os containers sobem; o `pip install` termina sem erro (pode levar 1–2 minutos).

- [ ] **Step 2: Criar o schema dos modelos atuais**

```bash
docker exec apitest python -c "
import app.models
from app.models.category import Category
from app.models.stock_loss import StockLoss
from app.core.database import Base
from sqlalchemy import create_engine, inspect
from app.core.config import settings
e = create_engine(settings.DATABASE_URL_SYNC)
Base.metadata.create_all(e)
print(sorted(inspect(e).get_table_names()))
"
```
Expected: `['categories', 'customers', 'order_items', 'orders', 'products', 'receivables', 'stock_losses', 'users']`.

- [ ] **Step 3: Criar dados de teste (12 produtos com códigos 1–12, clientes, pedidos, fiado e uma perda)**

Create `mk_testdata.py` em um diretório temporário (não no repositório):

```python
"""Cria dados de teste no banco descartável: admin, 12 produtos (códigos 1..12), clientes, pedidos, fiado, perda."""
import asyncio
from decimal import Decimal

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.category import Category
from app.models.product import Product, UnitType
from app.models.stock_loss import StockLoss
from app.models.user import User, UserRole
from seed_data import seed_customers, seed_orders

NAMES = [("Alface Crespa", "unit", "Verduras"), ("Tomate Italiano", "kg", "Legumes"), ("Banana Prata", "kg", "Frutas"),
         ("Cenoura", "kg", "Legumes"), ("Batata Inglesa", "kg", "Legumes"), ("Cebola", "kg", "Legumes"),
         ("Maçã Fuji", "kg", "Frutas"), ("Laranja Pera", "kg", "Frutas"), ("Pepino Japonês", "unit", "Legumes"),
         ("Couve-flor", "unit", "Verduras"), ("Brócolis", "unit", "Verduras"), ("Manga Tommy", "unit", "Frutas")]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        admin = User(name="Admin", email="admin@teste.com", hashed_password=hash_password("x"), role=UserRole.admin)
        db.add(admin)
        products = [Product(code=i + 1, name=n, unit_type=UnitType(u), price=Decimal("3.00") + i, category=c)
                    for i, (n, u, c) in enumerate(NAMES)]
        db.add_all(products)
        db.add_all([Category(name="Frutas"), Category(name="Legumes"), Category(name="Verduras")])
        await db.flush()
        customers = await seed_customers(db)
        await seed_orders(db, admin, customers, products)
        db.add(StockLoss(product_id=products[0].id, product_name=products[0].name, unit_type="unit",
                         qty=Decimal("1"), reason="teste", created_by_name="Admin"))
        await db.commit()
        print("dados de teste criados")


asyncio.run(main())
```

```bash
docker cp mk_testdata.py apitest:/app/mk_testdata.py
docker cp backend/import_legacy.py apitest:/app/import_legacy.py
docker cp migration/out/products.csv apitest:/app/products.csv
docker cp migration/out/customers.csv apitest:/app/customers.csv
docker exec apitest python mk_testdata.py
```
Expected: `10 pedidos criados`, `4 fiados criados`, `dados de teste criados`.

Defina os auxiliares de conferência (usados nos passos seguintes; se cada passo rodar num shell novo, cole estas duas funções de novo, junto com `export MSYS_NO_PATHCONV=1`):

```bash
q(){ docker exec -i pgtest psql -U postgres -d hortifacil -At -c "$1"; }
counts(){ echo "  produtos=$(q 'select count(*) from products') clientes=$(q 'select count(*) from customers') pedidos=$(q 'select count(*) from orders') itens=$(q 'select count(*) from order_items') fiados=$(q 'select count(*) from receivables') perdas=$(q 'select count(*) from stock_losses') categorias=$(q 'select count(*) from categories') usuarios=$(q 'select count(*) from users')"; }
counts
```
Expected: `produtos=12 clientes=8 pedidos=10 itens=21 fiados=4 perdas=1 categorias=3 usuarios=1`.

- [ ] **Step 4: Cenário A: dry-run sem limpar deve acusar 12 conflitos de código**

```bash
docker exec apitest python import_legacy.py --customers customers.csv --products products.csv; echo "exit=$?"
```
Expected: `Produtos: 793 a criar`, `CONFLITOS (12)` listando os códigos 1 a 12 (por exemplo `código 1: já existe 'Alface Crespa' no HortiFácil e o CSV traz 'AMENDOIM TORRADO VARIED 250G'`), `Modo: dry-run` e `exit=1`. `counts` continua igual ao do Step 3.

- [ ] **Step 5: Cenário B: dry-run com `--clear-test-data` mostra o que seria apagado, sem apagar**

```bash
docker exec apitest python import_legacy.py --customers customers.csv --products products.csv --clear-test-data; echo "exit=$?"
counts
```
Expected: lista `contas a receber: 4`, `itens de pedido: 21`, `pedidos: 10`, `perdas de estoque: 1`, `produtos: 12`, `clientes: 8`; `Produtos: 805 a criar`, `Clientes: 94 a criar`, `Categorias novas: 7`; `exit=0`; `counts` **inalterado**.

- [ ] **Step 6: Cenário C: sem digitar `APAGAR`, nada muda**

```bash
echo "" | docker exec -i apitest python import_legacy.py --customers customers.csv --products products.csv --apply --clear-test-data; echo "exit=$?"
counts
```
Expected: `Cancelado: confirmação não recebida. Nada foi alterado.`, `exit=1`, `counts` **inalterado**.

- [ ] **Step 7: Cenário D: rollback forçado no meio da transação**

Cria uma restrição que faz um cliente específico falhar **depois** do `DELETE` e dos primeiros inserts:

```bash
q "ALTER TABLE customers ADD CONSTRAINT boom CHECK (name <> 'ZZZ BOOM')"
docker exec apitest sh -c 'cp customers.csv customers_boom.csv && printf "ZZZ BOOM,,,,\n" >> customers_boom.csv'
counts
echo "APAGAR" | docker exec -i apitest python import_legacy.py --customers customers_boom.csv --products products.csv --apply --clear-test-data; echo "exit=$?"
counts
q "ALTER TABLE customers DROP CONSTRAINT boom"
```
Expected: a saída termina com `ERRO ao gravar; transação revertida, nada foi alterado. IntegrityError: ...CheckViolationError...` (**sem** despejar o SQL com parâmetros de clientes), `exit=3`, e o segundo `counts` é **idêntico** ao primeiro (os 12 produtos de teste, pedidos etc. continuam lá).

- [ ] **Step 8: Cenário E: `--apply --clear-test-data` de verdade**

```bash
echo "APAGAR" | docker exec -i apitest python import_legacy.py --customers customers.csv --products products.csv --apply --clear-test-data; echo "exit=$?"
counts
echo "max(code)=$(q 'select max(code) from products') estoque_total=$(q 'select sum(stock) from products')"
q "select unit_type, count(*) from products group by 1 order by 2 desc" | tr '\n' ' '; echo
q "select customer_type, count(*), sum(credit_limit), sum(balance_due) from customers group by 1"
```
Expected: `Importação concluída. Agora no banco: 805 produtos, 94 clientes.` e `exit=0`; `counts` = `produtos=805 clientes=94 pedidos=0 itens=0 fiados=0 perdas=0 categorias=10 usuarios=1` (usuário preservado; as 3 categorias originais + 7 novas); `max(code)=6085 estoque_total=0.000`; unidades `unit|555 kg|210 box|40`; clientes `counter|94|0.00|0.00`.

- [ ] **Step 9: Cenário F: reexecução é idempotente, e o próximo produto do app é 6086**

```bash
docker exec apitest python import_legacy.py --customers customers.csv --products products.csv --apply; echo "exit=$?"
docker exec apitest python -c "
import asyncio
from decimal import Decimal
from app.core.database import AsyncSessionLocal
from app.schemas.product import ProductCreate
from app.services import product_service
async def main():
    async with AsyncSessionLocal() as db:
        p = await product_service.create_product(db, ProductCreate(name='PRODUTO NOVO DE TESTE', price=Decimal('1.00'), category='Outros'))
        print('novo produto recebeu code =', p.code)
asyncio.run(main())
"
```
Expected: `Produtos: 0 a criar, 805 já existentes (pulados)`, `Clientes: 0 a criar, 94 já existentes (pulados)`, `exit=0`; e `novo produto recebeu code = 6086`.

- [ ] **Step 10: Cenário G: CSV no formato do Excel em português com os dados reais**

Gera um `products_excel.csv` (separador `;`, vírgula decimal, cp1252) e roda o dry-run:

```bash
python - <<'EOF'
import csv, io
rows = list(csv.DictReader(open("migration/out/products.csv", encoding="utf-8-sig", newline="")))
buf = io.StringIO(newline="")
writer = csv.DictWriter(buf, fieldnames=list(rows[0]), delimiter=";", lineterminator="\r\n")
writer.writeheader()
for r in rows:
    r["price"] = r["price"].replace(".", ",")
    writer.writerow(r)
open("products_excel.csv", "wb").write(buf.getvalue().encode("cp1252", errors="replace"))
print("products_excel.csv gerado")
EOF
docker cp products_excel.csv apitest:/app/products_excel.csv
docker exec apitest python import_legacy.py --customers customers.csv --products products_excel.csv; echo "exit=$?"
```
Expected: `Produtos: 0 a criar, 805 já existentes (pulados)` e `Clientes: 0 a criar, 94 já existentes (pulados)`, com `exit=0`. (O produto criado no Step 9 está no banco mas não no CSV; ele não interfere.) Prova que o CSV no formato do Excel casa produto por produto.

- [ ] **Step 11: Cenário H: CSV inválido**

```bash
docker exec apitest sh -c 'printf "code,name\n1,X\n" > bad.csv; python import_legacy.py --customers customers.csv --products bad.csv; echo "exit=$?"'
```
Expected: `CSV inválido:` / `bad.csv: faltam as colunas barcode, unit_type, price, category, stock` e `exit=2`.

- [ ] **Step 12: Limpar o ambiente de teste**

```bash
docker rm -f pgtest apitest >/dev/null 2>&1; docker network rm legacytest >/dev/null 2>&1
docker ps -a --format '{{.Names}}' | grep -E 'pgtest|apitest' || echo "removidos"
rm -f mk_testdata.py products_excel.csv
```
Expected: `removidos`. Se algum cenário divergiu do esperado, **não avance**: corrija `backend/import_legacy.py` com teste que reproduza o defeito (quando for da parte pura) e repita esta validação desde o Step 1.

---

### Task 8: Runbook e protocolo de execução em produção

**Files:**
- Create: `migration/README.md`

**Interfaces:**
- Consumes: os comandos e códigos de saída das Tasks 5, 6 e 7.
- Produces: documento operacional. A execução em produção **não** faz parte da implementação: cada portão abaixo exige a autorização explícita do usuário.

- [ ] **Step 1: Escrever o runbook**

Create `migration/README.md`:

````markdown
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

Abra o `review.html` e confira, principalmente: produtos rejeitados, nomes duplicados renomeados, nomes suspeitos, decisões de unidade e categorias, "Conferir o preço" e os pontos de atenção de clientes. Para corrigir algo, edite o `products.csv` / `customers.csv`. O Excel em português serve: o importador aceita `;`, vírgula decimal e cp1252. Categorias novas são criadas automaticamente. `unit_type` deve ser `unit`, `kg`, `gram`, `liter`, `box` ou `bunch`.

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
````

- [ ] **Step 2: Commit**

```bash
git add migration/README.md
git commit -m "docs(migration): runbook da migração de clientes e produtos"
```

- [ ] **Step 3: Entregar ao usuário e parar (portão de produção)**

Apresente ao usuário o resumo (CSVs gerados, número de conflitos, `review.html`) e **pare**. Antes de qualquer contato com produção, cada item abaixo precisa do "sim" explícito do usuário naquele momento, um a um:

1. Copiar `import_legacy.py` e os CSVs para o container de produção (`docker cp`).
2. Rodar o **dry-run** em produção (só leitura, mas toca o banco real).
3. Tirar o backup do Postgres pelo Coolify.
4. Rodar o `--apply` (com ou sem `--clear-test-data`; **este último apaga dados** e pede a palavra `APAGAR`).

Nunca acione o `deploy` do Coolify para esta migração: o script viaja por `docker cp`.
