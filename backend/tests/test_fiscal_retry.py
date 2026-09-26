"""Reenvio automático das NFC-e pendentes por falha do provedor (a "contingência" possível sem certificado nem SEFAZ próprios)."""
import asyncio
import os
import uuid
from datetime import datetime, timezone

import pytest

# `app.core.config` exige estas variáveis já no import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost/teste")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://teste:teste@localhost/teste")
os.environ.setdefault("SECRET_KEY", "teste")

from app.services import fiscal_retry as ops  # noqa: E402
from app.services import fiscal_service  # noqa: E402
from app.services.fiscal.fake import FakeFiscalProvider  # noqa: E402

NOW = datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)


def run(coro):
    return asyncio.run(coro)


class FakeDb:
    def __init__(self, ids=()):
        self.ids = list(ids)
        self.statements = []
        self.rollbacks = 0

    async def execute(self, statement):
        self.statements.append(str(statement))
        return self

    def scalars(self):
        return self

    def all(self):
        return list(self.ids)

    async def rollback(self):
        self.rollbacks += 1


def test_so_pega_pendentes_que_ja_chamaram_o_provedor_dos_ultimos_dias():
    db = FakeDb([uuid.uuid4()])
    run(ops.pending_order_ids(db, NOW))
    sql = db.statements[0]
    assert "orders.fiscal_status" in sql and "orders.fiscal_attempts >" in sql and "orders.created_at >=" in sql
    assert "LIMIT" in sql and "ORDER BY orders.created_at" in sql


class TestRetryPending:
    def test_reenvia_cada_pedido_pendente(self, monkeypatch):
        ids, called = [uuid.uuid4(), uuid.uuid4()], []

        async def fake_emit(db, order_id, provider, user_name):
            called.append((order_id, user_name))

        monkeypatch.setattr(fiscal_service, "emit_order", fake_emit)
        assert run(ops.retry_pending(FakeDb(ids), FakeFiscalProvider(), NOW)) == 2
        assert called == [(ids[0], ops.RETRY_USER), (ids[1], ops.RETRY_USER)]

    def test_emissao_desligada_para_o_reenvio_sem_erro(self, monkeypatch):
        async def disabled(db, order_id, provider, user_name):
            raise fiscal_service.EmissionDisabled("desligada")

        monkeypatch.setattr(fiscal_service, "emit_order", disabled)
        assert run(ops.retry_pending(FakeDb([uuid.uuid4(), uuid.uuid4()]), FakeFiscalProvider(), NOW)) == 0

    def test_erro_num_pedido_nao_impede_os_demais(self, monkeypatch):
        ids, ok = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()], []

        async def flaky(db, order_id, provider, user_name):
            if order_id == ids[1]:
                raise RuntimeError("banco caiu")
            ok.append(order_id)

        monkeypatch.setattr(fiscal_service, "emit_order", flaky)
        db = FakeDb(ids)
        assert run(ops.retry_pending(db, FakeFiscalProvider(), NOW)) == 2
        assert ok == [ids[0], ids[2]] and db.rollbacks == 1


class TestLoop:
    def test_sem_provedor_ou_com_intervalo_zero_nao_inicia(self, monkeypatch):
        monkeypatch.setattr(ops.app_settings, "FISCAL_PROVIDER", "none")
        monkeypatch.setattr(ops.app_settings, "FISCAL_RETRY_INTERVAL_SECONDS", 120)
        assert ops.start_retry_loop() is None
        monkeypatch.setattr(ops.app_settings, "FISCAL_PROVIDER", "fake")
        monkeypatch.setattr(ops.app_settings, "FISCAL_RETRY_INTERVAL_SECONDS", 0)
        assert ops.start_retry_loop() is None

    def test_com_provedor_e_intervalo_inicia_uma_tarefa_que_pode_ser_cancelada(self, monkeypatch):
        monkeypatch.setattr(ops.app_settings, "FISCAL_PROVIDER", "fake")
        monkeypatch.setattr(ops.app_settings, "FISCAL_RETRY_INTERVAL_SECONDS", 120)

        async def scenario():
            task = ops.start_retry_loop()
            assert task is not None and not task.done()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

        run(scenario())

    def test_um_ciclo_com_erro_nao_mata_os_seguintes(self, monkeypatch):
        monkeypatch.setattr(ops.app_settings, "FISCAL_PROVIDER", "fake")
        sleeps = []

        async def fake_sleep(seconds):
            sleeps.append(seconds)
            if len(sleeps) == 3:
                raise asyncio.CancelledError  # o teste encerra o laço no terceiro ciclo

        class Session:
            async def __aenter__(self):
                return FakeDb()

            async def __aexit__(self, *exc):
                return False

        cycles = []

        async def failing_retry(db, provider, now=None):
            cycles.append(1)
            raise RuntimeError("provedor caiu de vez")

        monkeypatch.setattr(ops.asyncio, "sleep", fake_sleep)
        monkeypatch.setattr(ops, "AsyncSessionLocal", Session)
        monkeypatch.setattr(ops, "retry_pending", failing_retry)
        with pytest.raises(asyncio.CancelledError):
            run(ops.run_retry_loop(120))
        assert sleeps == [120, 120, 120] and len(cycles) == 2  # os dois ciclos com erro não impediram o terceiro
