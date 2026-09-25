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
