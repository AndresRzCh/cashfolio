from datetime import date
from decimal import Decimal

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel


class Transfer(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    from_account_id: int | None = Field(default=None, foreign_key="account.id")
    to_account_id: int | None = Field(default=None, foreign_key="account.id")
    amount: Decimal = Field(sa_column=Column(sa.Numeric(28, 10), nullable=False))
    currency: str  # asset symbol — fiat (EUR/USD) or crypto (BTC, ADA, …)
    fee: Decimal | None = Field(
        default=None, sa_column=Column(sa.Numeric(28, 10), nullable=True)
    )
    # Explicit base-currency value of the transferred amount at transfer time.
    # Used for per-account realized P&L on crypto transfers. When null, services
    # fall back to amount × market price (crypto) or amount (base fiat).
    value: Decimal | None = Field(
        default=None, sa_column=Column(sa.Numeric(28, 10), nullable=True)
    )
    date: date
    note: str | None = None
