"""Ida para produção: o que precisa estar pronto antes de a emissão passar a valer como nota fiscal de verdade."""
import asyncio
import base64
import os
from datetime import datetime, timedelta, timezone

import pytest

# `app.core.config` exige estas variáveis já no import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost/teste")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://teste:teste@localhost/teste")
os.environ.setdefault("SECRET_KEY", "teste")

from fastapi import HTTPException  # noqa: E402

from app.models.fiscal import FiscalSecret, FiscalSettings  # noqa: E402
from app.schemas.fiscal import FiscalSettingsIn  # noqa: E402
from app.services import fiscal_golive as golive  # noqa: E402
from app.services import fiscal_service as svc  # noqa: E402
from app.services.fiscal import vault  # noqa: E402

COMPLETE = dict(cnpj="11222333000181", ie="123456789", legal_name="EMPRESA TESTE LTDA", street="Rua Exemplo", number="100",
                district="Centro", city="Recife", city_ibge="2611606", state="PE", zip_code="50000000")
NOW = datetime.now(timezone.utc)


def run(coro):
    return asyncio.run(coro)


def certificate_row(days_left=300, cnpj="11222333000181"):
    not_after = NOW + timedelta(days=days_left)
    return FiscalSecret(kind="certificate", ciphertext=b"x", meta={
        "subject": "EMPRESA TESTE LTDA:" + (cnpj or ""), "cnpj": cnpj, "not_before": (NOW - timedelta(days=60)).isoformat(),
        "not_after": not_after.isoformat(), "fingerprint": "ab" * 32})


def csc_prod_row():
    return FiscalSecret(kind="csc_prod", ciphertext=b"x", meta={"id": "1"})


class FakeDb:
    """Responde por tipo de consulta: contagem de vendas de teste, segredos do cofre ou a linha de configuração."""

    def __init__(self, hml_authorized=1, secret_rows=(), settings=None):
        self.hml_authorized = hml_authorized
        self.secret_rows = list(secret_rows)
        self.settings = settings
        self.commits = 0
        self.count_params = []

    async def execute(self, statement):
        text = str(statement)
        if "count(" in text.lower():
            self.current, self.rows = self.hml_authorized, []
            self.count_params = list(statement.compile().params.values())
        elif "fiscal_secrets" in text:
            self.current, self.rows = None, list(self.secret_rows)
        else:
            self.current, self.rows = self.settings, [self.settings] if self.settings else []
        return self

    def scalar_one(self):
        return self.current

    def scalar_one_or_none(self):
        return self.current

    def scalars(self):
        return self

    def all(self):
        return list(self.rows)

    def add(self, _obj):
        pass

    async def commit(self):
        self.commits += 1

    async def refresh(self, _obj):
        pass


def data(**over):
    base = dict(enabled=True, environment="producao", mode="sefaz_direto", production_confirmation=True, **COMPLETE)
    base.update(over)
    return FiscalSettingsIn(**base)


@pytest.fixture
def adapter_ready(monkeypatch):
    """Simula o adaptador do modo direto já pronto (ele só chega na etapa E2)."""
    monkeypatch.setattr(golive, "mode_available", lambda mode: True)


@pytest.fixture(autouse=True)
def vault_key(monkeypatch):
    monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", base64.b64encode(bytes(range(32))).decode())


READY_ROWS = (certificate_row(), csc_prod_row())


class TestProblems:
    def test_tudo_pronto_nao_tem_pendencias(self, adapter_ready):
        assert run(golive.go_live_problems(FakeDb(2, READY_ROWS), data())) == []

    def test_so_o_modo_direto_e_real_o_desligado_e_o_de_teste_nao_servem(self, adapter_ready):
        for mode in ("none", "fake"):
            problems = run(golive.go_live_problems(FakeDb(2, READY_ROWS), data(mode=mode)))
            assert any("modo de emissão real" in p for p in problems), mode

    def test_modo_direto_ainda_sem_adaptador_no_sistema(self):
        problems = run(golive.go_live_problems(FakeDb(2, READY_ROWS), data()))  # de verdade: o adaptador chega na E2
        assert problems == ["o modo escolhido ainda não está disponível neste sistema (em desenvolvimento)"]

    def test_exige_certificado_valido_da_empresa_e_csc_de_producao(self, adapter_ready):
        assert run(golive.go_live_problems(FakeDb(2, [csc_prod_row()]), data())) == ["cadastre o certificado digital A1"]
        assert run(golive.go_live_problems(FakeDb(2, [certificate_row(days_left=-3), csc_prod_row()]), data())) == ["o certificado digital venceu"]
        assert run(golive.go_live_problems(FakeDb(2, [certificate_row(cnpj="99888777000166"), csc_prod_row()]), data())) == [
            "o CNPJ do certificado é diferente do CNPJ da empresa"]
        assert run(golive.go_live_problems(FakeDb(2, [certificate_row()]), data())) == ["cadastre o CSC de produção"]

    def test_exige_uma_venda_de_teste_autorizada_em_homologacao(self, adapter_ready):
        assert run(golive.go_live_problems(FakeDb(0, READY_ROWS), data())) == ["faça ao menos uma venda de teste autorizada em homologação"]

    def test_venda_de_teste_autorizada_e_depois_cancelada_tambem_conta(self, adapter_ready):
        db = FakeDb(1, READY_ROWS)
        assert run(golive.go_live_problems(db, data())) == []
        assert ["authorized", "cancelled"] in db.count_params  # o filtro aceita as duas situações

    def test_exige_a_confirmacao_do_contador(self, adapter_ready):
        assert run(golive.go_live_problems(FakeDb(1, READY_ROWS), data(production_confirmation=False))) == [
            "confirme que o contador validou o cupom emitido em homologação"]

    def test_exige_a_emissao_ligada_com_os_dados_da_empresa(self, adapter_ready):
        problems = run(golive.go_live_problems(FakeDb(1, READY_ROWS), FiscalSettingsIn(
            enabled=False, environment="producao", mode="sefaz_direto", production_confirmation=True, cnpj="11222333000181")))
        assert problems == ["ligue a emissão e preencha todos os dados da empresa"]

    def test_lista_tudo_de_uma_vez(self):
        problems = run(golive.go_live_problems(FakeDb(0), FiscalSettingsIn(environment="producao")))
        assert len(problems) == 4  # modo, emissão ligada, venda de teste e confirmação do contador


def row(environment="homologacao"):
    return FiscalSettings(enabled=True, environment=environment, regime="normal", mode="sefaz_direto", series=1, cancel_window_minutes=30)


class TestSaveSettings:
    def test_bloqueia_a_ida_para_producao_e_diz_tudo_que_falta(self):
        r = row()
        with pytest.raises(HTTPException) as info:
            run(svc.save_settings(FakeDb(0, settings=r), data(production_confirmation=False), "Maria"))
        assert info.value.status_code == 422 and info.value.detail.startswith("Para ir para produção: ")
        assert "ainda não está disponível" in info.value.detail
        assert r.environment == "homologacao" and r.production_confirmed_by is None

    def test_libera_registra_quem_confirmou_e_nao_grava_o_campo_de_confirmacao(self, adapter_ready):
        r = row()
        db = FakeDb(1, READY_ROWS, settings=r)
        run(svc.save_settings(db, data(), "Maria"))
        assert r.environment == "producao" and r.mode == "sefaz_direto" and r.production_confirmed_by == "Maria"
        assert r.production_confirmed_at is not None and not hasattr(r, "production_confirmation") and db.commits == 1

    def test_ja_em_producao_salvar_outros_dados_nao_repete_a_conferencia(self):
        r = row("producao")
        run(svc.save_settings(FakeDb(settings=r), data(production_confirmation=False, cancel_window_minutes=45), "Maria"))
        assert r.environment == "producao" and r.cancel_window_minutes == 45

    def test_voltar_para_homologacao_limpa_a_confirmacao(self):
        r = row("producao")
        r.production_confirmed_by = "Maria"
        run(svc.save_settings(FakeDb(settings=r), data(environment="homologacao"), "Joao"))
        assert r.environment == "homologacao" and r.production_confirmed_by is None and r.production_confirmed_at is None

    def test_em_homologacao_nao_consulta_a_conferencia_e_grava_o_modo(self):
        r = row()
        run(svc.save_settings(FakeDb(settings=r), FiscalSettingsIn(environment="homologacao", mode="sefaz_direto"), "Maria"))
        assert r.environment == "homologacao" and r.mode == "sefaz_direto"
