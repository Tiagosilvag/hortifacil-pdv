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
