from datetime import date
from decimal import Decimal

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel, UniqueConstraint


class FxRateCache(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("from_currency", "to_currency", "date"),
    )

    id: int | None = Field(default=None, primary_key=True)
    from_currency: str = Field(max_length=10)
    to_currency: str = Field(max_length=10)
    date: date
    rate: Decimal = Field(sa_column=Column(sa.Numeric(28, 10), nullable=False))
