from datetime import date
from decimal import Decimal

from pydantic import BaseModel, field_validator

PRICE_SOURCES = {"binance", "yfinance", "custom", "none"}


class AssetCreate(BaseModel):
    symbol: str
    name: str
    asset_type_id: int | None = None
    price_source: str = "none"
    external_id: str | None = None

    @field_validator("price_source")
    @classmethod
    def validate_source(cls, v: str) -> str:
        if v not in PRICE_SOURCES:
            raise ValueError(f"price_source must be one of {PRICE_SOURCES}")
        return v


class AssetUpdate(BaseModel):
    symbol: str | None = None
    name: str | None = None
    asset_type_id: int | None = None
    price_source: str | None = None
    external_id: str | None = None

    @field_validator("price_source")
    @classmethod
    def validate_source(cls, v: str | None) -> str | None:
        if v is not None and v not in PRICE_SOURCES:
            raise ValueError(f"price_source must be one of {PRICE_SOURCES}")
        return v


class AssetRead(BaseModel):
    id: int
    user_id: int
    symbol: str
    name: str
    asset_type_id: int | None
    price_source: str
    external_id: str | None

    model_config = {"from_attributes": True}


class AssetWithPrice(AssetRead):
    current_price: str | None = None  # Decimal serialized as string
    price_date: date | None = None
    history_first_date: date | None = None
    history_last_date: date | None = None


class CustomPriceRead(BaseModel):
    id: int
    asset_id: int
    date: date
    price: Decimal

    model_config = {"from_attributes": True}
