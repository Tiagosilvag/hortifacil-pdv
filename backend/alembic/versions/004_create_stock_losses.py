"""create stock_losses table

Revision ID: 004
Revises: 003
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'stock_losses',
        sa.Column('id', sa.UUID(), nullable=False, primary_key=True),
        sa.Column('product_id', sa.UUID(), sa.ForeignKey('products.id', ondelete='SET NULL'), nullable=True),
        sa.Column('product_name', sa.String(255), nullable=False),
        sa.Column('unit_type', sa.String(50), nullable=False),
        sa.Column('qty', sa.Numeric(10, 3), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_by_name', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_stock_losses_product_id', 'stock_losses', ['product_id'])
    op.create_index('ix_stock_losses_created_at', 'stock_losses', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_stock_losses_created_at', 'stock_losses')
    op.drop_index('ix_stock_losses_product_id', 'stock_losses')
    op.drop_table('stock_losses')
