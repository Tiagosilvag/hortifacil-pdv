"""add stock and expiry_date to products

Revision ID: 003
Revises: 002_invoice
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002_invoice'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('products', sa.Column('stock', sa.Numeric(10, 3), nullable=False, server_default='0'))
    op.add_column('products', sa.Column('expiry_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'expiry_date')
    op.drop_column('products', 'stock')
