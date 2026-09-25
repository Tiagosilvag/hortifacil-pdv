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
# Unidades que o Gestão Fácil imprime. Qualquer outra coisa é fragmento de leitura ("G" de "KG"): rejeitar.
KNOWN_UNITS = frozenset({"KG", "UN", "CX", "SC", "PCT", "PC", "PT", "EMB", "GR", "ML", "LT", "GF", "RL", "CJ"})


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
        elif unit not in KNOWN_UNITS:
            problem = "unidade desconhecida"
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
