import datetime
from decimal import Decimal

from pydantic import BaseModel, field_serializer


class FxRateRead(BaseModel):
    id: int
    from_currency: str
    to_currency: str
    date: datetime.date
    rate: Decimal

    model_config = {"from_attributes": True}

    @field_serializer("rate")
    def serialize_rate(self, v: Decimal) -> str:
        return str(v)


class FxRateFetchRequest(BaseModel):
    from_currency: str
    to_currency: str
    start_date: datetime.date
    end_date: datetime.date
