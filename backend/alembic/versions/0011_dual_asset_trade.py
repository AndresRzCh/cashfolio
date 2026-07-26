"""refactor trade to dual-asset model

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Add new nullable columns alongside old ones
    with op.batch_alter_table("trade") as batch_op:
        batch_op.add_column(sa.Column("from_asset_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("from_amount", sa.Numeric(28, 10), nullable=True))
        batch_op.add_column(sa.Column("to_asset_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("to_amount", sa.Numeric(28, 10), nullable=True))
        batch_op.add_column(sa.Column("fee_asset_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("fee_amount_new", sa.Numeric(28, 10), nullable=True))

    # 2. Migrate old rows — BUY → currency→asset, SELL → asset→currency
    trades = conn.execute(text(
        "SELECT id, user_id, operation, asset_id, quantity, price_per_unit, "
        "currency, fee, fee_currency FROM trade"
    )).fetchall()

    def get_or_create_asset(user_id: int, symbol: str) -> int:
        row = conn.execute(text(
            "SELECT id FROM asset WHERE symbol = :s AND user_id = :u LIMIT 1"
        ), {"s": symbol.upper(), "u": user_id}).fetchone()
        if row:
            return row[0]
        conn.execute(text(
            "INSERT INTO asset (user_id, symbol, name, price_source) "
            "VALUES (:u, :s, :n, 'fx')"
        ), {"u": user_id, "s": symbol.upper(), "n": symbol.upper()})
        row = conn.execute(text(
            "SELECT id FROM asset WHERE symbol = :s AND user_id = :u LIMIT 1"
        ), {"s": symbol.upper(), "u": user_id}).fetchone()
        return row[0]

    for t in trades:
        trade_id = t[0]
        user_id = t[1]
        operation = t[2]
        asset_id = t[3]
        quantity = float(t[4])
        price_per_unit = float(t[5])
        currency = t[6]
        fee = t[7]
        fee_currency = t[8]

        trade_total = quantity * price_per_unit
        currency_asset_id = get_or_create_asset(user_id, currency)

        if operation == "BUY":
            from_asset_id = currency_asset_id
            from_amount = trade_total
            to_asset_id = asset_id
            to_amount = quantity
        else:  # SELL
            from_asset_id = asset_id
            from_amount = quantity
            to_asset_id = currency_asset_id
            to_amount = trade_total

        fee_asset_id = None
        if fee is not None and fee_currency:
            fee_asset_id = get_or_create_asset(user_id, fee_currency)
        elif fee is not None and currency:
            fee_asset_id = currency_asset_id

        conn.execute(text("""
            UPDATE trade SET
                from_asset_id  = :fa,
                from_amount    = :fam,
                to_asset_id    = :ta,
                to_amount      = :tam,
                fee_asset_id   = :fea,
                fee_amount_new = :feam
            WHERE id = :id
        """), {
            "fa": from_asset_id,
            "fam": from_amount,
            "ta": to_asset_id,
            "tam": to_amount,
            "fea": fee_asset_id,
            "feam": float(fee) if fee is not None else None,
            "id": trade_id,
        })

    # 3. Drop old columns and make new ones NOT NULL; rename fee_amount_new
    with op.batch_alter_table("trade") as batch_op:
        batch_op.drop_column("operation")
        batch_op.drop_column("asset_id")
        batch_op.drop_column("quantity")
        batch_op.drop_column("price_per_unit")
        batch_op.drop_column("currency")
        batch_op.drop_column("fee")
        batch_op.drop_column("fee_currency")
        batch_op.alter_column("from_asset_id", nullable=False)
        batch_op.alter_column("from_amount", nullable=False)
        batch_op.alter_column("to_asset_id", nullable=False)
        batch_op.alter_column("to_amount", nullable=False)
        batch_op.alter_column("fee_amount_new", new_column_name="fee_amount")


def downgrade() -> None:
    raise NotImplementedError("Downgrade not supported for migration 0011 — data transformation is lossy")
