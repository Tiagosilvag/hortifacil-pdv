"""Cofre dos segredos fiscais: cifra com a chave mestra do servidor, amarra cada segredo ao seu tipo e nunca vaza a causa do erro."""
import base64
import os

import pytest

# `app.core.config` exige estas variáveis já no import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost/teste")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://teste:teste@localhost/teste")
os.environ.setdefault("SECRET_KEY", "teste")

from app.services.fiscal import vault  # noqa: E402

KEY = base64.b64encode(bytes(range(32))).decode()
OTHER_KEY = base64.b64encode(bytes(range(1, 33))).decode()


@pytest.fixture
def key(monkeypatch):
    monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", KEY)


class TestChaveMestra:
    def test_sem_chave_o_cofre_esta_indisponivel_e_a_mensagem_ensina_a_criar(self, monkeypatch):
        monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", "")
        assert vault.vault_available() is False
        with pytest.raises(vault.VaultUnavailable, match="FISCAL_SECRET_KEY.*secrets.token_bytes"):
            vault.encrypt("certificate", b"x")

    def test_chave_invalida_ou_do_tamanho_errado_e_recusada(self, monkeypatch):
        for bad in ("nao-e-base64!!", base64.b64encode(b"curta").decode(), base64.b64encode(bytes(64)).decode()):
            monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", bad)
            assert vault.vault_available() is False, bad

    def test_aceita_base64_padrao_e_urlsafe(self, monkeypatch):
        raw = bytes(range(200, 232))
        for text in (base64.b64encode(raw).decode(), base64.urlsafe_b64encode(raw).decode().rstrip("=")):
            monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", text)
            assert vault.decrypt("csc", vault.encrypt("csc", b"ok")) == b"ok"


class TestCifra:
    def test_ida_e_volta(self, key):
        secret = b"conteudo do pfx \x00\xff com bytes quaisquer"
        assert vault.decrypt("certificate", vault.encrypt("certificate", secret)) == secret

    def test_o_texto_cifrado_nao_contem_o_segredo_e_muda_a_cada_vez(self, key):
        first, second = vault.encrypt("csc_prod", b"TOKEN-SECRETO"), vault.encrypt("csc_prod", b"TOKEN-SECRETO")
        assert b"TOKEN-SECRETO" not in first and first != second  # nonce novo a cada chamada
        assert len(first) == vault.NONCE_BYTES + len(b"TOKEN-SECRETO") + 16

    def test_segredo_de_um_tipo_nao_abre_como_outro_tipo(self, key):
        blob = vault.encrypt("certificate_password", b"senha")
        with pytest.raises(vault.VaultUnavailable, match="certificate"):
            vault.decrypt("certificate", blob)

    def test_chave_mestra_trocada_ou_dado_corrompido_pede_para_cadastrar_de_novo(self, key, monkeypatch):
        blob = vault.encrypt("csc_hml", b"abc")
        monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", OTHER_KEY)
        with pytest.raises(vault.VaultUnavailable, match="Cadastre-o de novo"):
            vault.decrypt("csc_hml", blob)
        monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", KEY)
        with pytest.raises(vault.VaultUnavailable):
            vault.decrypt("csc_hml", blob[:-1] + bytes([blob[-1] ^ 1]))
        with pytest.raises(vault.VaultUnavailable):
            vault.decrypt("csc_hml", b"curto")
