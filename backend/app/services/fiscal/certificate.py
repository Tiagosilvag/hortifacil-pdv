"""Certificado digital A1 (.pfx): confere senha, validade e a que CNPJ ele pertence, sem guardar nada."""
import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

# ICP-Brasil: o CNPJ do titular vai no campo "otherName" do SubjectAltName, com este identificador.
ICP_BRASIL_CNPJ_OID = x509.ObjectIdentifier("2.16.76.1.3.3")

WARN_DAYS = 60
CRITICAL_DAYS = 15


class CertificateError(ValueError):
    """Problema com o arquivo ou a senha do certificado; a mensagem já é para mostrar ao usuário."""


@dataclass(frozen=True)
class CertInfo:
    subject: str
    cnpj: str | None
    not_before: datetime
    not_after: datetime
    fingerprint: str  # SHA-256 do certificado, para conferir sem expor nada


def _digits(text: str) -> str:
    return re.sub(r"\D", "", text)


def _cnpj_from(cert: x509.Certificate) -> str | None:
    try:
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        for name in san.get_values_for_type(x509.OtherName):
            if name.type_id == ICP_BRASIL_CNPJ_OID:
                digits = _digits(name.value[2:].decode("latin-1"))  # tira o cabeçalho DER (tag e tamanho)
                if len(digits) == 14:
                    return digits
    except (x509.ExtensionNotFound, ValueError):
        pass
    common_name = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)
    if common_name and ":" in common_name[0].value:  # padrão ICP-Brasil: "NOME DA EMPRESA:11222333000181"
        digits = _digits(common_name[0].value.rsplit(":", 1)[1])
        if len(digits) == 14:
            return digits
    return None


def inspect_pfx(data: bytes, password: str) -> CertInfo:
    """Abre o .pfx e devolve os dados públicos do certificado. Levanta CertificateError com mensagem em português."""
    try:
        key, cert, _ = pkcs12.load_key_and_certificates(data, password.encode("utf-8"))
    except (ValueError, TypeError):
        raise CertificateError("Não foi possível abrir o certificado: confira a senha e se o arquivo é um .pfx (A1).") from None
    if cert is None or key is None:
        raise CertificateError("O arquivo não contém o certificado com a chave privada (é preciso um A1 completo).")
    name = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)
    return CertInfo(
        subject=name[0].value if name else cert.subject.rfc4514_string(),
        cnpj=_cnpj_from(cert),
        not_before=cert.not_valid_before_utc,
        not_after=cert.not_valid_after_utc,
        fingerprint=hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest(),
    )


def days_left(info: CertInfo, now: datetime | None = None) -> int:
    """Dias até vencer (negativo se já venceu)."""
    return (info.not_after - (now or datetime.now(timezone.utc))).days


def problems_for_company(info: CertInfo, company_cnpj: str | None, now: datetime | None = None) -> list[str]:
    """O que impede usar este certificado para esta empresa (lista vazia = serve)."""
    now = now or datetime.now(timezone.utc)
    problems: list[str] = []
    if info.not_after < now:
        problems.append(f"o certificado venceu em {info.not_after:%d/%m/%Y}")
    elif info.not_before > now:
        problems.append(f"o certificado só vale a partir de {info.not_before:%d/%m/%Y}")
    if company_cnpj:
        if info.cnpj is None:
            problems.append("não achei o CNPJ dentro do certificado para conferir com o da empresa")
        elif info.cnpj != _digits(company_cnpj):
            problems.append("o CNPJ do certificado é diferente do CNPJ da empresa cadastrado")
    return problems


def expiry_level(info: CertInfo, now: datetime | None = None) -> str:
    """ok | warn (até 60 dias) | critical (até 15 dias ou vencido), para a tela."""
    left = days_left(info, now)
    if left <= CRITICAL_DAYS:
        return "critical"
    return "warn" if left <= WARN_DAYS else "ok"
