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
