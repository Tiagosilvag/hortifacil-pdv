"""Funções puras de normalização de texto, documentos e telefones."""
import re
import unicodedata


def only_digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def fold(value: str | None) -> str:
    """Maiúsculas, sem acento e com espaços colapsados — para comparar textos."""
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip().upper()


def format_document(value: str | None) -> str:
    """CPF (11 dígitos) e CNPJ (14) formatados; qualquer outro tamanho vira só dígitos."""
    digits = only_digits(value)
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return digits


def format_phone(value: str | None) -> str:
    """Celular (11 dígitos) e fixo (10) formatados; qualquer outro tamanho vira só dígitos."""
    digits = only_digits(value)
    if len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    return digits
