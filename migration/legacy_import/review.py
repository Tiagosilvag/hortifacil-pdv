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
