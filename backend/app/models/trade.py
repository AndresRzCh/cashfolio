from datetime import date
from decimal import Decimal

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel


class Trade(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    account_id: int = Field(foreign_key="account.id")
    from_asset_id: int = Field(foreign_key="asset.id")
    from_amount: Decimal = Field(sa_column=Column(sa.Numeric(28, 10), nullable=False))
    to_asset_id: int = Field(foreign_key="asset.id")
    to_amount: Decimal = Field(sa_column=Column(sa.Numeric(28, 10), nullable=False))
    fee_asset_id: int | None = Field(default=None, foreign_key="asset.id")
    fee_amount: Decimal | None = Field(
        default=None, sa_column=Column(sa.Numeric(28, 10), nullable=True)
    )
    date: date
    note: str | None = None
