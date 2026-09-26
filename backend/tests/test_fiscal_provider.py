"""Provedor falso (usado em todos os testes e em desenvolvimento) e a escolha do provedor por configuração."""
import asyncio

import pytest

from app.services.fiscal import provider as prov
from app.services.fiscal.fake import FakeFiscalProvider

PAYLOAD = {"reference": "hml-1", "series": 1, "totals": {"net": "8.63"}}


def run(coro):
    return asyncio.run(coro)


def test_autoriza_e_devolve_numero_chave_de_44_digitos_e_qr():
    result = run(FakeFiscalProvider().emit_nfce(PAYLOAD))
    assert result.status == "authorized"
    assert result.number == "1" and result.series == "1"
    assert len(result.key) == 44 and result.key.isdigit()
    assert result.protocol and result.qr_url.startswith("https://fake.invalid/") and result.xml_url


def test_numera_em_sequencia_e_repetir_a_mesma_referencia_devolve_a_mesma_nota():
    fake = FakeFiscalProvider()
    first = run(fake.emit_nfce({**PAYLOAD, "reference": "hml-1"}))
    second = run(fake.emit_nfce({**PAYLOAD, "reference": "hml-2"}))
    again = run(fake.emit_nfce({**PAYLOAD, "reference": "hml-1"}))
    assert (first.number, second.number) == ("1", "2")
    assert again.key == first.key and again.number == "1"
    assert len(fake.emitted) == 2


def test_modo_rejeitada_devolve_codigo_e_motivo_sem_nota():
    result = run(FakeFiscalProvider(mode="rejected").emit_nfce(PAYLOAD))
    assert result.status == "rejected" and result.code == "778"
    assert "NCM" in result.message and result.key is None


def test_modo_timeout_levanta_provider_unavailable():
    with pytest.raises(prov.ProviderUnavailable):
        run(FakeFiscalProvider(mode="timeout").emit_nfce(PAYLOAD))


def test_cancelar_marca_a_nota_e_cancelar_o_que_nao_existe_e_erro():
    fake = FakeFiscalProvider()
    run(fake.emit_nfce(PAYLOAD))
    assert run(fake.cancel_nfce("hml-1", "Erro de digitação do operador")).cancelled is True
    with pytest.raises(prov.ProviderUnavailable):
        run(fake.cancel_nfce("hml-999", "Erro de digitação do operador"))


class TestGetProvider:
    def test_none_e_vazio_desligam_a_emissao(self):
        assert prov.get_provider("none", "production") is None
        assert prov.get_provider("", "development") is None

    def test_fake_so_em_desenvolvimento(self):
        assert isinstance(prov.get_provider("fake", "development"), FakeFiscalProvider)
        with pytest.raises(RuntimeError, match="produção"):
            prov.get_provider("fake", "production")

    def test_falso_e_recusado_em_qualquer_ambiente_que_nao_seja_desenvolvimento(self):
        for environment in ("production", "prod", "staging"):
            with pytest.raises(RuntimeError, match="produção"):
                prov.get_provider("fake", environment)

    def test_provedor_desconhecido_e_erro_claro(self):
        with pytest.raises(ValueError, match="nuvemfiscal"):
            prov.get_provider("nuvemfiscal", "development")
