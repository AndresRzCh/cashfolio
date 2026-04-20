"""migrate price_source from coingecko to coincap

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-19
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE asset SET price_source = 'coincap' WHERE price_source = 'coingecko'")


def downgrade() -> None:
    op.execute("UPDATE asset SET price_source = 'coingecko' WHERE price_source = 'coincap'")
