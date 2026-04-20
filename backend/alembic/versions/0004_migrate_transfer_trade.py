"""migrate transfer and trade to new spec models

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-18 00:00:00.000000
"""
import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old tables (no data to preserve)
    op.drop_index("ix_trade_user_id", table_name="trade")
    op.drop_table("trade")
    op.drop_index("ix_transfer_user_id", table_name="transfer")
    op.drop_table("transfer")

    # Create new transfer table (account-to-account money movement)
    op.create_table(
        "transfer",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("from_account_id", sa.Integer(), sa.ForeignKey("account.id"), nullable=True),
        sa.Column("to_account_id", sa.Integer(), sa.ForeignKey("account.id"), nullable=True),
        sa.Column("amount", sa.Numeric(28, 10), nullable=False),
        sa.Column("currency", sa.String(), nullable=False),
        sa.Column("fee", sa.Numeric(28, 10), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
    )
    op.create_index("ix_transfer_user_id", "transfer", ["user_id"])

    # Create new trade table (BUY/SELL of an asset)
    op.create_table(
        "trade",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("account.id"), nullable=False),
        sa.Column("operation", sa.String(), nullable=False),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("asset.id"), nullable=False),
        sa.Column("quantity", sa.Numeric(28, 10), nullable=False),
        sa.Column("price_per_unit", sa.Numeric(28, 10), nullable=False),
        sa.Column("currency", sa.String(), nullable=False),
        sa.Column("fee", sa.Numeric(28, 10), nullable=True),
        sa.Column("fee_currency", sa.String(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
    )
    op.create_index("ix_trade_user_id", "trade", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_trade_user_id", table_name="trade")
    op.drop_table("trade")
    op.drop_index("ix_transfer_user_id", table_name="transfer")
    op.drop_table("transfer")

    # Restore old transfer table
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

    # Restore old trade table
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
