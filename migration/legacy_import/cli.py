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
