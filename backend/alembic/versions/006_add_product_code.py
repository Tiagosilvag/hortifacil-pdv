"""add product code sequential

Revision ID: 006
Revises: 005
Create Date: 2026-09-09
"""

from alembic import op
import sqlalchemy as sa

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    # Add code to products (nullable first for backfill)
    op.add_column('products', sa.Column('code', sa.Integer(), nullable=True))

    # Backfill: assign sequential codes ordered by created_at
    op.execute("""
        WITH ranked AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
            FROM products
        )
        UPDATE products SET code = ranked.rn
        FROM ranked WHERE products.id = ranked.id
    """)

    op.alter_column('products', 'code', nullable=False)
    op.create_unique_constraint('uq_products_code', 'products', ['code'])
    op.create_index('ix_products_code', 'products', ['code'])

    # Add product_code snapshot to order_items
    op.add_column('order_items', sa.Column('product_code', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('order_items', 'product_code')
    op.drop_index('ix_products_code', table_name='products')
    op.drop_constraint('uq_products_code', 'products', type_='unique')
    op.drop_column('products', 'code')
