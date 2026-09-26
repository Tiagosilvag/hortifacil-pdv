"""E0: modo de emissão, cofre de segredos e campos de IBS/CBS (regras, schemas, modelos e a migration 014)."""
import os
from decimal import Decimal

import pytest

# `app.core.config` exige estas variáveis já no import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost/teste")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://teste:teste@localhost/teste")
os.environ.setdefault("SECRET_KEY", "teste")

from pydantic import ValidationError  # noqa: E402

from app.core.database import Base  # noqa: E402
import app.models  # noqa: E402,F401
from app.schemas.fiscal import FiscalDefaultIn, FiscalSettingsIn, FiscalSettingsOut  # noqa: E402
from app.schemas.product import ProductCreate, ProductOut  # noqa: E402
from app.services.fiscal import rules  # noqa: E402
from tests.test_fiscal_schema import sql_for  # noqa: E402

IBS = ("cst_ibs_cbs", "c_class_trib", "aliquota_ibs", "aliquota_cbs")


class TestRegrasIbsCbs:
    def test_cst_tem_3_digitos_e_a_classificacao_6(self):
        assert rules.normalize_field("cst_ibs_cbs", "000") == "000"
        assert rules.normalize_field("c_class_trib", "000001") == "000001"
        with pytest.raises(ValueError, match="CST do IBS/CBS deve ter 3 dígitos"):
            rules.normalize_field("cst_ibs_cbs", "00")
        with pytest.raises(ValueError, match="Classificação tributária do IBS/CBS deve ter 6 dígitos"):
            rules.normalize_field("c_class_trib", "1234")

    def test_aliquotas_de_0_a_100_com_4_casas_e_virgula_decimal(self):
        assert rules.normalize_field("aliquota_ibs", "0,1") == Decimal("0.1000")
        assert rules.normalize_field("aliquota_cbs", "0.9") == Decimal("0.9000")
        for bad in ("101", "-1", "NaN", "abc"):
            with pytest.raises(ValueError):
                rules.normalize_field("aliquota_cbs", bad)

    def test_vazio_vira_none_e_os_campos_entram_na_lista_fiscal(self):
        assert rules.normalize_field("c_class_trib", "") is None
        assert set(IBS) <= set(rules.FISCAL_FIELDS)

    def test_por_enquanto_ibs_cbs_nao_e_exigido_para_o_produto_ficar_pronto(self):
        # O que a nota exige de fato é definido na prova de fogo (E1), depois de ler a nota técnica; até lá nada muda no "pronto".
        merged = {field: None for field in rules.FISCAL_FIELDS} | {"ncm": "07020000", "origem": 0, "cfop": "5102", "cst_icms": "41"}
        assert rules.is_ready(merged)


class TestSchemas:
    def test_produto_e_padrao_da_categoria_aceitam_ibs_cbs(self):
        product = ProductCreate(name="BANANA", price="6.99", category="Frutas", cst_ibs_cbs="000", c_class_trib="000001", aliquota_cbs="0,9")
        assert (product.cst_ibs_cbs, product.c_class_trib, product.aliquota_cbs) == ("000", "000001", Decimal("0.9000"))
        assert FiscalDefaultIn(category="Frutas", aliquota_ibs="0,1").aliquota_ibs == Decimal("0.1000")
        assert set(IBS) <= set(ProductOut.model_fields)

    def test_campo_ibs_invalido_e_erro_de_validacao_em_portugues(self):
        with pytest.raises(ValidationError, match="CST do IBS/CBS deve ter 3 dígitos"):
            ProductCreate(name="X", price="1", category="C", cst_ibs_cbs="1")

    def test_modo_de_emissao_padrao_nenhum_e_saida_com_o_modo(self):
        assert FiscalSettingsIn().mode == "none" and "mode" in FiscalSettingsOut.model_fields

    def test_modos_validos_e_o_de_teste_so_em_desenvolvimento(self, monkeypatch):
        assert FiscalSettingsIn(mode="sefaz_direto").mode == "sefaz_direto"
        monkeypatch.setattr("app.schemas.fiscal.app_settings.ENVIRONMENT", "development")
        assert FiscalSettingsIn(mode="fake").mode == "fake"
        monkeypatch.setattr("app.schemas.fiscal.app_settings.ENVIRONMENT", "production")
        with pytest.raises(ValidationError, match="só existe em desenvolvimento"):
            FiscalSettingsIn(mode="fake")
        for bad in ("provider", "sefaz", ""):  # "provider" ainda não tem adaptador
            with pytest.raises(ValidationError):
                FiscalSettingsIn(mode=bad)


class TestMigration014:
    def test_cria_o_modo_o_cofre_e_as_colunas_de_ibs_cbs_e_desfaz(self):
        up = sql_for("013:014")
        assert "ALTER TABLE fiscal_settings ADD COLUMN mode VARCHAR(20) DEFAULT 'none' NOT NULL" in up
        assert "CREATE TABLE fiscal_secrets (" in up and "ciphertext BYTEA NOT NULL" in up and "UNIQUE (kind)" in up
        for table in ("products", "order_items", "fiscal_defaults"):
            for column in IBS:
                assert f"ALTER TABLE {table} ADD COLUMN {column} " in up, (table, column)
                assert column in Base.metadata.tables[table].columns
        secrets = Base.metadata.tables["fiscal_secrets"].columns.keys()
        body = up.split("CREATE TABLE fiscal_secrets (")[1].split(");")[0]
        assert all(f"\n    {column} " in body for column in secrets)
        down = sql_for("014:013", downgrade=True)
        assert "DROP TABLE fiscal_secrets" in down and "ALTER TABLE fiscal_settings DROP COLUMN mode" in down
        assert "ALTER TABLE products DROP COLUMN aliquota_cbs" in down
