"""Dados fiscais no cadastro: validação nos schemas, campos no modelo e migrations 011 e 012 (SQL gerado, sem banco)."""
import io
import os
from pathlib import Path
from types import SimpleNamespace

import pytest

# `app.core.config` exige estas variáveis já no import.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://teste:teste@localhost/teste")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://teste:teste@localhost/teste")
os.environ.setdefault("SECRET_KEY", "teste")

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from app.core.database import Base  # noqa: E402
import app.models  # noqa: E402,F401
from app.schemas.fiscal import FiscalDefaultIn, FiscalSettingsIn  # noqa: E402
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate  # noqa: E402
from app.services.fiscal.rules import FISCAL_FIELDS  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]


def sql_for(revisions: str, downgrade: bool = False) -> str:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    cfg.output_buffer = io.StringIO()
    (command.downgrade if downgrade else command.upgrade)(cfg, revisions, sql=True)
    return cfg.output_buffer.getvalue()


class TestProductSchemas:
    base = dict(name="BANANA", price="6.99", category="Frutas")

    def test_campos_fiscais_sao_opcionais_e_normalizados(self):
        product = ProductCreate(**self.base, ncm="0803.90.00", origem="0", cfop="5102", cst_icms="41")
        assert product.ncm == "08039000" and product.origem == 0 and product.cst_icms == "41"
        assert ProductCreate(**self.base).ncm is None

    def test_valor_fiscal_invalido_e_erro_de_validacao_em_portugues(self):
        with pytest.raises(ValidationError, match="NCM deve ter 8 dígitos"):
            ProductCreate(**self.base, ncm="123")
        with pytest.raises(ValidationError, match="operação interna"):
            ProductUpdate(cfop="6102")

    def test_a_saida_devolve_os_campos_fiscais(self):
        assert set(FISCAL_FIELDS) <= set(ProductOut.model_fields)


class TestFiscalSettingsSchema:
    complete = dict(cnpj="11.222.333/0001-81", ie="123.456.789", legal_name="EMPRESA TESTE LTDA", street="Rua Exemplo",
                    number="100", district="Centro", city="Recife", city_ibge="2611606", state="pe",
                    zip_code="50000-000")

    def test_ligar_a_emissao_exige_os_dados_da_empresa(self):
        with pytest.raises(ValidationError, match="Para ligar a emissão, preencha: CNPJ"):
            FiscalSettingsIn(enabled=True)
        FiscalSettingsIn(enabled=False)  # desligada não exige nada

    def test_normaliza_documentos_uf_e_cep(self):
        s = FiscalSettingsIn(enabled=True, **self.complete)
        assert (s.cnpj, s.ie, s.state, s.zip_code) == ("11222333000181", "123456789", "PE", "50000000")

    def test_simples_nacional_ainda_nao_pode_ligar_a_emissao(self):
        with pytest.raises(ValidationError, match="regime normal"):
            FiscalSettingsIn(enabled=True, regime="simples", **self.complete)
        FiscalSettingsIn(enabled=False, regime="simples")  # só guardar o regime é permitido

    def test_rejeita_cnpj_e_ambiente_invalidos(self):
        with pytest.raises(ValidationError, match="CNPJ deve ter 14 dígitos"):
            FiscalSettingsIn(cnpj="123")
        with pytest.raises(ValidationError):
            FiscalSettingsIn(environment="teste")
        with pytest.raises(ValidationError):
            FiscalSettingsIn(regime="mei")

    def test_padrao_por_categoria_normaliza_e_exige_a_categoria(self):
        default = FiscalDefaultIn(category=" Frutas ", ncm="0803.90.00", cst_icms="41")
        assert default.category == "Frutas" and default.ncm == "08039000"
        with pytest.raises(ValidationError):
            FiscalDefaultIn(category="  ")


class TestModelsAndMigrations:
    def test_produto_e_item_tem_os_mesmos_campos_fiscais(self):
        for table in ("products", "order_items", "fiscal_defaults"):
            columns = set(Base.metadata.tables[table].columns.keys())
            assert set(FISCAL_FIELDS) <= columns, table

    def test_o_pedido_nasce_sem_nota_exigida(self):
        column = Base.metadata.tables["orders"].columns["fiscal_status"]
        assert column.server_default.arg == "not_required" and column.nullable is False

    def test_migration_011_cria_todas_as_colunas_dos_modelos(self):
        sql = sql_for("010:011")
        for table in ("products", "order_items"):
            for field in FISCAL_FIELDS:
                assert f"ALTER TABLE {table} ADD COLUMN {field} " in sql, (table, field)
        for column in Base.metadata.tables["orders"].columns.keys():
            if column.startswith("fiscal_"):
                assert f"ALTER TABLE orders ADD COLUMN {column} " in sql, column

    def test_migration_012_cria_as_tres_tabelas_com_todas_as_colunas(self):
        sql = sql_for("011:012")
        for table in ("fiscal_settings", "fiscal_defaults", "fiscal_events"):
            assert f"CREATE TABLE {table} (" in sql, table
            body = sql.split(f"CREATE TABLE {table} (")[1].split(");")[0]
            for column in Base.metadata.tables[table].columns.keys():
                assert f"\n    {column} " in body, (table, column)

    def test_downgrade_desfaz_tudo(self):
        sql = sql_for("012:010", downgrade=True)
        for table in ("fiscal_events", "fiscal_defaults", "fiscal_settings"):
            assert f"DROP TABLE {table}" in sql
        assert "ALTER TABLE orders DROP COLUMN fiscal_status" in sql
        assert "ALTER TABLE products DROP COLUMN ncm" in sql
        assert "ALTER TABLE order_items DROP COLUMN cst_cofins" in sql
