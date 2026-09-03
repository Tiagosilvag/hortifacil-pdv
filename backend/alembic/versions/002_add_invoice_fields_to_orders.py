"""add invoice fields to orders

Revision ID: 002_invoice
Revises: 001_add_allowed_modules_to_users
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa

revision = '002_invoice'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('invoice_number', sa.String(20), nullable=True))
    op.add_column('orders', sa.Column('invoice_series', sa.String(10), nullable=True))
    op.add_column('orders', sa.Column('invoice_key', sa.String(44), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'invoice_key')
    op.drop_column('orders', 'invoice_series')
    op.drop_column('orders', 'invoice_number')
