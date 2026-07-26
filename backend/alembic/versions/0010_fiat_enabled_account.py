"""add fiat_enabled to account

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("account") as batch_op:
        batch_op.add_column(
            sa.Column("fiat_enabled", sa.Boolean(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("account") as batch_op:
        batch_op.drop_column("fiat_enabled")
