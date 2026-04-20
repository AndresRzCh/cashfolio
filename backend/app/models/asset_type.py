from sqlmodel import Field, SQLModel


class AssetType(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    name: str  # Crypto, Stock, ETF, Cash, Custom…
