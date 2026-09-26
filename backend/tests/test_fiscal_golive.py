"""Ida para produção: o que precisa estar pronto antes de a emissão passar a valer como nota fiscal de verdade."""
import asyncio
import os
from types import SimpleNamespace

import pytest

# `app.core.config` exige estas variáveis já no import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost/teste")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://teste:teste@localhost/teste")
os.environ.setdefault("SECRET_KEY", "teste")

from fastapi import HTTPException  # noqa: E402

from app.models.fiscal import FiscalSettings  # noqa: E402
from app.schemas.fiscal import FiscalSettingsIn  # noqa: E402
from app.services import fiscal_golive as golive  # noqa: E402
from app.services import fiscal_service as svc  # noqa: E402

COMPLETE = dict(cnpj="11222333000181", ie="123456789", legal_name="EMPRESA TESTE LTDA", street="Rua Exemplo", number="100",
                district="Centro", city="Recife", city_ibge="2611606", state="PE", zip_code="50000000")


def run(coro):
    return asyncio.run(coro)


class FakeDb:
    """Devolve, na ordem, o que cada consulta pede: a linha de configuração e/ou a contagem de notas de teste."""

    def __init__(self, *results):
        self.queue = list(results)
        self.commits = 0

    async def execute(self, statement):
        self.current = self.queue.pop(0)
        self.last_params = list(statement.compile().params.values()) if hasattr(statement, "compile") else []
        return self

    def scalar_one_or_none(self):
        return self.current

    def scalar_one(self):
        return self.current

    def add(self, _obj):
        pass

    async def commit(self):
        self.commits += 1

    async def refresh(self, _obj):
        pass


def data(**over):
    base = dict(enabled=True, environment="producao", production_confirmation=True, **COMPLETE)
    base.update(over)
    return FiscalSettingsIn(**base)


@pytest.fixture
def real_provider(monkeypatch):
    """Simula um provedor real configurado (ainda não existe nenhum adaptador real)."""
    monkeypatch.setattr(golive.app_settings, "FISCAL_PROVIDER", "provedor-real")
    monkeypatch.setattr(golive, "get_provider", lambda name, env: SimpleNamespace(name=name))


class TestProblems:
    def test_tudo_pronto_nao_tem_pendencias(self, real_provider):
        assert run(golive.go_live_problems(FakeDb(2), data())) == []

    def test_sem_provedor_real_o_falso_e_o_desligado_nao_servem(self, monkeypatch):
        for name in ("none", "", "fake", "desconhecido"):
            monkeypatch.setattr(golive.app_settings, "FISCAL_PROVIDER", name)
            problems = run(golive.go_live_problems(FakeDb(2), data()))
            assert any("provedor fiscal real" in p for p in problems), name

    def test_exige_uma_venda_de_teste_autorizada_em_homologacao(self, real_provider):
        problems = run(golive.go_live_problems(FakeDb(0), data()))
        assert problems == ["faça ao menos uma venda de teste autorizada em homologação"]

    def test_venda_de_teste_autorizada_e_depois_cancelada_tambem_conta(self, real_provider):
        db = FakeDb(1)
        assert run(golive.go_live_problems(db, data())) == []
        assert ["authorized", "cancelled"] in db.last_params  # o filtro aceita as duas situações

    def test_exige_a_confirmacao_do_contador(self, real_provider):
        problems = run(golive.go_live_problems(FakeDb(1), data(production_confirmation=False)))
        assert problems == ["confirme que o contador validou o cupom emitido em homologação"]

    def test_exige_a_emissao_ligada_com_os_dados_da_empresa(self, real_provider):
        problems = run(golive.go_live_problems(FakeDb(1), FiscalSettingsIn(enabled=False, environment="producao", production_confirmation=True)))
        assert problems == ["ligue a emissão e preencha todos os dados da empresa"]

    def test_lista_tudo_de_uma_vez(self, monkeypatch):
        monkeypatch.setattr(golive.app_settings, "FISCAL_PROVIDER", "none")
        problems = run(golive.go_live_problems(FakeDb(0), FiscalSettingsIn(environment="producao")))
        assert len(problems) == 4


def row(environment="homologacao"):
    return FiscalSettings(enabled=True, environment=environment, regime="normal", series=1, cancel_window_minutes=30)


class TestSaveSettings:
    def test_bloqueia_a_ida_para_producao_e_diz_tudo_que_falta(self, monkeypatch):
        monkeypatch.setattr(golive.app_settings, "FISCAL_PROVIDER", "none")
        r = row()
        with pytest.raises(HTTPException) as info:
            run(svc.save_settings(FakeDb(r, 0), data(production_confirmation=False), "Maria"))
        assert info.value.status_code == 422 and info.value.detail.startswith("Para ir para produção: ")
        assert "provedor fiscal real" in info.value.detail and "venda de teste" in info.value.detail
        assert r.environment == "homologacao" and r.production_confirmed_by is None

    def test_libera_registra_quem_confirmou_e_nao_grava_o_campo_de_confirmacao(self, real_provider):
        r, db = row(), None
        db = FakeDb(r, 1)
        run(svc.save_settings(db, data(), "Maria"))
        assert r.environment == "producao" and r.production_confirmed_by == "Maria" and r.production_confirmed_at is not None
        assert not hasattr(r, "production_confirmation") and db.commits == 1

    def test_ja_em_producao_salvar_outros_dados_nao_repete_a_conferencia(self):
        r = row("producao")
        run(svc.save_settings(FakeDb(r), data(production_confirmation=False, cancel_window_minutes=45), "Maria"))  # sem 2ª consulta: a fila só tem a linha
        assert r.environment == "producao" and r.cancel_window_minutes == 45

    def test_voltar_para_homologacao_limpa_a_confirmacao(self):
        r = row("producao")
        r.production_confirmed_by = "Maria"
        run(svc.save_settings(FakeDb(r), data(environment="homologacao"), "Joao"))
        assert r.environment == "homologacao" and r.production_confirmed_by is None and r.production_confirmed_at is None

    def test_em_homologacao_nao_consulta_a_conferencia(self):
        r = row()
        run(svc.save_settings(FakeDb(r), FiscalSettingsIn(environment="homologacao"), "Maria"))  # fila só com a linha: uma 2ª consulta quebraria
        assert r.environment == "homologacao"
