from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_serializer
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models.account import Account
from app.models.user import User
from app.schemas.account import AccountCreate, AccountRead, AccountUpdate
from app.services.account_summary_service import compute_account_summaries

router = APIRouter()


class AccountSummaryRead(BaseModel):
    account_id: int
    account_name: str
    account_type: str
    num_assets: int
    total_invested: Decimal
    total_value: Decimal
    total_pnl: Decimal
    total_pnl_pct: Decimal | None
    cash_deposited: Decimal
    cash_withdrawn: Decimal

    model_config = {"from_attributes": True}

    @field_serializer(
        "total_invested", "total_value", "total_pnl", "total_pnl_pct",
        "cash_deposited", "cash_withdrawn",
    )
    def serialize_decimal(self, v: Decimal | None) -> str | None:
        return str(v) if v is not None else None


@router.get("/summary", response_model=list[AccountSummaryRead])
def get_accounts_summary(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[AccountSummaryRead]:
    assert current_user.id is not None
    rows = compute_account_summaries(current_user.id, session, current_user.base_currency)
    return [AccountSummaryRead.model_validate(r.__dict__) for r in rows]


@router.get("", response_model=list[AccountRead])
def list_accounts(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[Account]:
    return list(
        session.exec(select(Account).where(Account.user_id == current_user.id)).all()
    )


@router.post("", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def create_account(
    body: AccountCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Account:
    account = Account(user_id=current_user.id, name=body.name, type=body.type)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.patch("/{account_id}", response_model=AccountRead)
def update_account(
    account_id: int,
    body: AccountUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Account:
    account = session.get(Account, account_id)
    if not account or account.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if body.name is not None:
        account.name = body.name
    if body.type is not None:
        account.type = body.type
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    account = session.get(Account, account_id)
    if not account or account.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    session.delete(account)
    session.commit()
