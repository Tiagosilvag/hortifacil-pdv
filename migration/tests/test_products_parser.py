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
