import datetime
from decimal import Decimal

from pydantic import BaseModel, field_serializer, field_validator


class TradeCreate(BaseModel):
    account_id: int
    from_asset_id: int
    from_amount: Decimal
    to_asset_id: int
    to_amount: Decimal
    fee_asset_id: int | None = None
    fee_amount: Decimal | None = None
    date: datetime.date
    note: str | None = None

    @field_validator("from_amount", "to_amount")
    @classmethod
    def validate_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("amounts must be greater than 0")
        return v

    @field_validator("fee_amount")
    @classmethod
    def validate_fee(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("fee_amount must be >= 0")
        return v


class TradeUpdate(BaseModel):
    account_id: int | None = None
    from_asset_id: int | None = None
    from_amount: Decimal | None = None
    to_asset_id: int | None = None
    to_amount: Decimal | None = None
    fee_asset_id: int | None = None
    fee_amount: Decimal | None = None
    date: datetime.date | None = None
    note: str | None = None


class TradeRead(BaseModel):
    id: int
    user_id: int
    account_id: int
    from_asset_id: int
    from_amount: Decimal
    to_asset_id: int
    to_amount: Decimal
    fee_asset_id: int | None
    fee_amount: Decimal | None
    date: datetime.date
    note: str | None

    model_config = {"from_attributes": True}

    @field_serializer("from_amount", "to_amount", "fee_amount")
    def serialize_decimal(self, v: Decimal | None) -> str | None:
        return format(v.normalize(), "f") if v is not None else None
