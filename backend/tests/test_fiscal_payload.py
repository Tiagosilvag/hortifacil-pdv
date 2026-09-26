"""Montagem do payload da NFC-e: rateio do desconto, pagamentos, CST composto, consumidor e referência única."""
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services.fiscal import payload as fp

D = Decimal


def settings(**kw):
    base = dict(cnpj="11222333000181", ie="123456789", legal_name="EMPRESA TESTE LTDA", regime="normal",
                environment="homologacao", series=1, street="Rua Exemplo", number="100", district="Centro",
                city="Recife", city_ibge="2611606", state="PE", zip_code="50000000")
    base.update(kw)
    return SimpleNamespace(**base)


def item(code, name, unit, qty, price, subtotal, pid=None):
    return SimpleNamespace(product_id=pid or f"p{code}", product_code=code, product_name=name, unit_type=unit,
                           qty=D(qty), unit_price=D(price), subtotal=D(subtotal))


def order(items, *, total, discount="0.00", payment_type="cash", splits=None, customer=None, number=42):
    return SimpleNamespace(order_number=number, total=D(total), discount=D(discount), payment_type=payment_type,
                           payment_splits=splits, items=items, customer=customer)


FISCAL = {"ncm": "07020000", "cest": None, "origem": 0, "cfop": "5102", "cst_icms": "00",
          "aliquota_icms": D("20.50"), "cst_pis": "01", "cst_cofins": "01"}
RESOLVED = lambda *pids: {pid: dict(FISCAL) for pid in pids}  # noqa: E731


class TestAllocateDiscount:
    def test_reparte_proporcional_e_fecha_o_total_exato(self):
        parts = fp.allocate_discount([D("10.00"), D("10.00"), D("10.00")], D("1.00"))
        assert sum(parts) == D("1.00")
        assert parts == [D("0.33"), D("0.33"), D("0.34")]  # o resto de centavos vai para o último

    def test_sem_desconto_nao_reparte_nada(self):
        assert fp.allocate_discount([D("5.00"), D("7.00")], D("0")) == [D("0.00"), D("0.00")]

    def test_o_desconto_de_um_item_nunca_passa_do_valor_dele(self):
        parts = fp.allocate_discount([D("1.00"), D("99.00")], D("100.00"))
        assert parts == [D("1.00"), D("99.00")]

    def test_desconto_maior_que_a_venda_e_limitado_ao_total(self):
        parts = fp.allocate_discount([D("5.00")], D("50.00"))
        assert parts == [D("5.00")]


class TestBuild:
    def build(self, o, **kw):
        return fp.build_nfce_payload(o, kw.get("settings", settings()), RESOLVED(*[i.product_id for i in o.items]))

    def test_item_leva_cst_composto_unidade_e_valores_em_texto(self):
        o = order([item(101, "BANANA PRATA", "kg", "1.235", "6.99", "8.63")], total="8.63")
        p = self.build(o)
        it = p["items"][0]
        assert it["number"] == 1 and it["code"] == "101" and it["description"] == "BANANA PRATA"
        assert it["unit"] == "KG" and it["qty"] == "1.2350"
        assert it["unit_price"] == "6.99" and it["gross"] == "8.63" and it["discount"] == "0.00" and it["net"] == "8.63"
        assert it["ncm"] == "07020000" and it["cfop"] == "5102"
        assert it["cst_icms"] == "00" and it["cst_full"] == "000" and it["icms_rate"] == "20.50"
        assert p["totals"] == {"gross": "8.63", "discount": "0.00", "net": "8.63"}

    def test_sem_cobranca_de_icms_nao_manda_aliquota(self):
        o = order([item(1, "OVOS", "unit", "1", "10.00", "10.00")], total="10.00")
        resolved = {"p1": {**FISCAL, "cst_icms": "41", "aliquota_icms": None}}
        p = fp.build_nfce_payload(o, settings(), resolved)
        assert p["items"][0]["icms_rate"] is None and p["items"][0]["cst_full"] == "041"

    def test_desconto_e_rateado_e_o_liquido_fecha_com_o_total_do_pedido(self):
        o = order([item(1, "A", "unit", "1", "10.00", "10.00"), item(2, "B", "unit", "1", "10.00", "10.00"),
                   item(3, "C", "unit", "1", "10.00", "10.00")], total="29.00", discount="1.00")
        p = self.build(o)
        assert [i["discount"] for i in p["items"]] == ["0.33", "0.33", "0.34"]
        assert sum(D(i["net"]) for i in p["items"]) == D("29.00")
        assert p["totals"] == {"gross": "30.00", "discount": "1.00", "net": "29.00"}

    def test_pedido_com_total_zerado_pelo_desconto_gera_liquido_zero(self):
        o = order([item(1, "A", "unit", "1", "5.00", "5.00")], total="0.00", discount="50.00")
        p = self.build(o)
        assert p["totals"] == {"gross": "5.00", "discount": "5.00", "net": "0.00"}

    @pytest.mark.parametrize("pay,code", [("cash", "01"), ("credit_card", "03"), ("debit_card", "04"), ("pix", "17")])
    def test_forma_de_pagamento_unica(self, pay, code):
        o = order([item(1, "A", "unit", "1", "5.00", "5.00")], total="5.00", payment_type=pay)
        assert self.build(o)["payments"] == [{"method": code, "amount": "5.00"}]

    def test_pagamento_dividido_vem_dos_splits(self):
        o = order([item(1, "A", "unit", "1", "20.00", "20.00")], total="20.00", payment_type="mixed",
                  splits=[{"type": "cash", "amount": 5}, {"type": "pix", "amount": 15.0}])
        assert self.build(o)["payments"] == [{"method": "01", "amount": "5.00"}, {"method": "17", "amount": "15.00"}]

    def test_forma_de_pagamento_desconhecida_e_erro_claro(self):
        o = order([item(1, "A", "unit", "1", "5.00", "5.00")], total="5.00", payment_type="cheque")
        with pytest.raises(ValueError, match="cheque"):
            self.build(o)

    def test_emitente_e_referencia_unica_por_ambiente(self):
        o = order([item(1, "A", "unit", "1", "5.00", "5.00")], total="5.00")
        hml = self.build(o)
        prod = self.build(o, settings=settings(environment="producao"))
        assert hml["reference"] == "hml-42" and prod["reference"] == "prod-42"
        assert hml["environment"] == "homologacao" and hml["series"] == 1
        assert hml["issuer"]["cnpj"] == "11222333000181" and hml["issuer"]["address"]["city_ibge"] == "2611606"

    def test_consumidor_so_com_cpf_ou_cnpj_valido_de_cliente_cadastrado(self):
        base = [item(1, "A", "unit", "1", "5.00", "5.00")]
        assert self.build(order(base, total="5.00"))["consumer"] is None
        cpf = SimpleNamespace(document="123.456.789-09")
        assert self.build(order(base, total="5.00", customer=cpf))["consumer"] == {"kind": "cpf", "document": "12345678909"}
        cnpj = SimpleNamespace(document="11.222.333/0001-81")
        assert self.build(order(base, total="5.00", customer=cnpj))["consumer"] == {"kind": "cnpj", "document": "11222333000181"}
        lixo = SimpleNamespace(document="12345")
        assert self.build(order(base, total="5.00", customer=lixo))["consumer"] is None


def test_o_resto_de_centavos_nunca_estoura_o_valor_de_um_item_pequeno():
    parts = fp.allocate_discount([D("10.00"), D("0.01"), D("0.01")], D("10.01"))
    assert sum(parts) == D("10.01")
    assert all(share <= sub for share, sub in zip(parts, [D("10.00"), D("0.01"), D("0.01")]))
