import datetime
from decimal import Decimal

from pydantic import BaseModel, field_serializer, field_validator

OPERATIONS = {"BUY", "SELL"}


class TradeCreate(BaseModel):
    account_id: int
    operation: str
    asset_id: int
    quantity: Decimal
    price_per_unit: Decimal
    currency: str
    fee: Decimal | None = None
    fee_currency: str | None = None
    date: datetime.date
    note: str | None = None

    @field_validator("operation")
    @classmethod
    def validate_operation(cls, v: str) -> str:
        if v.upper() not in OPERATIONS:
            raise ValueError("operation must be 'BUY' or 'SELL'")
        return v.upper()

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("quantity must be greater than 0")
        return v

    @field_validator("price_per_unit")
    @classmethod
    def validate_price(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("price_per_unit must be >= 0")
        return v

    @field_validator("fee")
    @classmethod
    def validate_fee(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("fee must be >= 0")
        return v


class TradeUpdate(BaseModel):
    account_id: int | None = None
    operation: str | None = None
    asset_id: int | None = None
    quantity: Decimal | None = None
    price_per_unit: Decimal | None = None
    currency: str | None = None
    fee: Decimal | None = None
    fee_currency: str | None = None
    date: datetime.date | None = None
    note: str | None = None

    @field_validator("operation")
    @classmethod
    def validate_operation(cls, v: str | None) -> str | None:
        if v is not None and v.upper() not in OPERATIONS:
            raise ValueError("operation must be 'BUY' or 'SELL'")
        return v.upper() if v is not None else None

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v <= 0:
            raise ValueError("quantity must be greater than 0")
        return v

    @field_validator("price_per_unit")
    @classmethod
    def validate_price(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("price_per_unit must be >= 0")
        return v

    @field_validator("fee")
    @classmethod
    def validate_fee(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("fee must be >= 0")
        return v


class TradeRead(BaseModel):
    id: int
    user_id: int
    account_id: int
    operation: str
    asset_id: int
    quantity: Decimal
    price_per_unit: Decimal
    currency: str
    fee: Decimal | None
    fee_currency: str | None
    date: datetime.date
    note: str | None

    model_config = {"from_attributes": True}

    @field_serializer("quantity", "price_per_unit", "fee")
    def serialize_decimal(self, v: Decimal | None) -> str | None:
        return str(v.normalize()) if v is not None else None
