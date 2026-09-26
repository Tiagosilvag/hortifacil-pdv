"""Rotas fiscais: quem pode o quê, o status para o PDV, a emissão em segundo plano no pedido e o cancelamento protegido."""
import asyncio
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
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
from app.models.order import OrderStatus, PaymentType  # noqa: E402
from app.models.user import UserRole  # noqa: E402
from app.services import fiscal_service, order_service  # noqa: E402

COMPLETE = dict(enabled=True, environment="homologacao", regime="normal", series=1, cnpj="11222333000181",
                ie="123456789", legal_name="EMPRESA TESTE LTDA", street="Rua Exemplo", number="100",
                district="Centro", city="Recife", city_ibge="2611606", state="PE", zip_code="50000000")


class Result:
    def __init__(self, rows):
        self.rows = rows

    def scalar_one_or_none(self):
        return self.rows[0] if self.rows else None

    def one(self):
        return self.rows[0]

    def scalars(self):
        return self

    def all(self):
        return list(self.rows)


class FakeDb:
    def __init__(self, *results):
        self.queue = list(results)

    async def execute(self, _statement):
        return Result(self.queue.pop(0) if self.queue else [])

    def add(self, _obj):
        pass

    async def commit(self):
        pass

    async def refresh(self, _obj):
        pass


def user(role):
    return SimpleNamespace(id=uuid.uuid4(), name="Maria", role=role, is_active=True)


@pytest.fixture
def client():
    def make(role=UserRole.admin, db=None):
        app.dependency_overrides[get_current_user] = lambda: user(role)
        app.dependency_overrides[get_db] = lambda: db or FakeDb()
        return TestClient(app)

    yield make
    app.dependency_overrides.clear()


class TestPermissions:
    @pytest.mark.parametrize("method,path", [
        ("get", "/api/v1/fiscal/settings"),
        ("put", "/api/v1/fiscal/settings"),
        ("get", "/api/v1/fiscal/defaults"),
        ("put", "/api/v1/fiscal/defaults"),
        ("delete", f"/api/v1/fiscal/defaults/{uuid.uuid4()}"),
    ])
    def test_operador_nao_mexe_na_configuracao_fiscal(self, client, method, path):
        response = getattr(client(UserRole.operator), method)(path, **({"json": {}} if method == "put" else {}))
        assert response.status_code == 403

    def test_operador_ve_o_status_e_os_produtos_pendentes(self, client):
        c = client(UserRole.operator)
        assert c.get("/api/v1/fiscal/status").status_code == 200
        assert c.get("/api/v1/fiscal/pending-products").status_code == 200


class TestSettings:
    def test_ligar_sem_dados_da_empresa_e_422_com_o_que_falta(self, client):
        response = client().put("/api/v1/fiscal/settings", json={"enabled": True})
        assert response.status_code == 422
        assert "Para ligar a emissão, preencha: CNPJ" in response.text

    def test_admin_salva_os_dados_completos(self, client):
        response = client(db=FakeDb([])).put("/api/v1/fiscal/settings", json=COMPLETE)
        assert response.status_code == 200
        body = response.json()
        assert body["enabled"] is True and body["cnpj"] == "11222333000181" and body["updated_by_name"] == "Maria"


class TestStatus:
    ISSUER = dict(legal_name="EMPRESA TESTE LTDA", cnpj="11222333000181", ie="123456789", street="Rua Exemplo",
                  number="100", district="Centro", city="Recife", state="PE", zip_code="50000000")

    def row(self, enabled=True, environment="homologacao", **issuer):
        return SimpleNamespace(enabled=enabled, environment=environment, **{**self.ISSUER, **issuer})

    def test_desligada_por_padrao(self, client, monkeypatch):
        monkeypatch.setattr("app.api.v1.fiscal.app_settings.FISCAL_PROVIDER", "none")
        body = client(db=FakeDb([])).get("/api/v1/fiscal/status").json()
        assert body == {"enabled": False, "provider_configured": False, "environment": "homologacao", "issuer": None}

    def test_ligada_so_com_provedor_configurado(self, client, monkeypatch):
        monkeypatch.setattr("app.api.v1.fiscal.app_settings.FISCAL_PROVIDER", "none")
        assert client(db=FakeDb([self.row()])).get("/api/v1/fiscal/status").json()["enabled"] is False
        monkeypatch.setattr("app.api.v1.fiscal.app_settings.FISCAL_PROVIDER", "fake")
        body = client(db=FakeDb([self.row(environment="producao")])).get("/api/v1/fiscal/status").json()
        assert body["enabled"] is True and body["provider_configured"] is True and body["environment"] == "producao"
        assert body["issuer"] == {**self.ISSUER}

    def test_qualquer_usuario_ve_a_empresa_para_imprimir_o_cupom_fiscal(self, client, monkeypatch):
        monkeypatch.setattr("app.api.v1.fiscal.app_settings.FISCAL_PROVIDER", "none")
        body = client(UserRole.operator, db=FakeDb([self.row()])).get("/api/v1/fiscal/status").json()
        assert body["issuer"]["legal_name"] == "EMPRESA TESTE LTDA" and body["issuer"]["cnpj"] == "11222333000181"

    def test_sem_cnpj_cadastrado_nao_ha_empresa_emitente(self, client, monkeypatch):
        monkeypatch.setattr("app.api.v1.fiscal.app_settings.FISCAL_PROVIDER", "none")
        body = client(db=FakeDb([self.row(cnpj=None)])).get("/api/v1/fiscal/status").json()
        assert body["issuer"] is None

    def test_provedor_falso_em_producao_conta_como_nao_configurado_e_nao_derruba_a_tela(self, client, monkeypatch):
        monkeypatch.setattr("app.api.v1.fiscal.app_settings.FISCAL_PROVIDER", "fake")
        monkeypatch.setattr("app.api.v1.fiscal.app_settings.ENVIRONMENT", "production")
        body = client(db=FakeDb([self.row()])).get("/api/v1/fiscal/status").json()
        assert body["enabled"] is False and body["provider_configured"] is False


def order_out(order_id):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=order_id, order_number=1, customer_id=None, customer=None, total=Decimal("5.00"), discount=Decimal("0"),
        payment_type="cash", payment_splits=None, status=OrderStatus.pending, notes=None, invoice_number=None,
        invoice_series=None, invoice_key=None, fiscal_status="not_required", fiscal_protocol=None, fiscal_qr_url=None,
        fiscal_xml_url=None, fiscal_emitted_at=None, fiscal_error=None, fiscal_attempts=0, created_at=now,
        created_by_name="Maria", items=[],
    )


class TestOrders:
    def test_criar_pedido_agenda_a_emissao_depois_da_resposta(self, client, monkeypatch):
        created = order_out(uuid.uuid4())

        async def fake_create(db, data, current_user):
            return created

        calls = []

        async def fake_emit(order_id, user_name):
            calls.append((order_id, user_name))

        monkeypatch.setattr(order_service, "create_order", fake_create)
        monkeypatch.setattr(fiscal_service, "emit_in_background", fake_emit)
        response = client().post("/api/v1/orders", json={
            "payment_type": "cash", "items": [{"product_id": str(uuid.uuid4()), "qty": "1"}],
        })
        assert response.status_code == 201
        assert response.json()["fiscal_status"] == "not_required"
        assert calls == [(created.id, "Maria")]

    @staticmethod
    def order_to_cancel():
        return SimpleNamespace(id=uuid.uuid4(), status=OrderStatus.delivered, items=[], order_number=3,
                               payment_type=PaymentType.cash, payment_splits=None, customer_id=None, notes=None)

    @pytest.mark.parametrize("fiscal_status,attempts", [("authorized", 1), ("pending", 2)])
    def test_pedido_com_nfce_autorizada_ou_em_processamento_nao_pode_ser_cancelado_ainda(self, fiscal_status, attempts):
        order = self.order_to_cancel()
        db = FakeDb([(fiscal_status, attempts)])  # o estado REAL da nota, lido com trava, vale mais que o objeto em memória
        with pytest.raises(HTTPException) as info:
            asyncio.run(order_service.cancel_order(db, order, user(UserRole.admin), "erro"))
        assert info.value.status_code == 409 and "NFC-e" in info.value.detail
        assert order.status == OrderStatus.delivered

    @pytest.mark.parametrize("fiscal_status,attempts", [("not_required", 0), ("pending", 0), ("rejected", 1)])
    def test_sem_nota_valida_o_cancelamento_segue_normalmente(self, fiscal_status, attempts):
        order = self.order_to_cancel()
        asyncio.run(order_service.cancel_order(FakeDb([(fiscal_status, attempts)]), order, user(UserRole.admin), "erro"))
        assert order.status == OrderStatus.cancelled

    def test_cadastro_manual_da_nota_nao_sobrescreve_a_chave_de_uma_nfce_autorizada(self):
        order = SimpleNamespace(fiscal_status="authorized", invoice_number="1", invoice_series="1", invoice_key="0" * 44)
        data = SimpleNamespace(invoice_number="9", invoice_series="9", invoice_key=None)
        with pytest.raises(HTTPException) as info:
            asyncio.run(order_service.update_invoice(FakeDb(), order, data))
        assert info.value.status_code == 409 and order.invoice_key == "0" * 44

    def test_tentar_de_novo_sem_provedor_e_409(self, client, monkeypatch):
        monkeypatch.setattr(fiscal_service.app_settings, "FISCAL_PROVIDER", "none")
        response = client(UserRole.operator).post(f"/api/v1/fiscal/orders/{uuid.uuid4()}/emit")
        assert response.status_code == 409
