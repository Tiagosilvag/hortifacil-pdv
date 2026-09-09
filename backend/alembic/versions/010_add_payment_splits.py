"""add payment_splits column and mixed payment type

Revision ID: 010
Revises: 009
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'mixed' value to the paymenttype enum (must run before column add)
    op.execute(sa.text("ALTER TYPE paymenttype ADD VALUE IF NOT EXISTS 'mixed'"))
    op.add_column(
        "orders",
        sa.Column("payment_splits", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("orders", "payment_splits")
    # PostgreSQL does not support removing enum values; skipping enum downgrade
