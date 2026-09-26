"""Regras puras dos dados fiscais do produto (sem banco): validação, herança do padrão da categoria e "pronto para emitir".

Funcionam com qualquer objeto que tenha os atributos de FISCAL_FIELDS (produto, padrão da categoria, item do pedido).
"""
import re
from decimal import Decimal, InvalidOperation
from typing import Any

FISCAL_FIELDS = ("ncm", "cest", "origem", "cfop", "cst_icms", "aliquota_icms", "cst_pis", "cst_cofins")

# CSTs de ICMS em que há imposto próprio na operação: exigem alíquota. Os demais (40, 41, 60...) não.
CST_ICMS_WITH_TAX = frozenset({"00", "10", "20", "70", "90"})

LABELS = {
    "ncm": "NCM",
    "cest": "CEST",
    "origem": "Origem",
    "cfop": "CFOP",
    "cst_icms": "CST do ICMS",
    "aliquota_icms": "Alíquota do ICMS",
    "cst_pis": "CST do PIS",
    "cst_cofins": "CST do COFINS",
}


def _digits(value: Any, label: str, length: int) -> str:
    text = re.sub(r"[.\-\s]", "", str(value))
    if not text.isdigit():
        raise ValueError(f"{label} deve ter só números")
    if length == 2:
        text = text.zfill(2)  # CST "1" digitado como número vira "01"
    if len(text) != length:
        raise ValueError(f"{label} deve ter {length} dígitos")
    return text


def normalize_field(name: str, value: Any) -> Any:
    """Valida e normaliza um campo fiscal. Vazio vira None. Erro vira ValueError com mensagem em português."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    label = LABELS[name]
    if name == "ncm":
        return _digits(value, label, 8)
    if name == "cest":
        return _digits(value, label, 7)
    if name == "cfop":
        cfop = _digits(value, label, 4)
        if not cfop.startswith("5"):
            raise ValueError("CFOP da NFC-e deve ser de operação interna (começa com 5)")
        return cfop
    if name == "origem":
        try:
            origem = int(str(value).strip())
        except ValueError:
            raise ValueError("Origem deve ser um número de 0 a 8") from None
        if not 0 <= origem <= 8:
            raise ValueError("Origem deve ser um número de 0 a 8")
        return origem
    if name in ("cst_icms", "cst_pis", "cst_cofins"):
        return _digits(value, label, 2)
    if name == "aliquota_icms":
        try:
            rate = Decimal(str(value))
        except InvalidOperation:
            raise ValueError("Alíquota do ICMS inválida") from None
        if not rate.is_finite() or not Decimal("0") <= rate <= Decimal("100"):
            raise ValueError("Alíquota do ICMS deve ficar entre 0 e 100")
        return rate.quantize(Decimal("0.01"))
    raise KeyError(name)


def merge_fiscal(own: Any, default: Any | None) -> dict[str, Any]:
    """Cada campo vem do próprio produto e, se estiver vazio (None), do padrão da categoria. Zero é valor válido."""
    merged: dict[str, Any] = {}
    for field in FISCAL_FIELDS:
        value = getattr(own, field, None)
        if value is None and default is not None:
            value = getattr(default, field, None)
        merged[field] = value
    return merged


def missing_fields(merged: dict[str, Any]) -> list[str]:
    """Nomes (em português) do que falta para emitir. PIS/COFINS e CEST não são exigidos nesta etapa."""
    required = ["ncm", "origem", "cfop", "cst_icms"]
    if merged.get("cst_icms") in CST_ICMS_WITH_TAX:
        required.append("aliquota_icms")
    return [LABELS[f] for f in required if merged.get(f) is None]


def is_ready(merged: dict[str, Any]) -> bool:
    return not missing_fields(merged)


def cst_composto(origem: int, cst_icms: str) -> str:
    """CST de 3 dígitos da nota: origem + CST do ICMS (ex.: 0 + 60 = 060)."""
    return f"{origem}{cst_icms}"
