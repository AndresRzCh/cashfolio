from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session

from app.core.db import get_session
from app.core.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.auth import UserRead
from app.schemas.user import UserUpdate

router = APIRouter()


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


@router.patch("/me", response_model=UserRead)
def update_me(
    body: UserUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> User:
    if body.base_currency is not None:
        current_user.base_currency = body.base_currency
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


@router.patch("/me/password")
def change_password(
    body: PasswordChange,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict:  # type: ignore[type-arg]
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.password_hash = hash_password(body.new_password)
    session.add(current_user)
    session.commit()
    return {"message": "Password updated successfully"}
