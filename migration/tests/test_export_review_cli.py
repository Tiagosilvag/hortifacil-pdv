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


def test_run_fails_when_any_customer_pdf_has_no_customers(tmp_path: Path):
    """Um PDF trocado no meio da lista não pode passar só porque os outros têm clientes."""
    products_text = page([row(1, None, "ALFACE", "UN", "1,00", "2,50", "10", "25,00")])
    texts = {"c.pdf": customers_page(customer_block(1, razao="ANA")), "p.pdf": products_text, "outro.pdf": products_text}

    with pytest.raises(SystemExit, match="outro.pdf"):
        run([Path("c.pdf"), Path("outro.pdf")], Path("p.pdf"), tmp_path, extract=lambda pdf: texts[pdf.name])
    assert list(tmp_path.iterdir()) == []
