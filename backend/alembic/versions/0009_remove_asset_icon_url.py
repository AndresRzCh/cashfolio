"""remove icon_url from asset

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-19
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("asset") as batch_op:
        batch_op.drop_column("icon_url")


def downgrade() -> None:
    with op.batch_alter_table("asset") as batch_op:
        batch_op.add_column(sa.Column("icon_url", sa.String(), nullable=True))
