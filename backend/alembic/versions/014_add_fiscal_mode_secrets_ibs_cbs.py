"""modo de emissão fiscal, cofre de segredos e campos de IBS/CBS

Revision ID: 014
Revises: 013
Create Date: 2026-09-26
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None

# Reforma tributária: grupo IBS/CBS por item (NT 2025.002). Os valores vêm do contador.
IBS_COLUMNS = [
    ("cst_ibs_cbs", sa.String(3)),
    ("c_class_trib", sa.String(6)),
    ("aliquota_ibs", sa.Numeric(7, 4)),
    ("aliquota_cbs", sa.Numeric(7, 4)),
]
IBS_TABLES = ("products", "order_items", "fiscal_defaults")


def upgrade() -> None:
    op.add_column("fiscal_settings", sa.Column("mode", sa.String(20), nullable=False, server_default="none"))
    op.create_table(
        "fiscal_secrets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("kind", sa.String(30), nullable=False, unique=True),
        sa.Column("ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_by_name", sa.String(255), nullable=True),
    )
    for table in IBS_TABLES:
        for name, type_ in IBS_COLUMNS:
            op.add_column(table, sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for table in reversed(IBS_TABLES):
        for name, _ in reversed(IBS_COLUMNS):
            op.drop_column(table, name)
    op.drop_table("fiscal_secrets")
    op.drop_column("fiscal_settings", "mode")
