"""add fx_rate_cache table for historical FX rates

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-19
"""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fxratecache",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("from_currency", sa.String(length=10), nullable=False),
        sa.Column("to_currency", sa.String(length=10), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("rate", sa.Numeric(28, 10), nullable=False),
        sa.UniqueConstraint("from_currency", "to_currency", "date", name="uq_fxratecache_pair_date"),
    )


def downgrade() -> None:
    op.drop_table("fxratecache")
