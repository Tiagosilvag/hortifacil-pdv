"""tabelas fiscais: dados da empresa, padrão por categoria e auditoria de eventos

Revision ID: 012
Revises: 011
Create Date: 2026-09-25
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fiscal_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("environment", sa.String(15), nullable=False, server_default="homologacao"),
        sa.Column("regime", sa.String(10), nullable=False, server_default="normal"),
        sa.Column("series", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("cnpj", sa.String(14), nullable=True),
        sa.Column("ie", sa.String(20), nullable=True),
        sa.Column("legal_name", sa.String(255), nullable=True),
        sa.Column("street", sa.String(255), nullable=True),
        sa.Column("number", sa.String(20), nullable=True),
        sa.Column("district", sa.String(100), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("city_ibge", sa.String(7), nullable=True),
        sa.Column("state", sa.String(2), nullable=True),
        sa.Column("zip_code", sa.String(8), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_by_name", sa.String(255), nullable=True),
    )
    op.create_table(
        "fiscal_defaults",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("category", sa.String(100), nullable=False, unique=True),
        sa.Column("ncm", sa.String(8), nullable=True),
        sa.Column("cest", sa.String(7), nullable=True),
        sa.Column("origem", sa.Integer(), nullable=True),
        sa.Column("cfop", sa.String(4), nullable=True),
        sa.Column("cst_icms", sa.String(2), nullable=True),
        sa.Column("aliquota_icms", sa.Numeric(5, 2), nullable=True),
        sa.Column("cst_pis", sa.String(2), nullable=True),
        sa.Column("cst_cofins", sa.String(2), nullable=True),
    )
    op.create_index("ix_fiscal_defaults_category", "fiscal_defaults", ["category"])
    op.create_table(
        "fiscal_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("order_id", UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("code", sa.String(20), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("raw", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by_name", sa.String(255), nullable=False),
    )
    op.create_index("ix_fiscal_events_order_id", "fiscal_events", ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_fiscal_events_order_id", table_name="fiscal_events")
    op.drop_table("fiscal_events")
    op.drop_index("ix_fiscal_defaults_category", table_name="fiscal_defaults")
    op.drop_table("fiscal_defaults")
    op.drop_table("fiscal_settings")
