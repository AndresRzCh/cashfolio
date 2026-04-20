from datetime import date
from decimal import Decimal

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel


class Trade(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    account_id: int = Field(foreign_key="account.id")
    operation: str  # "BUY" or "SELL"
    asset_id: int = Field(foreign_key="asset.id")
    quantity: Decimal = Field(sa_column=Column(sa.Numeric(28, 10), nullable=False))
    price_per_unit: Decimal = Field(sa_column=Column(sa.Numeric(28, 10), nullable=False))
    currency: str
    fee: Decimal | None = Field(
        default=None, sa_column=Column(sa.Numeric(28, 10), nullable=True)
    )
    fee_currency: str | None = None
    date: date
    note: str | None = None
