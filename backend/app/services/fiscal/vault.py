"""Cofre dos segredos fiscais (certificado digital, senha, CSC, token do provedor).

Os segredos ficam cifrados no banco (AES-256-GCM). A chave mestra vem da variável de ambiente `FISCAL_SECRET_KEY` (só existe no
servidor, nunca no banco nem no repositório). Sem ela, nada é cifrado nem decifrado. Cada segredo é amarrado ao seu `kind` (dado
autenticado adicional): um segredo copiado para a linha de outro tipo não decifra.
"""
import base64
import binascii
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings as app_settings

NONCE_BYTES = 12
KEY_BYTES = 32

HOW_TO_CREATE_KEY = 'gere uma com: python -c "import secrets,base64;print(base64.b64encode(secrets.token_bytes(32)).decode())"'


class VaultUnavailable(Exception):
    """Sem chave mestra válida (ou segredo que não decifra): a mensagem já é para mostrar ao usuário."""


def _master_key() -> bytes:
    raw = (app_settings.FISCAL_SECRET_KEY or "").strip()
    if not raw:
        raise VaultUnavailable(f"A chave mestra dos segredos fiscais (FISCAL_SECRET_KEY) não está configurada no servidor: {HOW_TO_CREATE_KEY}.")
    try:  # estrito: só o alfabeto do base64 e com o preenchimento exato, para uma frase escolhida à mão não virar chave
        key = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        try:
            key = base64.b64decode(raw, altchars=b"-_", validate=True)  # a variante urlsafe, também com o preenchimento
        except (binascii.Error, ValueError):
            raise VaultUnavailable(f"FISCAL_SECRET_KEY não é um base64 válido: {HOW_TO_CREATE_KEY}.") from None
    if len(key) != KEY_BYTES:
        raise VaultUnavailable(f"FISCAL_SECRET_KEY deve ter {KEY_BYTES} bytes em base64: {HOW_TO_CREATE_KEY}.")
    return key


def vault_available() -> bool:
    try:
        _master_key()
    except VaultUnavailable:
        return False
    return True


def encrypt(kind: str, plaintext: bytes) -> bytes:
    """Devolve `nonce (12 bytes) + texto cifrado`. O nonce é novo a cada chamada."""
    nonce = os.urandom(NONCE_BYTES)
    return nonce + AESGCM(_master_key()).encrypt(nonce, plaintext, kind.encode())


def decrypt(kind: str, blob: bytes) -> bytes:
    key = _master_key()
    try:
        return AESGCM(key).decrypt(blob[:NONCE_BYTES], blob[NONCE_BYTES:], kind.encode())
    except (InvalidTag, ValueError):
        raise VaultUnavailable(
            f"Não foi possível abrir o segredo '{kind}': a chave mestra mudou ou o dado está corrompido. Cadastre-o de novo."
        ) from None
