"""add firefly config and account tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-18
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fireflyconfig",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False, unique=True, index=True),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("api_token", sa.String(), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "fireflyaccount",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False, index=True),
        sa.Column("firefly_id", sa.String(), nullable=False, index=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("account_type", sa.String(), nullable=False),
        sa.Column("balance", sa.Numeric(28, 10), nullable=False),
        sa.Column("currency_code", sa.String(), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("fireflyaccount")
    op.drop_table("fireflyconfig")
