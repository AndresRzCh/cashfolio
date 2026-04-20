from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_serializer


class FireflyConfigCreate(BaseModel):
    url: str
    api_token: str


class FireflyConfigRead(BaseModel):
    url: str
    last_synced_at: datetime | None = None

    model_config = {"from_attributes": True}


class FireflyAccountRead(BaseModel):
    firefly_id: str
    name: str
    account_type: str
    balance: Decimal
    currency_code: str
    last_synced_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("balance")
    def serialize_balance(self, v: Decimal) -> str:
        return str(v)


class FireflySyncResult(BaseModel):
    synced: int
    message: str
