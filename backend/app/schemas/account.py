from pydantic import BaseModel, field_validator

ACCOUNT_TYPES = {"bank", "broker", "exchange", "wallet", "other"}


class AccountCreate(BaseModel):
    name: str
    type: str
    fiat_enabled: bool = False

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ACCOUNT_TYPES:
            raise ValueError(f"type must be one of {ACCOUNT_TYPES}")
        return v


class AccountUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    fiat_enabled: bool | None = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str | None) -> str | None:
        if v is not None and v not in ACCOUNT_TYPES:
            raise ValueError(f"type must be one of {ACCOUNT_TYPES}")
        return v


class AccountRead(BaseModel):
    id: int
    user_id: int
    name: str
    type: str
    fiat_enabled: bool

    model_config = {"from_attributes": True}
