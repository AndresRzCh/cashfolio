from datetime import date
from decimal import Decimal

from pydantic import BaseModel, field_serializer


def _d(v: Decimal | None) -> str | None:
    # "f" avoids scientific notation; normalize trims trailing zeros.
    return format(v.normalize(), "f") if v is not None else None


class AccountHoldingRowRead(BaseModel):
    account_id: int
    account_name: str
    net_quantity: Decimal
    cost_basis: Decimal
    current_value: Decimal | None
    unrealized_pnl: Decimal | None
    unrealized_pnl_pct: Decimal | None

    model_config = {"from_attributes": True}

    @field_serializer("net_quantity", "cost_basis", "current_value", "unrealized_pnl", "unrealized_pnl_pct")
    def serialize_decimal(self, v: Decimal | None) -> str | None:
        return _d(v)


class HoldingRowRead(BaseModel):
    asset_id: int
    asset_symbol: str
    asset_name: str
    net_quantity: Decimal
    cost_basis: Decimal
    avg_cost_per_unit: Decimal
    current_price: Decimal | None
    price_date: date | None
    current_value: Decimal | None
    unrealized_pnl: Decimal | None
    unrealized_pnl_pct: Decimal | None
    accounts: list[AccountHoldingRowRead] = []

    model_config = {"from_attributes": True}

    @field_serializer(
        "net_quantity", "cost_basis", "avg_cost_per_unit",
        "current_price", "current_value", "unrealized_pnl", "unrealized_pnl_pct",
    )
    def serialize_decimal(self, v: Decimal | None) -> str | None:
        return _d(v)


class FiatAccountRowRead(BaseModel):
    currency: str
    amount: Decimal
    cost_basis: Decimal
    current_value: Decimal | None
    unrealized_pnl: Decimal | None

    model_config = {"from_attributes": True}

    @field_serializer("amount", "cost_basis", "current_value", "unrealized_pnl")
    def serialize_decimal(self, v: Decimal | None) -> str | None:
        return _d(v)


class AccountFiatSummaryRead(BaseModel):
    account_id: int
    account_name: str
    rows: list[FiatAccountRowRead]

    model_config = {"from_attributes": True}


class PortfolioSummaryRead(BaseModel):
    total_cost_basis: Decimal
    total_current_value: Decimal | None
    total_unrealized_pnl: Decimal | None
    total_unrealized_pnl_pct: Decimal | None
    holdings: list[HoldingRowRead]
    account_fiat: list[AccountFiatSummaryRead] = []
    total_net_deposits: Decimal = Decimal(0)

    model_config = {"from_attributes": True}

    @field_serializer(
        "total_cost_basis", "total_current_value",
        "total_unrealized_pnl", "total_unrealized_pnl_pct", "total_net_deposits",
    )
    def serialize_decimal(self, v: Decimal | None) -> str | None:
        return _d(v)
