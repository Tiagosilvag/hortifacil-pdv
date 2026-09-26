"""Certificado digital A1: senha, validade, CNPJ do titular e o nível de alerta de vencimento. Só certificados de teste gerados na hora."""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.fiscal import certificate as cert
from tests.fiscal_certs import CNPJ, PASSWORD, make_pfx

NOW = datetime.now(timezone.utc)


class TestInspect:
    def test_le_titular_cnpj_e_validade(self):
        info = cert.inspect_pfx(make_pfx(), PASSWORD)
        assert info.subject == f"EMPRESA TESTE LTDA:{CNPJ}" and info.cnpj == CNPJ
        assert info.not_before < NOW < info.not_after and len(info.fingerprint) == 64

    def test_cnpj_tambem_vem_do_campo_icp_brasil_do_subject_alt_name(self):
        info = cert.inspect_pfx(make_pfx(cnpj_in_cn=None, cnpj_in_san=CNPJ), PASSWORD)
        assert info.cnpj == CNPJ

    def test_certificado_sem_cnpj_devolve_none(self):
        assert cert.inspect_pfx(make_pfx(cnpj_in_cn=None), PASSWORD).cnpj is None

    def test_senha_errada_ou_arquivo_que_nao_e_pfx_da_mensagem_em_portugues(self):
        for data, password in ((make_pfx(), "errada"), (b"isto nao e um pfx", PASSWORD), (b"", PASSWORD)):
            with pytest.raises(cert.CertificateError, match="confira a senha"):
                cert.inspect_pfx(data, password)

    def test_pfx_sem_chave_privada_e_recusado(self):
        with pytest.raises(cert.CertificateError, match="chave privada"):
            cert.inspect_pfx(make_pfx(with_key=False), PASSWORD)

    def test_a_impressao_digital_e_estavel_para_o_mesmo_certificado(self):
        pfx = make_pfx()
        assert cert.inspect_pfx(pfx, PASSWORD).fingerprint == cert.inspect_pfx(pfx, PASSWORD).fingerprint
        assert cert.inspect_pfx(make_pfx(), PASSWORD).fingerprint != cert.inspect_pfx(pfx, PASSWORD).fingerprint


class TestProblemas:
    def test_certificado_valido_da_empresa_certa_nao_tem_problema(self):
        info = cert.inspect_pfx(make_pfx(), PASSWORD)
        assert cert.problems_for_company(info, CNPJ) == []
        assert cert.problems_for_company(info, "11.222.333/0001-81") == []  # o CNPJ da empresa pode vir com pontuação

    def test_vencido(self):
        info = cert.inspect_pfx(make_pfx(valid_from_days=-400, valid_for_days=365), PASSWORD)
        assert any("venceu em" in p for p in cert.problems_for_company(info, CNPJ))

    def test_ainda_nao_vale(self):
        info = cert.inspect_pfx(make_pfx(valid_from_days=10, valid_for_days=365), PASSWORD)
        assert any("só vale a partir de" in p for p in cert.problems_for_company(info, CNPJ))

    def test_cnpj_diferente_da_empresa(self):
        info = cert.inspect_pfx(make_pfx(), PASSWORD)
        assert any("diferente" in p for p in cert.problems_for_company(info, "99888777000166"))

    def test_sem_cnpj_no_certificado_avisa_em_vez_de_aceitar_calado(self):
        info = cert.inspect_pfx(make_pfx(cnpj_in_cn=None), PASSWORD)
        assert any("não achei o CNPJ" in p for p in cert.problems_for_company(info, CNPJ))

    def test_sem_cnpj_da_empresa_cadastrado_so_confere_a_validade(self):
        assert cert.problems_for_company(cert.inspect_pfx(make_pfx(), PASSWORD), None) == []


class TestVencimento:
    def level(self, days_left: int) -> str:
        info = cert.inspect_pfx(make_pfx(valid_from_days=-10, valid_for_days=10 + days_left), PASSWORD)
        return cert.expiry_level(info)

    def test_niveis(self):
        assert self.level(200) == "ok"
        assert self.level(59) == "warn"
        assert self.level(14) == "critical"
        assert self.level(-5) == "critical"  # já venceu

    def test_dias_que_faltam(self):
        info = cert.inspect_pfx(make_pfx(valid_for_days=100, valid_from_days=0), PASSWORD)
        assert cert.days_left(info) in (98, 99)
        assert cert.days_left(info, now=info.not_after + timedelta(days=3)) == -3
