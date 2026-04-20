from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models.asset_type import AssetType
from app.models.user import User
from app.schemas.asset_type import AssetTypeCreate, AssetTypeRead, AssetTypeUpdate

router = APIRouter()


@router.get("", response_model=list[AssetTypeRead])
def list_asset_types(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[AssetType]:
    return list(
        session.exec(select(AssetType).where(AssetType.user_id == current_user.id)).all()
    )


@router.post("", response_model=AssetTypeRead, status_code=status.HTTP_201_CREATED)
def create_asset_type(
    body: AssetTypeCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AssetType:
    asset_type = AssetType(user_id=current_user.id, name=body.name)
    session.add(asset_type)
    session.commit()
    session.refresh(asset_type)
    return asset_type


@router.patch("/{asset_type_id}", response_model=AssetTypeRead)
def update_asset_type(
    asset_type_id: int,
    body: AssetTypeUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AssetType:
    asset_type = session.get(AssetType, asset_type_id)
    if not asset_type or asset_type.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asset type not found"
        )
    asset_type.name = body.name
    session.add(asset_type)
    session.commit()
    session.refresh(asset_type)
    return asset_type


@router.delete("/{asset_type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset_type(
    asset_type_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    asset_type = session.get(AssetType, asset_type_id)
    if not asset_type or asset_type.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asset type not found"
        )
    session.delete(asset_type)
    session.commit()
