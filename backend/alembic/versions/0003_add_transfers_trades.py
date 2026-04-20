"""add transfers and trades

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-17 00:02:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transfer",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("account.id"), nullable=False),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("asset.id"), nullable=False),
        sa.Column("direction", sa.String(), nullable=False),
        sa.Column("quantity", sa.Numeric(28, 10), nullable=False),
        sa.Column("price_per_unit", sa.Numeric(28, 10), nullable=True),
        sa.Column("fee", sa.Numeric(28, 10), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
    )
    op.create_index("ix_transfer_user_id", "transfer", ["user_id"])

    op.create_table(
        "trade",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("from_account_id", sa.Integer(), sa.ForeignKey("account.id"), nullable=False),
        sa.Column("from_asset_id", sa.Integer(), sa.ForeignKey("asset.id"), nullable=False),
        sa.Column("from_quantity", sa.Numeric(28, 10), nullable=False),
        sa.Column("to_account_id", sa.Integer(), sa.ForeignKey("account.id"), nullable=False),
        sa.Column("to_asset_id", sa.Integer(), sa.ForeignKey("asset.id"), nullable=False),
        sa.Column("to_quantity", sa.Numeric(28, 10), nullable=False),
        sa.Column("fee_asset_id", sa.Integer(), sa.ForeignKey("asset.id"), nullable=True),
        sa.Column("fee_quantity", sa.Numeric(28, 10), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
    )
    op.create_index("ix_trade_user_id", "trade", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_trade_user_id", "trade")
    op.drop_table("trade")
    op.drop_index("ix_transfer_user_id", "transfer")
    op.drop_table("transfer")
