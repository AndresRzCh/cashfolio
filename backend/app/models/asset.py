from datetime import date
from decimal import Decimal

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel


class Asset(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    symbol: str
    name: str
    asset_type_id: int | None = Field(default=None, foreign_key="assettype.id")
    price_source: str = Field(default="none")  # binance | yfinance | custom | none
    external_id: str | None = None             # Binance symbol (BTC) or yfinance ticker


class CustomPrice(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="asset.id", index=True)
    date: date
    price: Decimal = Field(sa_column=Column(sa.Numeric(28, 10), nullable=False))


class PriceCache(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="asset.id", index=True)
    date: date
    price_in_base_currency: Decimal = Field(
        sa_column=Column(sa.Numeric(28, 10), nullable=False)
    )
