"""Ida para produção: o que precisa estar pronto antes de a emissão passar a valer como nota fiscal de verdade."""
import asyncio
import base64
import os
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
from app.services.fiscal import vault  # noqa: E402
from tests.fiscal_certs import PASSWORD, make_pfx  # noqa: E402

COMPLETE = dict(cnpj="11222333000181", ie="123456789", legal_name="EMPRESA TESTE LTDA", street="Rua Exemplo", number="100",
                district="Centro", city="Recife", city_ibge="2611606", state="PE", zip_code="50000000")


def run(coro):
    return asyncio.run(coro)


PFX_OK = make_pfx()


class FakeDb:
    """Responde por tipo de consulta: contagem de vendas de teste ou a linha de configuração (o cofre é trocado por `secrets`)."""

    def __init__(self, hml_authorized=1, settings=None):
        self.hml_authorized = hml_authorized
        self.settings = settings
        self.commits = 0
        self.count_params = []

    async def execute(self, statement):
        text = str(statement)
        if "count(" in text.lower():
            self.current = self.hml_authorized
            self.count_params = list(statement.compile().params.values())
        else:
            self.current = self.settings
        return self

    def scalar_one(self):
        return self.current

    def scalar_one_or_none(self):
        return self.current

    def add(self, _obj):
        pass

    async def commit(self):
        self.commits += 1

    async def refresh(self, _obj):
        pass


def secrets(monkeypatch, pfx=PFX_OK, password=PASSWORD, csc=("1", "TOKEN-DO-CSC-1234567890"), cert_error=None, csc_error=None):
    """O que o cofre entrega à trava (decifrado): o .pfx com a senha e o CSC de produção. `None` = não cadastrado."""
    async def load_certificate(_db):
        if cert_error:
            raise cert_error
        return None if pfx is None else (pfx, password)

    async def load_csc(_db, environment):
        assert environment == "producao"
        if csc_error:
            raise csc_error
        return csc

    monkeypatch.setattr(golive.fiscal_secrets, "load_certificate", load_certificate)
    monkeypatch.setattr(golive.fiscal_secrets, "load_csc", load_csc)


def data(**over):
    base = dict(enabled=True, environment="producao", mode="sefaz_direto", production_confirmation=True, **COMPLETE)
    base.update(over)
    return FiscalSettingsIn(**base)


@pytest.fixture
def adapter_ready(monkeypatch):
    """Simula o adaptador do modo direto já pronto (ele só chega na etapa E2) e o cofre com certificado e CSC de produção."""
    monkeypatch.setattr(golive, "mode_available", lambda mode: True)
    secrets(monkeypatch)


@pytest.fixture(autouse=True)
def vault_key(monkeypatch):
    monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", base64.b64encode(bytes(range(32))).decode())


class TestProblems:
    def test_tudo_pronto_nao_tem_pendencias(self, adapter_ready):
        assert run(golive.go_live_problems(FakeDb(2), data())) == []

    def test_so_o_modo_direto_e_real_o_desligado_e_o_de_teste_nao_servem(self, adapter_ready):
        for mode in ("none", "fake"):
            problems = run(golive.go_live_problems(FakeDb(2), data(mode=mode)))
            assert any("modo de emissão real" in p for p in problems), mode

    def test_modo_direto_ainda_sem_adaptador_no_sistema(self):
        problems = run(golive.go_live_problems(FakeDb(2), data()))  # de verdade: o adaptador chega na E2
        assert problems == ["o modo escolhido ainda não está disponível neste sistema (em desenvolvimento)"]

    def test_exige_certificado_cadastrado_e_csc_de_producao(self, adapter_ready, monkeypatch):
        secrets(monkeypatch, pfx=None)
        assert run(golive.go_live_problems(FakeDb(2), data())) == ["cadastre o certificado digital A1"]
        secrets(monkeypatch, csc=None)
        assert run(golive.go_live_problems(FakeDb(2), data())) == ["cadastre o CSC de produção"]

    def test_certificado_vencido_ou_ainda_nao_valido_ou_de_outro_cnpj_nao_serve(self, adapter_ready, monkeypatch):
        secrets(monkeypatch, pfx=make_pfx(valid_from_days=-400, valid_for_days=365))
        assert any("venceu" in p for p in run(golive.go_live_problems(FakeDb(2), data())))
        secrets(monkeypatch, pfx=make_pfx(valid_from_days=10, valid_for_days=365))
        assert any("só vale a partir de" in p for p in run(golive.go_live_problems(FakeDb(2), data())))
        secrets(monkeypatch, pfx=PFX_OK)
        assert any("diferente" in p for p in run(golive.go_live_problems(FakeDb(2), data(cnpj="99888777000166"))))

    def test_certificado_sem_cnpj_nao_serve_para_producao(self, adapter_ready, monkeypatch):
        secrets(monkeypatch, pfx=make_pfx(cnpj_in_cn=None))
        problems = run(golive.go_live_problems(FakeDb(2), data()))
        assert problems == ["o certificado digital não traz o CNPJ da empresa: use um e-CNPJ A1"]

    def test_senha_guardada_que_nao_abre_o_pfx_e_pendencia(self, adapter_ready, monkeypatch):
        secrets(monkeypatch, password="outra-senha")
        problems = run(golive.go_live_problems(FakeDb(2), data()))
        assert len(problems) == 1 and "não serve" in problems[0] and "incorreta" in problems[0]

    def test_sem_chave_mestra_o_cofre_nao_abre_e_a_trava_nao_libera(self, adapter_ready, monkeypatch):
        monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", "")
        problems = run(golive.go_live_problems(FakeDb(2), data()))
        assert len(problems) == 1 and "FISCAL_SECRET_KEY" in problems[0]

    def test_segredo_que_nao_decifra_mais_e_pendencia(self, adapter_ready, monkeypatch):
        broken = vault.VaultUnavailable("mudou")
        secrets(monkeypatch, cert_error=broken, csc_error=broken)
        problems = run(golive.go_live_problems(FakeDb(2), data()))
        assert problems == ["o certificado digital guardado não abre (a chave mestra mudou?): cadastre-o de novo",
                            "o CSC de produção guardado não abre (a chave mestra mudou?): cadastre-o de novo"]

    def test_exige_uma_venda_de_teste_autorizada_em_homologacao(self, adapter_ready):
        assert run(golive.go_live_problems(FakeDb(0), data())) == ["faça ao menos uma venda de teste autorizada em homologação"]

    def test_venda_de_teste_autorizada_e_depois_cancelada_tambem_conta(self, adapter_ready):
        db = FakeDb(1)
        assert run(golive.go_live_problems(db, data())) == []
        assert ["authorized", "cancelled"] in db.count_params  # o filtro aceita as duas situações

    def test_exige_a_confirmacao_do_contador(self, adapter_ready):
        assert run(golive.go_live_problems(FakeDb(1), data(production_confirmation=False))) == [
            "confirme que o contador validou o cupom emitido em homologação"]

    def test_exige_a_emissao_ligada_com_os_dados_da_empresa(self, adapter_ready):
        problems = run(golive.go_live_problems(FakeDb(1), FiscalSettingsIn(
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
        db = FakeDb(1, settings=r)
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
