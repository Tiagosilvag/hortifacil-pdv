"""split can_manage_products into can_create_products and can_edit_products

Revision ID: 009
Revises: 008
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "can_manage_products", new_column_name="can_edit_products")
    op.add_column(
        "users",
        sa.Column("can_create_products", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "can_create_products")
    op.alter_column("users", "can_edit_products", new_column_name="can_manage_products")
