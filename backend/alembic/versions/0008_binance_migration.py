"""migrate price_source from coincap to binance

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-19
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE asset SET price_source = 'binance' WHERE price_source = 'coincap'")


def downgrade() -> None:
    op.execute("UPDATE asset SET price_source = 'coincap' WHERE price_source = 'binance'")
