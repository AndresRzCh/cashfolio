from pydantic import BaseModel


class UserUpdate(BaseModel):
    base_currency: str | None = None
