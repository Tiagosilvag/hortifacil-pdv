"""cancelamento da NFC-e, referência no provedor e confirmação de ida para produção

Revision ID: 013
Revises: 012
Create Date: 2026-09-26
"""
import sqlalchemy as sa

from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("fiscal_reference", sa.String(30), nullable=True))
    op.add_column("orders", sa.Column("fiscal_cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orders", sa.Column("fiscal_cancel_reason", sa.Text(), nullable=True))
    op.add_column("fiscal_settings", sa.Column("cancel_window_minutes", sa.Integer(), nullable=False, server_default="30"))
    op.add_column("fiscal_settings", sa.Column("production_confirmed_by", sa.String(255), nullable=True))
    op.add_column("fiscal_settings", sa.Column("production_confirmed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("fiscal_settings", "production_confirmed_at")
    op.drop_column("fiscal_settings", "production_confirmed_by")
    op.drop_column("fiscal_settings", "cancel_window_minutes")
    op.drop_column("orders", "fiscal_cancel_reason")
    op.drop_column("orders", "fiscal_cancelled_at")
    op.drop_column("orders", "fiscal_reference")
