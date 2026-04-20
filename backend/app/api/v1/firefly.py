import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models.firefly import FireflyAccount, FireflyConfig
from app.models.user import User
from app.schemas.firefly import (
    FireflyAccountRead,
    FireflyConfigCreate,
    FireflyConfigRead,
    FireflySyncResult,
)
from app.services.firefly_service import sync_firefly_accounts

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/config", response_model=FireflyConfigRead)
def get_config(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> FireflyConfigRead:
    config = session.exec(
        select(FireflyConfig).where(FireflyConfig.user_id == current_user.id)
    ).first()
    if config is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not configured")
    return FireflyConfigRead.model_validate(config)


@router.put("/config", response_model=FireflyConfigRead)
def save_config(
    body: FireflyConfigCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> FireflyConfigRead:
    config = session.exec(
        select(FireflyConfig).where(FireflyConfig.user_id == current_user.id)
    ).first()
    if config is None:
        config = FireflyConfig(user_id=current_user.id, url=body.url, api_token=body.api_token)
        session.add(config)
    else:
        config.url = body.url
        config.api_token = body.api_token
    session.commit()
    session.refresh(config)
    return FireflyConfigRead.model_validate(config)


@router.delete("/config", status_code=status.HTTP_204_NO_CONTENT)
def delete_config(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    config = session.exec(
        select(FireflyConfig).where(FireflyConfig.user_id == current_user.id)
    ).first()
    if config is None:
        return
    # Remove cached accounts too
    old = list(session.exec(
        select(FireflyAccount).where(FireflyAccount.user_id == current_user.id)
    ).all())
    for row in old:
        session.delete(row)
    session.delete(config)
    session.commit()


@router.post("/sync", response_model=FireflySyncResult)
def trigger_sync(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> FireflySyncResult:
    assert current_user.id is not None
    try:
        count = sync_firefly_accounts(current_user.id, session)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("Firefly sync failed for user %d: %s", current_user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Firefly III sync failed. Check your URL and API token.",
        )
    return FireflySyncResult(synced=count, message=f"Synced {count} accounts")


@router.get("/accounts", response_model=list[FireflyAccountRead])
def list_accounts(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[FireflyAccount]:
    return list(session.exec(
        select(FireflyAccount).where(FireflyAccount.user_id == current_user.id)
    ).all())
