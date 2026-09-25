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
