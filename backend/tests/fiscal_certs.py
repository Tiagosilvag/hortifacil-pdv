"""Certificados A1 de TESTE gerados na hora (nenhum certificado real entra no repositório nem nos testes)."""
import datetime as dt

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

PASSWORD = "senha-de-teste"
CNPJ = "11222333000181"


def make_pfx(*, cnpj_in_cn: str | None = CNPJ, cnpj_in_san: str | None = None, password: str = PASSWORD,
             valid_from_days: int = -30, valid_for_days: int = 335, with_key: bool = True) -> bytes:
    """Um .pfx com titular 'EMPRESA TESTE LTDA:<cnpj>' (padrão ICP-Brasil), opcionalmente com o CNPJ no SubjectAltName."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    common_name = f"EMPRESA TESTE LTDA:{cnpj_in_cn}" if cnpj_in_cn else "EMPRESA TESTE LTDA"
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name)])
    now = dt.datetime.now(dt.timezone.utc)
    builder = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now + dt.timedelta(days=valid_from_days))
        .not_valid_after(now + dt.timedelta(days=valid_from_days + valid_for_days))
    )
    if cnpj_in_san:
        der = bytes([0x13, len(cnpj_in_san)]) + cnpj_in_san.encode()  # PrintableString
        other = x509.OtherName(x509.ObjectIdentifier("2.16.76.1.3.3"), der)
        builder = builder.add_extension(x509.SubjectAlternativeName([other]), critical=False)
    cert = builder.sign(key, hashes.SHA256())
    return pkcs12.serialize_key_and_certificates(
        b"teste", key if with_key else None, cert, None, serialization.BestAvailableEncryption(password.encode())
    )
