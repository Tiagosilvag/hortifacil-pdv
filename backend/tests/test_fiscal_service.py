"""Emissão da NFC-e de um pedido: quando emite, o que grava em cada resultado, idempotência e falhas do provedor."""
import asyncio
import os
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest

# `app.core.config` exige estas variáveis já no import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost/teste")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://teste:teste@localhost/teste")
os.environ.setdefault("SECRET_KEY", "teste")

from fastapi import HTTPException  # noqa: E402

from app.models.fiscal import FiscalEvent  # noqa: E402
from app.services import fiscal_service as svc  # noqa: E402
from app.services.fiscal.fake import FakeFiscalProvider  # noqa: E402
from app.services.fiscal.rules import FISCAL_FIELDS  # noqa: E402

D = Decimal


def run(coro):
    return asyncio.run(coro)


def fiscal_settings(enabled=True):
    return SimpleNamespace(enabled=enabled, environment="homologacao", regime="normal", series=1, cnpj="11222333000181",
                           ie="123456789", legal_name="EMPRESA TESTE LTDA", street="Rua Exemplo", number="100",
                           district="Centro", city="Recife", city_ibge="2611606", state="PE", zip_code="50000000")


def product(code, name, category="Frutas", **own):
    base = {field: None for field in FISCAL_FIELDS}
    base.update(own)
    return SimpleNamespace(id=f"p{code}", code=code, name=name, category=category, **base)


def default(category="Frutas", **kw):
    base = {field: None for field in FISCAL_FIELDS}
    base.update(dict(ncm="08039000", origem=0, cfop="5102", cst_icms="41"), **kw)
    return SimpleNamespace(category=category, **base)


def order_item(prod, qty="1", price="10.00"):
    subtotal = D(qty) * D(price)
    item = SimpleNamespace(product_id=prod.id, product_code=prod.code, product_name=prod.name, unit_type="unit",
                           qty=D(qty), unit_price=D(price), subtotal=subtotal)
    item.__dict__.update({field: None for field in FISCAL_FIELDS})
    return item


def make_order(items, *, payment_type="cash", splits=None, status="delivered", total=None, fiscal_status="not_required"):
    total = total if total is not None else sum(i.subtotal for i in items)
    return SimpleNamespace(
        id=uuid.uuid4(), order_number=7, status=status, payment_type=payment_type, payment_splits=splits,
        total=D(total), discount=D("0"), customer=None, items=items, fiscal_status=fiscal_status, fiscal_error=None,
        fiscal_attempts=0, fiscal_protocol=None, fiscal_qr_url=None, fiscal_xml_url=None, fiscal_emitted_at=None,
        invoice_number=None, invoice_series=None, invoice_key=None,
    )


BANANA = product(101, "BANANA PRATA")  # sem dado próprio: herda o padrão da categoria
DEFAULTS = {"Frutas": default()}


def plan(order, products=(BANANA,), defaults=None):
    return svc.plan_emission(order, fiscal_settings(), {p.id: p for p in products}, DEFAULTS if defaults is None else defaults)


class TestPlan:
    def test_produto_sem_dado_proprio_herda_o_padrao_da_categoria(self):
        result = plan(make_order([order_item(BANANA)]))
        assert isinstance(result, svc.Emission)
        assert result.payload["items"][0]["ncm"] == "08039000"
        assert result.snapshots["p101"]["cst_icms"] == "41"

    def test_o_dado_do_produto_vence_o_padrao(self):
        own = product(101, "BANANA PRATA", ncm="08039011")
        result = plan(make_order([order_item(own)]), products=(own,))
        assert result.snapshots["p101"]["ncm"] == "08039011"

    def test_nota_ja_autorizada_nao_emite_de_novo(self):
        result = plan(make_order([order_item(BANANA)], fiscal_status="authorized"))
        assert isinstance(result, svc.Skip) and result.status == "authorized"

    def test_pedido_cancelado_nao_emite(self):
        result = plan(make_order([order_item(BANANA)], status="cancelled"))
        assert result.status == "not_required" and "cancelado" in result.reason

    @pytest.mark.parametrize("kw", [
        dict(payment_type="installment"),
        dict(payment_type="mixed", splits=[{"type": "cash", "amount": 5}, {"type": "installment", "amount": 5}]),
    ])
    def test_venda_com_fiado_nao_emite_no_c1(self, kw):
        result = plan(make_order([order_item(BANANA)], **kw))
        assert result.status == "not_required" and "fiado" in result.reason

    def test_pedido_de_valor_zero_nao_emite(self):
        result = plan(make_order([order_item(BANANA)], total="0.00"))
        assert result.status == "not_required" and "valor zero" in result.reason

    def test_produto_pendente_bloqueia_a_venda_e_diz_o_que_falta(self):
        semdado = product(205, "OVOS BRANCOS", category="Ovos")
        result = plan(make_order([order_item(BANANA), order_item(semdado)]), products=(BANANA, semdado))
        assert result.status == "pending"
        assert result.reason == "Produtos sem dados fiscais: 205 OVOS BRANCOS (NCM, Origem, CFOP, CST do ICMS)"

    def test_lista_no_maximo_tres_produtos_pendentes(self):
        prods = [product(300 + n, f"P{n}", category="Nada") for n in range(5)]
        result = plan(make_order([order_item(p) for p in prods]), products=prods)
        assert result.reason.count("(NCM") == 3 and result.reason.endswith("; e mais 2")

    def test_forma_de_pagamento_sem_codigo_fica_pendente_com_motivo(self):
        result = plan(make_order([order_item(BANANA)], payment_type="cheque"))
        assert result.status == "pending" and "cheque" in result.reason


class TestRun:
    def emit(self, order, provider):
        emission = plan(order)
        return run(svc.run_emission(order, emission, provider))

    def test_autorizada_grava_nota_no_pedido_e_copia_os_dados_fiscais_para_o_item(self):
        order = make_order([order_item(BANANA)])
        result = self.emit(order, FakeFiscalProvider())
        assert result.status == "authorized"
        assert order.fiscal_status == "authorized" and order.fiscal_error is None
        assert order.invoice_number == "1" and order.invoice_series == "1" and len(order.invoice_key) == 44
        assert order.fiscal_qr_url.startswith("https://fake.invalid/") and order.fiscal_protocol
        assert order.fiscal_emitted_at is not None and order.fiscal_attempts == 1
        assert order.items[0].ncm == "08039000" and order.items[0].cst_icms == "41" and order.items[0].origem == 0

    def test_rejeitada_guarda_o_motivo_e_a_venda_continua(self):
        order = make_order([order_item(BANANA)])
        self.emit(order, FakeFiscalProvider(mode="rejected"))
        assert order.fiscal_status == "rejected"
        assert order.fiscal_error.startswith("778 - NCM") and order.invoice_key is None

    def test_provedor_fora_do_ar_deixa_pendente_e_nao_levanta(self):
        order = make_order([order_item(BANANA)])
        result = self.emit(order, FakeFiscalProvider(mode="timeout"))
        assert result.status == "pending" and order.fiscal_status == "pending"
        assert "indisponível" in order.fiscal_error and order.fiscal_attempts == 1

    def test_erro_inesperado_do_adaptador_tambem_nao_derruba_o_pedido(self):
        class Broken(FakeFiscalProvider):
            async def emit_nfce(self, payload):
                raise KeyError("boom")

        order = make_order([order_item(BANANA)])
        self.emit(order, Broken())
        assert order.fiscal_status == "pending" and "boom" in order.fiscal_error

    def test_tentar_de_novo_apos_falha_emite_e_a_mesma_referencia_nao_duplica_a_nota(self):
        fake = FakeFiscalProvider()
        first = make_order([order_item(BANANA)])
        self.emit(first, fake)
        again = make_order([order_item(BANANA)])  # mesmo order_number = mesma referência no provedor
        self.emit(again, fake)
        assert again.invoice_key == first.invoice_key and len(fake.emitted) == 1
        assert again.fiscal_attempts == 1


def test_skip_nunca_desfaz_uma_nota_autorizada():
    order = make_order([order_item(BANANA)], fiscal_status="authorized")
    svc.apply_skip(order, svc.Skip("pending", "qualquer coisa"))
    assert order.fiscal_status == "authorized" and order.fiscal_error is None


class Result:
    def __init__(self, rows):
        self.rows = rows

    def scalar_one_or_none(self):
        return self.rows[0] if self.rows else None

    def scalars(self):
        return self

    def all(self):
        return list(self.rows)


class FakeDb:
    """Devolve, na ordem, os resultados das consultas de emit_order: pedido, empresa, produtos, padrões."""

    def __init__(self, *results):
        self.queue = list(results)
        self.added = []
        self.commits = 0

    async def execute(self, _statement):
        return Result(self.queue.pop(0))

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1


class TestEmitOrder:
    def db_for(self, order, settings_row):
        return FakeDb([order] if order else [], [settings_row] if settings_row else [], [BANANA], [default()])

    def test_emite_grava_o_evento_de_auditoria_e_confirma(self):
        order = make_order([order_item(BANANA)])
        db = self.db_for(order, fiscal_settings())
        result = run(svc.emit_order(db, order.id, FakeFiscalProvider(), "Maria"))
        assert result is order and order.fiscal_status == "authorized"
        (event,) = db.added
        assert isinstance(event, FiscalEvent)
        assert (event.kind, event.status, event.code, event.created_by_name) == ("emit", "authorized", "100", "Maria")
        assert db.commits == 1

    def test_pedido_que_nao_emite_nao_chama_o_provedor_nem_grava_evento(self):
        class Boom(FakeFiscalProvider):
            async def emit_nfce(self, payload):
                raise AssertionError("não deveria chamar o provedor")

        order = make_order([order_item(BANANA)], payment_type="installment")
        db = self.db_for(order, fiscal_settings())
        run(svc.emit_order(db, order.id, Boom(), "Maria"))
        assert order.fiscal_status == "not_required" and db.added == [] and db.commits == 1

    def test_emissao_desligada_ou_sem_dados_da_empresa(self):
        for row in (fiscal_settings(enabled=False), None):
            order = make_order([order_item(BANANA)])
            with pytest.raises(svc.EmissionDisabled):
                run(svc.emit_order(self.db_for(order, row), order.id, FakeFiscalProvider(), "Maria"))
            assert order.fiscal_status == "not_required"

    def test_pedido_inexistente_devolve_none(self):
        assert run(svc.emit_order(self.db_for(None, fiscal_settings()), uuid.uuid4(), FakeFiscalProvider(), "M")) is None


class TestEntryPoints:
    def test_tentar_de_novo_sem_provedor_e_409(self, monkeypatch):
        monkeypatch.setattr(svc.app_settings, "FISCAL_PROVIDER", "none")
        with pytest.raises(HTTPException) as info:
            run(svc.retry_emission(FakeDb(), uuid.uuid4(), "Maria"))
        assert info.value.status_code == 409 and "não configurada" in info.value.detail

    def test_tentar_de_novo_com_provedor_invalido_ou_falso_em_producao_e_409_e_nao_500(self, monkeypatch):
        for name, environment in (("fake", "production"), ("nuvemfiscal", "development")):
            monkeypatch.setattr(svc.app_settings, "FISCAL_PROVIDER", name)
            monkeypatch.setattr(svc.app_settings, "ENVIRONMENT", environment)
            with pytest.raises(HTTPException) as info:
                run(svc.retry_emission(FakeDb(), uuid.uuid4(), "Maria"))
            assert info.value.status_code == 409 and "não configurada" in info.value.detail

    def test_tentar_de_novo_com_emissao_desligada_e_409(self, monkeypatch):
        monkeypatch.setattr(svc.app_settings, "FISCAL_PROVIDER", "fake")
        order = make_order([order_item(BANANA)])
        db = FakeDb([order], [fiscal_settings(enabled=False)])
        with pytest.raises(HTTPException) as info:
            run(svc.retry_emission(db, order.id, "Maria"))
        assert info.value.status_code == 409 and "desligada" in info.value.detail

    def test_tentar_de_novo_em_pedido_inexistente_e_404(self, monkeypatch):
        monkeypatch.setattr(svc.app_settings, "FISCAL_PROVIDER", "fake")
        with pytest.raises(HTTPException) as info:
            run(svc.retry_emission(FakeDb([]), uuid.uuid4(), "Maria"))
        assert info.value.status_code == 404

    def test_segundo_plano_nunca_levanta_mesmo_com_o_banco_fora(self, monkeypatch):
        monkeypatch.setattr(svc.app_settings, "FISCAL_PROVIDER", "fake")

        def broken_session():
            raise ConnectionError("banco fora")

        monkeypatch.setattr(svc, "AsyncSessionLocal", broken_session)
        run(svc.emit_in_background(uuid.uuid4(), "Maria"))  # não levanta

    def test_segundo_plano_com_provedor_desligado_nem_abre_o_banco(self, monkeypatch):
        monkeypatch.setattr(svc.app_settings, "FISCAL_PROVIDER", "none")
        monkeypatch.setattr(svc, "AsyncSessionLocal", lambda: pytest.fail("não deveria abrir o banco"))
        run(svc.emit_in_background(uuid.uuid4(), "Maria"))


def test_pending_products_considera_o_padrao_da_categoria():
    ok = product(1, "BANANA", category="Frutas")
    sem = product(2, "OVOS", category="Ovos", ncm="04072100")
    lista = svc.pending_products([ok, sem], {"Frutas": default()})
    assert [p["code"] for p in lista] == [2]
    assert lista[0]["missing"] == ["Origem", "CFOP", "CST do ICMS"]
