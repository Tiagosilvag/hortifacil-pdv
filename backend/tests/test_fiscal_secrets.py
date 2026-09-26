"""Segredos fiscais pela tela: certificado A1 e CSC cifrados no cofre, e a garantia de que nada secreto volta ao navegador."""
import asyncio
import base64
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

# `app.core.config` exige estas variáveis já no import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost/teste")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://teste:teste@localhost/teste")
os.environ.setdefault("SECRET_KEY", "teste")

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api.deps import get_current_user  # noqa: E402
from app.core.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.fiscal import FiscalSecret, FiscalSettings  # noqa: E402
from app.models.user import UserRole  # noqa: E402
from app.services import fiscal_secrets as secrets  # noqa: E402
from app.services.fiscal import vault  # noqa: E402
from tests.fiscal_certs import CNPJ, PASSWORD, make_pfx  # noqa: E402

KEY = base64.b64encode(bytes(range(32))).decode()
CSC_TOKEN = "TOKEN-DO-CSC-1234567890"


def run(coro):
    return asyncio.run(coro)


class MemoryDb:
    """Banco falso em memória para os segredos: guarda o que é adicionado e responde às consultas por tipo."""

    def __init__(self, settings=None):
        self.store: list[FiscalSecret] = []
        self.settings = settings
        self.commits = 0
        self.statements = []

    async def execute(self, statement):
        text = str(statement)
        self.statements.append(text)
        self.current = None
        if "fiscal_settings" in text:
            self.rows = [self.settings] if self.settings else []
        elif "fiscal_secrets.kind =" in text:
            kind = list(statement.compile().params.values())[0]
            self.rows = [row for row in self.store if row.kind == kind]
        else:
            self.rows = list(self.store)
        return self

    def scalar_one_or_none(self):
        return self.rows[0] if self.rows else None

    def scalars(self):
        return self

    def all(self):
        return list(self.rows)

    def add(self, obj):
        self.store.append(obj)

    async def delete(self, obj):
        self.store.remove(obj)

    async def commit(self):
        self.commits += 1


@pytest.fixture(autouse=True)
def vault_key(monkeypatch):
    monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", KEY)


def company(cnpj=CNPJ):
    return FiscalSettings(cnpj=cnpj, enabled=False, environment="homologacao", regime="normal", mode="none", series=1, cancel_window_minutes=30)


class TestCertificado:
    def test_guarda_o_pfx_e_a_senha_cifrados_e_so_dados_publicos_na_meta(self):
        db, pfx = MemoryDb(), make_pfx()
        info = run(secrets.save_certificate(db, pfx, PASSWORD, CNPJ, "Maria"))
        kinds = {row.kind: row for row in db.store}
        assert set(kinds) == {"certificate", "certificate_password"} and db.commits == 1
        assert pfx not in kinds["certificate"].ciphertext and PASSWORD.encode() not in kinds["certificate_password"].ciphertext
        assert vault.decrypt("certificate", kinds["certificate"].ciphertext) == pfx
        assert vault.decrypt("certificate_password", kinds["certificate_password"].ciphertext) == PASSWORD.encode()
        assert kinds["certificate"].meta["cnpj"] == CNPJ and kinds["certificate"].updated_by_name == "Maria"
        assert PASSWORD not in json.dumps(kinds["certificate"].meta) and info.cnpj == CNPJ

    def test_cadastrar_de_novo_troca_o_certificado_sem_duplicar_linhas(self):
        db = MemoryDb()
        run(secrets.save_certificate(db, make_pfx(), PASSWORD, CNPJ, "Maria"))
        first = {row.kind: row.ciphertext for row in db.store}
        run(secrets.save_certificate(db, make_pfx(), PASSWORD, CNPJ, "Joao"))
        assert len(db.store) == 2 and {row.kind: row.ciphertext for row in db.store} != first
        assert all(row.updated_by_name == "Joao" for row in db.store)

    @pytest.mark.parametrize("pfx,password,cnpj,message", [
        pytest.param(None, PASSWORD, CNPJ, "Envie o arquivo", id="sem-arquivo"),
        pytest.param(b"", PASSWORD, CNPJ, "Envie o arquivo", id="arquivo-vazio"),
        pytest.param(b"x" * 1_000_001, PASSWORD, CNPJ, "até 1 MB", id="arquivo-grande"),
        pytest.param("valido", "errada", CNPJ, "confira a senha", id="senha-errada"),
        pytest.param("valido", PASSWORD, "99888777000166", "diferente", id="outro-cnpj"),
    ])
    def test_recusas_em_portugues_sem_gravar_nada(self, pfx, password, cnpj, message):
        db = MemoryDb()
        data = make_pfx() if pfx == "valido" else pfx
        with pytest.raises(HTTPException) as info:
            run(secrets.save_certificate(db, data, password, cnpj, "Maria"))
        assert info.value.status_code == 422 and message in info.value.detail
        assert db.store == [] and db.commits == 0

    def test_certificado_vencido_e_recusado(self):
        with pytest.raises(HTTPException) as info:
            run(secrets.save_certificate(MemoryDb(), make_pfx(valid_from_days=-400, valid_for_days=365), PASSWORD, CNPJ, "Maria"))
        assert "Certificado recusado" in info.value.detail and "venceu" in info.value.detail

    def test_sem_chave_mestra_no_servidor_nao_grava_e_ensina_a_criar(self, monkeypatch):
        monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", "")
        db = MemoryDb()
        with pytest.raises(HTTPException) as info:
            run(secrets.save_certificate(db, make_pfx(), PASSWORD, CNPJ, "Maria"))
        assert info.value.status_code == 409 and "FISCAL_SECRET_KEY" in info.value.detail and db.store == []

    def test_remover_apaga_o_certificado_e_a_senha(self):
        db = MemoryDb()
        run(secrets.save_certificate(db, make_pfx(), PASSWORD, CNPJ, "Maria"))
        run(secrets.delete_certificate(db))
        assert db.store == []


class TestCsc:
    def test_guarda_cifrado_e_a_meta_so_tem_o_id(self):
        db = MemoryDb()
        run(secrets.save_csc(db, "homologacao", " 000001 ", f" {CSC_TOKEN} ", "Maria"))
        (row,) = db.store
        assert row.kind == "csc_hml" and row.meta == {"id": "000001"} and CSC_TOKEN.encode() not in row.ciphertext
        assert json.loads(vault.decrypt("csc_hml", row.ciphertext)) == {"id": "000001", "token": CSC_TOKEN}

    def test_producao_e_homologacao_sao_separados(self):
        db = MemoryDb()
        run(secrets.save_csc(db, "homologacao", "1", CSC_TOKEN, "Maria"))
        run(secrets.save_csc(db, "producao", "2", CSC_TOKEN + "X", "Maria"))
        assert sorted(row.kind for row in db.store) == ["csc_hml", "csc_prod"]
        run(secrets.delete_csc(db, "producao"))
        assert [row.kind for row in db.store] == ["csc_hml"]

    @pytest.mark.parametrize("environment,csc_id,token,message", [
        ("teste", "1", CSC_TOKEN, "Ambiente inválido"),
        ("homologacao", "abc", CSC_TOKEN, "só números"),
        ("homologacao", "1234567", CSC_TOKEN, "só números"),
        ("homologacao", "", CSC_TOKEN, "só números"),
        ("homologacao", "1", "curto", "curto demais"),
    ])
    def test_recusas(self, environment, csc_id, token, message):
        db = MemoryDb()
        with pytest.raises(HTTPException) as info:
            run(secrets.save_csc(db, environment, csc_id, token, "Maria"))
        assert info.value.status_code == 422 and message in info.value.detail and db.store == []

    def test_sem_chave_mestra_nao_grava(self, monkeypatch):
        monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", "")
        with pytest.raises(HTTPException) as info:
            run(secrets.save_csc(MemoryDb(), "homologacao", "1", CSC_TOKEN, "Maria"))
        assert info.value.status_code == 409


class TestStatusENuncaVaza:
    def test_status_tem_so_dados_publicos(self):
        db = MemoryDb()
        run(secrets.save_certificate(db, make_pfx(), PASSWORD, CNPJ, "Maria"))
        run(secrets.save_csc(db, "homologacao", "7", CSC_TOKEN, "Maria"))
        status = run(secrets.secrets_status(db))
        assert status["vault_available"] is True
        assert status["certificate"]["configured"] and status["certificate"]["cnpj"] == CNPJ
        assert status["certificate"]["level"] == "ok" and 300 <= status["certificate"]["days_left"] <= 335
        assert status["csc_hml"] == {"configured": True, "id": "7"} and status["csc_prod"] == {"configured": False, "id": None}
        text = repr(status)
        assert PASSWORD not in text and CSC_TOKEN not in text and "ciphertext" not in text

    def test_vencimento_proximo_vira_alerta(self):
        db = MemoryDb()
        run(secrets.save_certificate(db, make_pfx(valid_from_days=-340, valid_for_days=365), PASSWORD, CNPJ, "Maria"))
        certificate = run(secrets.secrets_status(db))["certificate"]
        assert certificate["level"] == "warn" and certificate["days_left"] < 60

    def test_nada_cadastrado_e_sem_chave_mestra(self, monkeypatch):
        monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", "")
        status = run(secrets.secrets_status(MemoryDb()))
        assert status == {"vault_available": False, "certificate": {"configured": False},
                          "csc_hml": {"configured": False, "id": None}, "csc_prod": {"configured": False, "id": None}}


class TestLeituraParaOAdaptador:
    def test_carrega_o_certificado_e_o_csc_decifrados_so_em_memoria(self):
        db, pfx = MemoryDb(), make_pfx()
        assert run(secrets.load_certificate(db)) is None and run(secrets.load_csc(db, "producao")) is None
        run(secrets.save_certificate(db, pfx, PASSWORD, CNPJ, "Maria"))
        run(secrets.save_csc(db, "producao", "9", CSC_TOKEN, "Maria"))
        assert run(secrets.load_certificate(db)) == (pfx, PASSWORD)
        assert run(secrets.load_csc(db, "producao")) == ("9", CSC_TOKEN)
        assert run(secrets.load_csc(db, "homologacao")) is None


@pytest.fixture
def client():
    def make(role=UserRole.admin, db=None):
        user = SimpleNamespace(id=uuid.uuid4(), name="Maria", role=role, is_active=True)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: db or MemoryDb(company())
        return TestClient(app)

    yield make
    app.dependency_overrides.clear()


ROUTES = [
    ("get", "/api/v1/fiscal/secrets", {}),
    ("put", "/api/v1/fiscal/secrets/certificate", {"files": {"file": ("c.pfx", b"x")}, "data": {"password": "x"}}),
    ("delete", "/api/v1/fiscal/secrets/certificate", {}),
    ("put", "/api/v1/fiscal/secrets/csc/homologacao", {"json": {"id": "1", "token": "x" * 12}}),
    ("delete", "/api/v1/fiscal/secrets/csc/homologacao", {}),
]


class TestRotas:
    @pytest.mark.parametrize("method,path,kwargs", ROUTES)
    def test_operador_nao_mexe_nos_segredos(self, client, method, path, kwargs):
        assert getattr(client(UserRole.operator), method)(path, **kwargs).status_code == 403

    def test_envia_o_certificado_e_a_resposta_nao_tem_nenhum_segredo(self, client):
        c, pfx = client(), make_pfx()
        response = c.put("/api/v1/fiscal/secrets/certificate", files={"file": ("empresa.pfx", pfx, "application/x-pkcs12")}, data={"password": PASSWORD})
        assert response.status_code == 200
        body = response.json()
        assert body["certificate"]["configured"] is True and body["certificate"]["cnpj"] == CNPJ
        assert PASSWORD not in response.text and base64.b64encode(pfx).decode()[:40] not in response.text

    def test_senha_errada_e_422_em_portugues(self, client):
        response = client().put("/api/v1/fiscal/secrets/certificate", files={"file": ("e.pfx", make_pfx())}, data={"password": "errada"})
        assert response.status_code == 422 and "confira a senha" in response.json()["detail"]

    def test_certificado_de_outro_cnpj_e_recusado_pelo_cnpj_da_empresa_cadastrada(self, client):
        response = client(db=MemoryDb(company("99888777000166"))).put(
            "/api/v1/fiscal/secrets/certificate", files={"file": ("e.pfx", make_pfx())}, data={"password": PASSWORD})
        assert response.status_code == 422 and "diferente" in response.json()["detail"]

    def test_csc_e_remocao(self, client):
        db = MemoryDb(company())
        c = client(db=db)
        response = c.put("/api/v1/fiscal/secrets/csc/producao", json={"id": "3", "token": CSC_TOKEN})
        assert response.status_code == 200 and response.json()["csc_prod"] == {"configured": True, "id": "3"}
        assert CSC_TOKEN not in response.text
        response = c.delete("/api/v1/fiscal/secrets/csc/producao")
        assert response.status_code == 200 and response.json()["csc_prod"]["configured"] is False

    def test_sem_chave_mestra_a_tela_recebe_o_aviso(self, client, monkeypatch):
        monkeypatch.setattr(vault.app_settings, "FISCAL_SECRET_KEY", "")
        body = client().get("/api/v1/fiscal/secrets").json()
        assert body["vault_available"] is False
        response = client().put("/api/v1/fiscal/secrets/csc/homologacao", json={"id": "1", "token": CSC_TOKEN})
        assert response.status_code == 409 and "FISCAL_SECRET_KEY" in response.json()["detail"]
