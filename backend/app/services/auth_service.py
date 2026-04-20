from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import TokenResponse, UserRegister


def register_user(data: UserRegister, session: Session) -> User:
    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    user = User(email=data.email, password_hash=hash_password(data.password), base_currency=data.base_currency.upper())
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def login_user(email: str, password: str, session: Session) -> TokenResponse:
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )
