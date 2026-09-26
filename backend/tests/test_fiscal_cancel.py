"""Cancelamento da NFC-e junto com o pedido e "Consultar situação": prazo, motivo, falhas do provedor e do banco de dados."""
import asyncio
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

from app.models.fiscal import FiscalEvent  # noqa: E402
from app.services import fiscal_cancel as ops  # noqa: E402
from app.services.fiscal.fake import FakeFiscalProvider  # noqa: E402
from app.services.fiscal.provider import CancelResult  # noqa: E402

REASON = "Cliente desistiu da compra"  # 26 caracteres
NOW = datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)


def run(coro):
    return asyncio.run(coro)


class Result:
    def __init__(self, rows):
        self.rows = rows

    def scalar_one_or_none(self):
        return self.rows[0] if self.rows else None

    def scalars(self):
        return self

    def all(self):
        return list(self.rows)

    def one(self):
        return self.rows[0]


class FakeDb:
    def __init__(self, *results):
        self.queue = list(results)
        self.added = []
        self.commits = 0
        self.refreshed = []

    async def execute(self, _statement):
        return Result(self.queue.pop(0) if self.queue else [])

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj, attribute_names=None):
        self.refreshed.append((obj, attribute_names))

    async def rollback(self):
        pass


def order(minutes_ago=5, **over):
    base = dict(
        id=uuid.uuid4(), order_number=42, fiscal_status="authorized", fiscal_reference="hml-42",
        fiscal_emitted_at=NOW - timedelta(minutes=minutes_ago), fiscal_error=None, fiscal_cancelled_at=None,
        fiscal_cancel_reason=None, fiscal_attempts=1, fiscal_protocol=None, fiscal_qr_url=None, fiscal_xml_url=None,
        invoice_number=None, invoice_series=None, invoice_key=None, items=[],
    )
    base.update(over)
    return SimpleNamespace(**base)


settings = SimpleNamespace(cancel_window_minutes=30)


def provider_with_note(reference="hml-42"):
    fake = FakeFiscalProvider()
    run(fake.emit_nfce({"reference": reference, "series": 1}))
    return fake


class TestReasonAndDeadline:
    def test_motivo_precisa_de_15_a_255_caracteres(self):
        assert ops.validate_cancel_reason("  " + REASON + "  ") == REASON
        for bad in (None, "", "curto demais", "x" * 14):
            with pytest.raises(HTTPException) as info:
                ops.validate_cancel_reason(bad)
            assert info.value.status_code == 422 and "15 caracteres" in info.value.detail
        with pytest.raises(HTTPException) as info:
            ops.validate_cancel_reason("x" * 256)
        assert "255" in info.value.detail

    def test_prazo(self):
        assert ops.cancel_deadline_problem(order(minutes_ago=29), 30, NOW) is None
        assert ops.cancel_deadline_problem(order(minutes_ago=30), 30, NOW) is None
        problem = ops.cancel_deadline_problem(order(minutes_ago=31), 30, NOW)
        assert "passou" in problem and "31 min" in problem and "contador" in problem

    def test_sem_hora_de_emissao_nao_da_para_conferir_o_prazo(self):
        assert "hora de emissão" in ops.cancel_deadline_problem(order(fiscal_emitted_at=None), 30, NOW)


class TestCancelNfce:
    def test_cancela_a_nota_grava_o_motivo_e_a_auditoria(self):
        o, db, fake = order(), FakeDb(), provider_with_note()
        run(ops.cancel_nfce(db, o, fake, settings, REASON, "Maria", now=NOW))
        assert o.fiscal_status == "cancelled" and o.fiscal_cancel_reason == REASON and o.fiscal_cancelled_at == NOW
        assert "hml-42" in fake.cancelled
        (event,) = db.added
        assert isinstance(event, FiscalEvent) and (event.kind, event.status, event.created_by_name) == ("cancel", "cancelled", "Maria")
        assert db.commits == 1  # confirmado já: se o cancelamento do pedido falhar depois, a nota continua cancelada

    def test_pedido_sem_nota_autorizada_nao_chama_o_provedor(self):
        class Boom(FakeFiscalProvider):
            async def cancel_nfce(self, reference, reason):
                raise AssertionError("não deveria chamar o provedor")

        for status in ("not_required", "pending", "cancelled", "rejected"):
            o = order(fiscal_status=status)
            run(ops.cancel_nfce(FakeDb(), o, Boom(), settings, REASON, "Maria", now=NOW))
            assert o.fiscal_status == status

    def test_repetir_depois_de_cancelada_e_seguro(self):
        o, fake = order(), provider_with_note()
        run(ops.cancel_nfce(FakeDb(), o, fake, settings, REASON, "Maria", now=NOW))
        db2 = FakeDb()
        run(ops.cancel_nfce(db2, o, fake, settings, REASON, "Maria", now=NOW))  # o pedido pode ter falhado depois; refazer não repete a nota
        assert db2.added == [] and o.fiscal_status == "cancelled"

    def test_motivo_ruim_para_antes_de_qualquer_coisa(self):
        with pytest.raises(HTTPException) as info:
            run(ops.cancel_nfce(FakeDb(), order(), provider_with_note(), settings, "curto", "Maria", now=NOW))
        assert info.value.status_code == 422

    def test_fora_do_prazo_nao_cancela_nada_e_nao_chama_o_provedor(self):
        o, db, fake = order(minutes_ago=45), FakeDb(), provider_with_note()
        with pytest.raises(HTTPException) as info:
            run(ops.cancel_nfce(db, o, fake, settings, REASON, "Maria", now=NOW))
        assert info.value.status_code == 409 and "prazo" in info.value.detail
        assert o.fiscal_status == "authorized" and fake.cancelled == set() and db.added == []

    def test_prazo_maior_configurado_na_empresa_e_respeitado(self):
        o, fake = order(minutes_ago=600), provider_with_note()
        run(ops.cancel_nfce(FakeDb(), o, fake, SimpleNamespace(cancel_window_minutes=1440), REASON, "Maria", now=NOW))
        assert o.fiscal_status == "cancelled"

    def test_sem_referencia_no_provedor_nao_da_para_cancelar(self):
        with pytest.raises(HTTPException) as info:
            run(ops.cancel_nfce(FakeDb(), order(fiscal_reference=None), provider_with_note(), settings, REASON, "Maria", now=NOW))
        assert info.value.status_code == 409 and "referência" in info.value.detail

    def test_provedor_fora_do_ar_deixa_tudo_como_estava_e_registra_a_tentativa(self):
        o, db = order(), FakeDb()
        with pytest.raises(HTTPException) as info:
            run(ops.cancel_nfce(db, o, FakeFiscalProvider(), settings, REASON, "Maria", now=NOW))  # nota desconhecida no falso = indisponível
        assert info.value.status_code == 502 and "não foram cancelados" in info.value.detail
        assert o.fiscal_status == "authorized"
        (event,) = db.added
        assert (event.kind, event.status) == ("cancel", "pending") and db.commits == 1

    def test_sefaz_recusa_o_cancelamento_e_o_pedido_fica_intacto(self):
        class Recusa(FakeFiscalProvider):
            async def cancel_nfce(self, reference, reason):
                return CancelResult(cancelled=False, code="501", message="Prazo de cancelamento excedido")

        o, db = order(), FakeDb()
        with pytest.raises(HTTPException) as info:
            run(ops.cancel_nfce(db, o, Recusa(), settings, REASON, "Maria", now=NOW))
        assert info.value.status_code == 409 and "Prazo de cancelamento excedido" in info.value.detail
        assert o.fiscal_status == "authorized"
        assert [(e.kind, e.status) for e in db.added] == [("cancel", "rejected")]

    def test_erro_inesperado_do_adaptador_tambem_vira_502_sem_cancelar(self):
        class Quebrado(FakeFiscalProvider):
            async def cancel_nfce(self, reference, reason):
                raise KeyError("boom")

        o = order()
        with pytest.raises(HTTPException) as info:
            run(ops.cancel_nfce(FakeDb(), o, Quebrado(), settings, REASON, "Maria", now=NOW))
        assert info.value.status_code == 502 and o.fiscal_status == "authorized"


class TestCancelForOrderService:
    def test_motivo_ruim_nem_consulta_o_banco(self):
        db = FakeDb()
        with pytest.raises(HTTPException) as info:
            run(ops.cancel_for_order_service(db, order(), "Maria", "curto"))
        assert info.value.status_code == 422 and db.refreshed == []

    def test_sem_provedor_configurado_nao_cancela(self, monkeypatch):
        monkeypatch.setattr(ops, "provider_for_settings", lambda row: None)
        with pytest.raises(HTTPException) as info:
            run(ops.cancel_for_order_service(FakeDb([settings]), order(), "Maria", REASON))
        assert info.value.status_code == 409 and "sem modo de emissão" in info.value.detail

    def test_recarrega_o_estado_da_nota_antes_de_decidir(self, monkeypatch):
        fake = provider_with_note()  # criado antes: o laço de eventos do teste ainda não está rodando
        monkeypatch.setattr(ops, "provider_for_settings", lambda row: fake)
        db, o = FakeDb([settings]), order(fiscal_emitted_at=datetime.now(timezone.utc))  # dentro do prazo, pelo relógio de verdade
        run(ops.cancel_for_order_service(db, o, "Maria", REASON))
        assert db.refreshed == [(o, ["fiscal_status", "fiscal_emitted_at", "fiscal_reference"])]


class TestRefreshOrder:
    def test_descobre_que_a_nota_foi_autorizada_apesar_do_tempo_esgotado(self):
        fake = provider_with_note()
        o = order(fiscal_status="pending", fiscal_error="Provedor indisponível: tempo esgotado")
        db = FakeDb([o])
        result = run(ops.refresh_order(db, o.id, fake, "Maria"))
        assert result is o and o.fiscal_status == "authorized" and o.invoice_key and o.fiscal_error is None
        (event,) = db.added
        assert (event.kind, event.status) == ("refresh", "authorized") and db.commits == 1

    def test_provedor_fora_do_ar_e_502_e_nada_muda(self):
        o = order(fiscal_status="pending")
        with pytest.raises(HTTPException) as info:
            run(ops.refresh_order(FakeDb([o]), o.id, FakeFiscalProvider(), "Maria"))  # nota desconhecida no falso
        assert info.value.status_code == 502 and o.fiscal_status == "pending"

    def test_pedido_que_nunca_foi_ao_provedor_manda_tentar_de_novo(self):
        o = order(fiscal_status="pending", fiscal_reference=None)
        with pytest.raises(HTTPException) as info:
            run(ops.refresh_order(FakeDb([o]), o.id, FakeFiscalProvider(), "Maria"))
        assert info.value.status_code == 409 and "Tentar de novo" in info.value.detail

    def test_nota_ja_autorizada_nao_e_sobrescrita_pela_consulta(self):
        class Pendente(FakeFiscalProvider):
            async def get_nfce(self, reference):
                from app.services.fiscal.provider import EmitResult
                return EmitResult(status="pending", message="processando")

        o = order(invoice_key="0" * 44)
        run(ops.refresh_order(FakeDb([o]), o.id, Pendente(), "Maria"))
        assert o.fiscal_status == "authorized" and o.invoice_key == "0" * 44

    def test_pedido_inexistente_devolve_none(self):
        assert run(ops.refresh_order(FakeDb([]), uuid.uuid4(), FakeFiscalProvider(), "Maria")) is None


class TestCancelOrderEndToEnd:
    """O caminho inteiro: order_service.cancel_order cancela a NFC-e primeiro e só então o pedido."""

    def cancel(self, monkeypatch, o, fake):
        from app.models.order import OrderStatus, PaymentType
        from app.models.user import UserRole
        from app.services import order_service

        monkeypatch.setattr(ops, "provider_for_settings", lambda row: fake)
        o.status, o.payment_type, o.payment_splits, o.customer_id, o.notes = OrderStatus.delivered, PaymentType.cash, None, None, None
        db = FakeDb([("authorized", 1, OrderStatus.delivered)], [settings])  # 1ª consulta: o estado real da nota, lido com trava; 2ª: a configuração fiscal
        admin = SimpleNamespace(id=uuid.uuid4(), name="Maria", role=UserRole.admin)
        run(order_service.cancel_order(db, o, admin, REASON))
        return db

    def test_nota_e_pedido_sao_cancelados_juntos(self, monkeypatch):
        from app.models.order import OrderStatus

        o, fake = order(fiscal_emitted_at=datetime.now(timezone.utc)), provider_with_note()
        self.cancel(monkeypatch, o, fake)
        assert o.fiscal_status == "cancelled" and o.status == OrderStatus.cancelled
        assert "hml-42" in fake.cancelled and REASON in o.notes

    def test_fora_do_prazo_o_pedido_continua_valido(self, monkeypatch):
        from app.models.order import OrderStatus

        o, fake = order(fiscal_emitted_at=datetime.now(timezone.utc) - timedelta(minutes=90)), provider_with_note()
        with pytest.raises(HTTPException) as info:
            self.cancel(monkeypatch, o, fake)
        assert info.value.status_code == 409
        assert o.fiscal_status == "authorized" and o.status == OrderStatus.delivered and fake.cancelled == set()


class TestNotaCanceladaEFinal:
    """Achados da revisão: consultar situação e tentar de novo não podem reabrir, trocar ou apagar uma nota cancelada."""

    def test_consultar_situacao_de_nota_final_nao_chama_o_provedor_nem_muda_nada(self):
        class Boom(FakeFiscalProvider):
            async def get_nfce(self, reference):
                raise AssertionError("não deveria consultar")

        for status in ("authorized", "cancelled"):
            o = order(fiscal_status=status, invoice_key="0" * 44, fiscal_cancel_reason="motivo antigo")
            db = FakeDb([o])
            assert run(ops.refresh_order(db, o.id, Boom(), "Maria")) is o
            assert o.fiscal_status == status and db.added == [] and o.invoice_key == "0" * 44

    def test_consultar_situacao_ainda_atualiza_pendente_e_rejeitada(self):
        fake = provider_with_note()
        for status in ("pending", "rejected"):
            o = order(fiscal_status=status)
            run(ops.refresh_order(FakeDb([o]), o.id, fake, "Maria"))
            assert o.fiscal_status == "authorized"

    def test_emissao_trata_nota_cancelada_como_situacao_final(self):
        from app.services import fiscal_service as svc

        o = order(fiscal_status="cancelled", status="delivered", payment_type="cash", payment_splits=None, total=10, items=[])
        plan = svc.plan_emission(o, settings, {}, {})
        assert isinstance(plan, svc.Skip) and plan.status == "cancelled"
        svc.apply_skip(o, svc.Skip("not_required", "qualquer coisa"))
        assert o.fiscal_status == "cancelled" and o.fiscal_error is None  # nunca volta para not_required

    def test_provedor_falso_de_desenvolvimento_lembra_das_notas_entre_as_chamadas(self):
        from app.services.fiscal.provider import get_provider

        first = get_provider("fake", "development")
        assert get_provider("fake", "development") is first
        run(first.emit_nfce({"reference": "hml-777", "series": 1}))
        assert run(get_provider("fake", "development").cancel_nfce("hml-777", REASON)).cancelled is True

    def test_dois_cancelamentos_ao_mesmo_tempo_o_segundo_nao_repete_nada(self, monkeypatch):
        from app.models.order import OrderStatus, PaymentType
        from app.models.user import UserRole
        from app.services import order_service

        o = order()
        o.status, o.payment_type, o.payment_splits, o.customer_id, o.notes = OrderStatus.delivered, PaymentType.cash, None, None, None
        db = FakeDb([("cancelled", 1, OrderStatus.cancelled)])  # o outro cancelamento já terminou quando esta linha foi lida com a trava
        admin = SimpleNamespace(id=uuid.uuid4(), name="Maria", role=UserRole.admin)
        with pytest.raises(HTTPException) as info:
            run(order_service.cancel_order(db, o, admin, REASON))
        assert info.value.status_code == 400 and "já foi cancelado" in info.value.detail
