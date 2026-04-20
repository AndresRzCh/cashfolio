"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("base_currency", sa.String(), nullable=False, server_default="EUR"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_user_email", "user", ["email"], unique=True)

    op.create_table(
        "account",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
    )
    op.create_index("ix_account_user_id", "account", ["user_id"])

    op.create_table(
        "assettype",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
    )
    op.create_index("ix_assettype_user_id", "assettype", ["user_id"])


def downgrade() -> None:
    op.drop_table("assettype")
    op.drop_table("account")
    op.drop_table("user")
