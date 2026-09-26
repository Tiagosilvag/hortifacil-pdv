"""Configurações novas do C3 (prazo de cancelamento, confirmação de produção) e a migration 013."""
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
from pydantic import ValidationError  # noqa: E402

from app.api.deps import get_current_user  # noqa: E402
from app.core.database import Base  # noqa: E402
from app.core.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.fiscal import FiscalSettings  # noqa: E402
from app.models.user import UserRole  # noqa: E402
from app.schemas.fiscal import FiscalSettingsIn  # noqa: E402
from tests.test_fiscal_schema import sql_for  # noqa: E402


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


class TestSettingsRoutes:
    def row(self, **over):
        base = dict(enabled=True, environment="homologacao", regime="normal", series=1, cancel_window_minutes=30,
                    updated_at=datetime.now(timezone.utc), updated_by_name="Maria", production_confirmed_by=None,
                    production_confirmed_at=None, **COMPLETE)
        base.update(over)
        return FiscalSettings(**base)

    def test_a_tela_recebe_o_prazo_e_quem_confirmou_a_producao(self, client):
        body = client(db=FakeDb(self.row(environment="producao", production_confirmed_by="Joao"))).get("/api/v1/fiscal/settings").json()
        assert body["cancel_window_minutes"] == 30 and body["production_confirmed_by"] == "Joao"

    def test_prazo_de_cancelamento_fora_da_faixa_e_422(self, client):
        for bad in (0, 1441):
            response = client(db=FakeDb(self.row())).put("/api/v1/fiscal/settings", json={"cancel_window_minutes": bad})
            assert response.status_code == 422 and "Prazo de cancelamento" in response.text


class TestSchema:
    def test_prazo_padrao_de_30_minutos_e_limites(self):
        assert FiscalSettingsIn().cancel_window_minutes == 30
        assert FiscalSettingsIn(cancel_window_minutes=1440).cancel_window_minutes == 1440
        for bad in (0, -5, 1441):
            with pytest.raises(ValidationError, match="Prazo de cancelamento"):
                FiscalSettingsIn(cancel_window_minutes=bad)


class TestMigration013:
    def test_cria_as_colunas_dos_modelos_e_desfaz(self):
        up = sql_for("012:013")
        for column in ("fiscal_reference", "fiscal_cancelled_at", "fiscal_cancel_reason"):
            assert f"ALTER TABLE orders ADD COLUMN {column} " in up and column in Base.metadata.tables["orders"].columns
        for column in ("cancel_window_minutes", "production_confirmed_by", "production_confirmed_at"):
            assert f"ALTER TABLE fiscal_settings ADD COLUMN {column} " in up and column in Base.metadata.tables["fiscal_settings"].columns
        assert "cancel_window_minutes INTEGER DEFAULT '30' NOT NULL" in up
        down = sql_for("013:012", downgrade=True)
        assert "ALTER TABLE orders DROP COLUMN fiscal_reference" in down
        assert "ALTER TABLE fiscal_settings DROP COLUMN production_confirmed_at" in down
