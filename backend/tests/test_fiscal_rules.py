"""Regras puras dos dados fiscais do produto: validação de campos, herança do padrão da categoria e "pronto para emitir"."""
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services.fiscal import rules


def fiscal(**kw):
    base = {name: None for name in rules.FISCAL_FIELDS}
    base.update(kw)
    return SimpleNamespace(**base)


READY = dict(ncm="07020000", origem=0, cfop="5102", cst_icms="41")


class TestNormalizeField:
    def test_ncm_precisa_de_8_digitos_e_aceita_pontuacao(self):
        assert rules.normalize_field("ncm", "0702.00.00") == "07020000"
        with pytest.raises(ValueError, match="NCM"):
            rules.normalize_field("ncm", "0702")

    def test_cest_tem_7_digitos(self):
        assert rules.normalize_field("cest", "17.001.00") == "1700100"
        with pytest.raises(ValueError, match="CEST"):
            rules.normalize_field("cest", "123")

    def test_nfce_so_aceita_cfop_de_operacao_interna(self):
        assert rules.normalize_field("cfop", "5405") == "5405"
        with pytest.raises(ValueError, match="CFOP"):
            rules.normalize_field("cfop", "6102")
        with pytest.raises(ValueError, match="CFOP"):
            rules.normalize_field("cfop", "51")

    def test_origem_vai_de_0_a_8(self):
        assert rules.normalize_field("origem", "2") == 2
        for bad in (9, -1, "x"):
            with pytest.raises(ValueError, match="Origem"):
                rules.normalize_field("origem", bad)

    def test_cst_tem_2_digitos_e_aceita_zero_a_esquerda(self):
        assert rules.normalize_field("cst_icms", "00") == "00"
        assert rules.normalize_field("cst_pis", 1) == "01"
        with pytest.raises(ValueError, match="CST do ICMS"):
            rules.normalize_field("cst_icms", "060X")

    def test_aliquota_entre_0_e_100_com_2_casas(self):
        assert rules.normalize_field("aliquota_icms", "20.5") == Decimal("20.50")
        with pytest.raises(ValueError, match="Alíquota"):
            rules.normalize_field("aliquota_icms", "100.01")
        with pytest.raises(ValueError, match="Alíquota"):
            rules.normalize_field("aliquota_icms", "-1")

    def test_vazio_vira_none(self):
        assert rules.normalize_field("ncm", "") is None
        assert rules.normalize_field("ncm", None) is None
        assert rules.normalize_field("origem", "  ") is None


class TestMerge:
    def test_o_produto_prevalece_e_o_padrao_preenche_o_que_falta(self):
        own = fiscal(ncm="07020000", cfop=None)
        default = fiscal(ncm="99999999", cfop="5102", cst_icms="41", origem=0)
        merged = rules.merge_fiscal(own, default)
        assert merged["ncm"] == "07020000"
        assert merged["cfop"] == "5102"
        assert merged["cst_icms"] == "41"
        assert merged["origem"] == 0

    def test_zero_e_valor_valido_e_nao_conta_como_vazio(self):
        merged = rules.merge_fiscal(fiscal(origem=0), fiscal(origem=2))
        assert merged["origem"] == 0

    def test_sem_padrao_devolve_so_o_do_produto(self):
        merged = rules.merge_fiscal(fiscal(ncm="07020000"), None)
        assert merged["ncm"] == "07020000"
        assert merged["cfop"] is None


class TestMissing:
    def test_produto_completo_esta_pronto(self):
        merged = rules.merge_fiscal(fiscal(**READY), None)
        assert rules.missing_fields(merged) == []
        assert rules.is_ready(merged)

    def test_lista_o_que_falta_em_portugues(self):
        merged = rules.merge_fiscal(fiscal(ncm="07020000"), None)
        assert rules.missing_fields(merged) == ["Origem", "CFOP", "CST do ICMS"]
        assert not rules.is_ready(merged)

    def test_cst_que_cobra_icms_exige_aliquota(self):
        merged = rules.merge_fiscal(fiscal(**{**READY, "cst_icms": "00"}), None)
        assert rules.missing_fields(merged) == ["Alíquota do ICMS"]
        merged["aliquota_icms"] = Decimal("20.50")
        assert rules.is_ready(merged)

    def test_cst_sem_cobranca_nao_exige_aliquota(self):
        for cst in ("40", "41", "60"):
            merged = rules.merge_fiscal(fiscal(**{**READY, "cst_icms": cst}), None)
            assert rules.is_ready(merged), cst


def test_cst_composto_junta_origem_e_cst():
    assert rules.cst_composto(0, "00") == "000"
    assert rules.cst_composto(2, "60") == "260"


def test_aliquota_nan_ou_infinita_e_erro_de_validacao_e_nao_excecao_inesperada():
    for bad in ("NaN", "sNaN", "Infinity"):
        with pytest.raises(ValueError, match="Alíquota"):
            rules.normalize_field("aliquota_icms", bad)
