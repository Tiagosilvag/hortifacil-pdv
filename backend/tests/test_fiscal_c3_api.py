"""Rotas do C3: consultar situação, reenviar pendentes e a ida para produção pela API."""
import os
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

# `app.core.config` exige estas variáveis já no import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost/teste")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://teste:teste@localhost/teste")
os.environ.setdefault("SECRET_KEY", "teste")

from fastapi.testclient import TestClient  # noqa: E402

from app.api.deps import get_current_user  # noqa: E402
from app.core.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.fiscal import FiscalSettings  # noqa: E402
from app.models.user import UserRole  # noqa: E402
from app.services import fiscal_retry  # noqa: E402
from app.services.fiscal import registry  # noqa: E402


class FakeDb:
    def __init__(self, *results):
        self.queue = list(results)

    async def execute(self, _statement):
        self.current = self.queue.pop(0) if self.queue else None
        return self

    def scalar_one_or_none(self):
        return self.current

    def scalar_one(self):
        return self.current

    def add(self, _obj):
        pass

    async def commit(self):
        pass

    async def refresh(self, _obj, attribute_names=None):
        pass


@pytest.fixture
def client():
    def make(role=UserRole.admin, db=None):
        user = SimpleNamespace(id=uuid.uuid4(), name="Maria", role=role, is_active=True)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: db or FakeDb()
        return TestClient(app)

    yield make
    app.dependency_overrides.clear()


COMPLETE = dict(cnpj="11222333000181", ie="123456789", legal_name="EMPRESA TESTE LTDA", street="Rua Exemplo", number="100",
                district="Centro", city="Recife", city_ibge="2611606", state="PE", zip_code="50000000")


class TestRoutes:
    def test_consultar_situacao_sem_provedor_e_409(self, client, monkeypatch):
        monkeypatch.setattr(registry.app_settings, "FISCAL_PROVIDER", "none")
        response = client(UserRole.operator).post(f"/api/v1/fiscal/orders/{uuid.uuid4()}/refresh")
        assert response.status_code == 409 and "sem modo de emissão" in response.json()["detail"]

    def test_consultar_situacao_de_pedido_inexistente_e_404(self, client, monkeypatch):
        monkeypatch.setattr(registry.app_settings, "FISCAL_PROVIDER", "fake")
        response = client(UserRole.operator, db=FakeDb(None)).post(f"/api/v1/fiscal/orders/{uuid.uuid4()}/refresh")
        assert response.status_code == 404

    def test_reenviar_pendentes_so_para_administrador(self, client, monkeypatch):
        monkeypatch.setattr(registry.app_settings, "FISCAL_PROVIDER", "none")
        assert client(UserRole.operator).post("/api/v1/fiscal/retry-pending").status_code == 403
        assert client(UserRole.admin).post("/api/v1/fiscal/retry-pending").status_code == 409  # sem provedor

    def test_reenviar_pendentes_com_a_emissao_desligada_e_409_e_nao_zero_pendentes(self, client, monkeypatch):
        monkeypatch.setattr(registry.app_settings, "FISCAL_PROVIDER", "fake")

        async def disabled(db, provider, now=None):
            from app.services.fiscal_service import EmissionDisabled
            raise EmissionDisabled("desligada")

        monkeypatch.setattr(fiscal_retry, "retry_pending", disabled)
        response = client().post("/api/v1/fiscal/retry-pending")
        assert response.status_code == 409 and "desligada" in response.json()["detail"]

    def test_reenviar_pendentes_com_provedor_devolve_quantos_tentou(self, client, monkeypatch):
        monkeypatch.setattr(registry.app_settings, "FISCAL_PROVIDER", "fake")

        async def fake_retry(db, provider, now=None):
            return 3

        monkeypatch.setattr(fiscal_retry, "retry_pending", fake_retry)
        response = client().post("/api/v1/fiscal/retry-pending")
        assert response.status_code == 200 and response.json() == {"attempted": 3}



class TestSettingsRoutes:
    def row(self, **over):
        base = dict(enabled=True, environment="homologacao", regime="normal", series=1, cancel_window_minutes=30,
                    updated_at=datetime.now(timezone.utc), updated_by_name="Maria", production_confirmed_by=None,
                    production_confirmed_at=None, **COMPLETE)
        base.update(over)
        return FiscalSettings(**base)

    def test_ida_para_producao_sem_as_conferencias_e_422_com_a_lista(self, client, monkeypatch):
        payload = {**COMPLETE, "enabled": True, "environment": "producao", "production_confirmation": False}
        response = client(db=FakeDb(self.row(), 0)).put("/api/v1/fiscal/settings", json=payload)
        assert response.status_code == 422 and "Para ir para produção:" in response.text
        assert "venda de teste" in response.text and "contador" in response.text
