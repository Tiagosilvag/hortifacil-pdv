"""add allowed_modules to users

Revision ID: 001
Revises:
Create Date: 2026-09-02

"""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = '81277fa7aa1a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('allowed_modules', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'allowed_modules')
