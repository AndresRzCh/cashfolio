"""Add an optional display name to the user.

The dashboard greeting fell back to the local part of the email address, which
reads like a login rather than a name. This stores the name the user wants to
be greeted by; when it is null the greeting keeps the old email fallback.
"""
import sqlalchemy as sa
from alembic import op

revision = '0026'
down_revision = '0025'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user', sa.Column('name', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('user', 'name')
