from datetime import datetime, timezone
from decimal import Decimal

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel


class FireflyConfig(SQLModel, table=True):
    __tablename__ = "fireflyconfig"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, unique=True)
    url: str
    api_token: str
    last_synced_at: datetime | None = Field(default=None)


class FireflyAccount(SQLModel, table=True):
    __tablename__ = "fireflyaccount"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    firefly_id: str = Field(index=True)
    name: str
    account_type: str
    balance: Decimal = Field(sa_column=Column(sa.Numeric(28, 10), nullable=False))
    currency_code: str
    last_synced_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
