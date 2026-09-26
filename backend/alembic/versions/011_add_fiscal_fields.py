"""dados fiscais em produtos, itens e pedidos (NFC-e)

Revision ID: 011
Revises: 010
Create Date: 2026-09-25
"""
import sqlalchemy as sa

from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None

FISCAL_COLUMNS = [
    ("ncm", sa.String(8)),
    ("cest", sa.String(7)),
    ("origem", sa.Integer()),
    ("cfop", sa.String(4)),
    ("cst_icms", sa.String(2)),
    ("aliquota_icms", sa.Numeric(5, 2)),
    ("cst_pis", sa.String(2)),
    ("cst_cofins", sa.String(2)),
]

ORDER_COLUMNS = (
    "fiscal_attempts", "fiscal_error", "fiscal_emitted_at", "fiscal_xml_url", "fiscal_qr_url",
    "fiscal_protocol", "fiscal_status",
)


def upgrade() -> None:
    # Produto (cadastro) e item do pedido (cópia no momento da emissão) têm os mesmos campos fiscais.
    for table in ("products", "order_items"):
        for name, type_ in FISCAL_COLUMNS:
            op.add_column(table, sa.Column(name, type_, nullable=True))
    op.add_column("orders", sa.Column("fiscal_status", sa.String(20), nullable=False, server_default="not_required"))
    op.add_column("orders", sa.Column("fiscal_protocol", sa.String(30), nullable=True))
    op.add_column("orders", sa.Column("fiscal_qr_url", sa.Text(), nullable=True))
    op.add_column("orders", sa.Column("fiscal_xml_url", sa.Text(), nullable=True))
    op.add_column("orders", sa.Column("fiscal_emitted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orders", sa.Column("fiscal_error", sa.Text(), nullable=True))
    op.add_column("orders", sa.Column("fiscal_attempts", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    for name in ORDER_COLUMNS:
        op.drop_column("orders", name)
    for table in ("order_items", "products"):
        for name, _ in reversed(FISCAL_COLUMNS):
            op.drop_column(table, name)
