"""Registro de modos de emissão: o modo salvo no banco escolhe o adaptador; em desenvolvimento FISCAL_PROVIDER=fake o força."""
import asyncio
import os
from types import SimpleNamespace

import pytest

# `app.core.config` exige estas variáveis já no import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost/teste")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://teste:teste@localhost/teste")
os.environ.setdefault("SECRET_KEY", "teste")

from app.services.fiscal import registry  # noqa: E402
from app.services.fiscal.fake import FakeFiscalProvider  # noqa: E402


def run(coro):
    return asyncio.run(coro)


class FakeDb:
    def __init__(self, row=None):
        self.row = row
        self.queries = 0

    async def execute(self, _statement):
        self.queries += 1
        return self

    def scalar_one_or_none(self):
        return self.row


@pytest.fixture
def dev(monkeypatch):
    monkeypatch.setattr(registry.app_settings, "FISCAL_PROVIDER", "none")
    monkeypatch.setattr(registry.app_settings, "ENVIRONMENT", "development")


class TestModoEmVigor:
    def test_usa_o_modo_salvo_e_none_quando_nao_ha(self, dev):
        assert registry.effective_mode("sefaz_direto") == "sefaz_direto"
        assert registry.effective_mode(None) == "none" and registry.effective_mode("") == "none"

    def test_o_atalho_de_desenvolvimento_forca_o_falso_so_em_desenvolvimento(self, monkeypatch):
        monkeypatch.setattr(registry.app_settings, "FISCAL_PROVIDER", "fake")
        monkeypatch.setattr(registry.app_settings, "ENVIRONMENT", "development")
        assert registry.effective_mode("sefaz_direto") == "fake"
        monkeypatch.setattr(registry.app_settings, "ENVIRONMENT", "production")
        assert registry.effective_mode("sefaz_direto") == "sefaz_direto"  # em produção o atalho é ignorado
        assert registry.effective_mode(None) == "none"

    def test_qualquer_outro_valor_da_variavel_nao_muda_nada(self, monkeypatch):
        monkeypatch.setattr(registry.app_settings, "ENVIRONMENT", "development")
        for value in ("nuvemfiscal", "sefaz_direto", ""):
            monkeypatch.setattr(registry.app_settings, "FISCAL_PROVIDER", value)
            assert registry.effective_mode("none") == "none"


class TestAdaptadores:
    def test_none_e_o_direto_ainda_nao_tem_adaptador_e_o_falso_so_em_desenvolvimento(self, dev, monkeypatch):
        assert registry.provider_for_mode("none") is None and registry.provider_for_mode("sefaz_direto") is None
        assert isinstance(registry.provider_for_mode("fake"), FakeFiscalProvider)
        monkeypatch.setattr(registry.app_settings, "ENVIRONMENT", "production")
        assert registry.provider_for_mode("fake") is None

    def test_modo_disponivel_e_ter_adaptador(self, dev):
        assert registry.mode_available("fake") is True
        assert registry.mode_available("none") is False and registry.mode_available("sefaz_direto") is False

    def test_o_provedor_falso_de_desenvolvimento_e_sempre_o_mesmo(self, dev):
        assert registry.provider_for_mode("fake") is registry.provider_for_mode("fake")

    def test_a_partir_da_linha_de_configuracao(self, dev):
        assert registry.provider_for_settings(SimpleNamespace(mode="fake")) is not None
        assert registry.provider_for_settings(SimpleNamespace(mode="none")) is None
        assert registry.provider_for_settings(None) is None
        assert registry.provider_for_settings(SimpleNamespace()) is None  # linha antiga, sem o campo


class TestCarregar:
    def test_le_o_modo_do_banco(self, dev):
        db = FakeDb(SimpleNamespace(mode="fake"))
        assert run(registry.load_provider(db)) is not None and db.queries == 1
        assert run(registry.load_provider(FakeDb(SimpleNamespace(mode="none")))) is None
        assert run(registry.load_provider(FakeDb(None))) is None

    def test_com_o_atalho_de_desenvolvimento_nem_consulta_o_banco(self, monkeypatch):
        monkeypatch.setattr(registry.app_settings, "FISCAL_PROVIDER", "fake")
        monkeypatch.setattr(registry.app_settings, "ENVIRONMENT", "development")
        db = FakeDb(SimpleNamespace(mode="none"))
        assert run(registry.load_provider(db)) is not None and db.queries == 0

    def test_consulta_de_configuracao_tem_ordem_fixa(self):
        sql = str(registry.settings_query())
        assert "ORDER BY fiscal_settings.id" in sql and "LIMIT" in sql
