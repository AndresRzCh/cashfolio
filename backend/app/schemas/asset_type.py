from pydantic import BaseModel


class AssetTypeCreate(BaseModel):
    name: str


class AssetTypeUpdate(BaseModel):
    name: str


class AssetTypeRead(BaseModel):
    id: int
    user_id: int
    name: str

    model_config = {"from_attributes": True}
