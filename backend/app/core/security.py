from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_access_token(
    subject: str,
    expires_delta: timedelta | None = None,
) -> str:
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {"sub": subject, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(subject: str) -> str:
    expires_delta = timedelta(days=settings.refresh_token_expire_days)
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {"sub": subject, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:  # type: ignore[type-arg]
    try:
        payload: dict = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])  # type: ignore[type-arg]
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
