"""add barcode to order_items

Revision ID: 005
Revises: 004
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('order_items', sa.Column('barcode', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('order_items', 'barcode')
