import datetime
from decimal import Decimal

from pydantic import BaseModel, field_serializer, field_validator, model_validator


class TransferCreate(BaseModel):
    from_account_id: int | None = None
    to_account_id: int | None = None
    amount: Decimal
    currency: str
    fee: Decimal | None = None
    date: datetime.date
    note: str | None = None

    @model_validator(mode="after")
    def validate_at_least_one_account(self) -> "TransferCreate":
        if self.from_account_id is None and self.to_account_id is None:
            raise ValueError("at least one of from_account_id or to_account_id must be provided")
        return self

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("amount must be greater than 0")
        return v

    @field_validator("fee")
    @classmethod
    def validate_fee(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("fee must be >= 0")
        return v


class TransferUpdate(BaseModel):
    from_account_id: int | None = None
    to_account_id: int | None = None
    amount: Decimal | None = None
    currency: str | None = None
    fee: Decimal | None = None
    date: datetime.date | None = None
    note: str | None = None

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v <= 0:
            raise ValueError("amount must be greater than 0")
        return v

    @field_validator("fee")
    @classmethod
    def validate_fee(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("fee must be >= 0")
        return v


class TransferRead(BaseModel):
    id: int
    user_id: int
    from_account_id: int | None
    to_account_id: int | None
    amount: Decimal
    currency: str
    fee: Decimal | None
    date: datetime.date
    note: str | None

    model_config = {"from_attributes": True}

    @field_serializer("amount", "fee")
    def serialize_decimal(self, v: Decimal | None) -> str | None:
        return str(v.normalize()) if v is not None else None
