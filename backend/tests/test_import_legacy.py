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
    path = write_csv(tmp_path / "p.csv", PRODUCT_COLUMNS, [prow(), prow(code="2", name="MAÇÃ", barcode="7896646570284")])
    rows = read_products(path)
    assert [r.code for r in rows] == [1, 2]
    assert rows[1].barcode == "7896646570284" and rows[0].barcode is None
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


def test_read_products_rejects_barcodes_damaged_by_excel(tmp_path):
    """O Excel mostra EAN de 13 dígitos como 7,89665E+12 e salva assim; isso não pode entrar no banco."""
    path = write_csv(tmp_path / "p.csv", PRODUCT_COLUMNS, [
        prow(barcode="7,89665E+12"), prow(code="2", barcode="7896646570284"), prow(code="3", barcode="789 6646")])
    with pytest.raises(CsvError) as info:
        read_products(path)
    message = str(info.value)
    assert "linha 2" in message and "código de barras inválido" in message
    assert "linha 4" in message
    assert "linha 3" not in message  # o EAN correto passa
