"""add asset, customprice, pricecache

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-17 00:01:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "asset",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("symbol", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("asset_type_id", sa.Integer(), sa.ForeignKey("assettype.id"), nullable=True),
        sa.Column("price_source", sa.String(), nullable=False, server_default="none"),
        sa.Column("external_id", sa.String(), nullable=True),
        sa.Column("icon_url", sa.String(), nullable=True),
    )
    op.create_index("ix_asset_user_id", "asset", ["user_id"])

    op.create_table(
        "customprice",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("asset.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("price", sa.Numeric(28, 10), nullable=False),
    )
    op.create_index("ix_customprice_asset_id", "customprice", ["asset_id"])

    op.create_table(
        "pricecache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("asset.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("price_in_base_currency", sa.Numeric(28, 10), nullable=False),
    )
    op.create_index("ix_pricecache_asset_id", "pricecache", ["asset_id"])


def downgrade() -> None:
    op.drop_index("ix_pricecache_asset_id", "pricecache")
    op.drop_table("pricecache")
    op.drop_index("ix_customprice_asset_id", "customprice")
    op.drop_table("customprice")
    op.drop_index("ix_asset_user_id", "asset")
    op.drop_table("asset")
