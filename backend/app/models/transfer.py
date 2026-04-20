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
    currency: str
    fee: Decimal | None = Field(
        default=None, sa_column=Column(sa.Numeric(28, 10), nullable=True)
    )
    date: date
    note: str | None = None
