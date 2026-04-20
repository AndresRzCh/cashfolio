import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models.account import Account
from app.models.transfer import Transfer
from app.models.user import User
from app.schemas.transfer import TransferCreate, TransferRead, TransferUpdate
from app.services.transfer_import_service import import_transfers

router = APIRouter()


@router.get("", response_model=list[TransferRead])
def list_transfers(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[Transfer]:
    return list(
        session.exec(
            select(Transfer)
            .where(Transfer.user_id == current_user.id)
            .order_by(Transfer.date.desc())  # type: ignore[attr-defined]
        ).all()
    )


@router.post("", response_model=TransferRead, status_code=status.HTTP_201_CREATED)
def create_transfer(
    body: TransferCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Transfer:
    transfer = Transfer(
        user_id=current_user.id,
        from_account_id=body.from_account_id,
        to_account_id=body.to_account_id,
        amount=body.amount,
        currency=body.currency,
        fee=body.fee,
        date=body.date,
        note=body.note,
    )
    session.add(transfer)
    session.commit()
    session.refresh(transfer)
    return transfer


@router.get("/export")
def export_transfers_csv(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    transfers = list(
        session.exec(
            select(Transfer)
            .where(Transfer.user_id == current_user.id)
            .order_by(Transfer.date.desc())  # type: ignore[attr-defined]
        ).all()
    )

    # Build lookup map for account names (user-scoped)
    accounts = {
        a.id: a.name
        for a in session.exec(
            select(Account).where(Account.user_id == current_user.id)
        ).all()
    }

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "date", "from_account", "to_account",
        "amount", "currency", "fee", "note",
    ])
    for t in transfers:
        writer.writerow([
            t.id, t.date,
            accounts.get(t.from_account_id, "") if t.from_account_id is not None else "",
            accounts.get(t.to_account_id, "") if t.to_account_id is not None else "",
            t.amount, t.currency, t.fee if t.fee is not None else "", t.note or "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transfers.csv"},
    )


@router.get("/{transfer_id}", response_model=TransferRead)
def get_transfer(
    transfer_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Transfer:
    transfer = session.get(Transfer, transfer_id)
    if not transfer or transfer.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer not found")
    return transfer


@router.patch("/{transfer_id}", response_model=TransferRead)
def update_transfer(
    transfer_id: int,
    body: TransferUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Transfer:
    transfer = session.get(Transfer, transfer_id)
    if not transfer or transfer.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer not found")
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(transfer, field, value)
    session.add(transfer)
    session.commit()
    session.refresh(transfer)
    return transfer


@router.delete("/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transfer(
    transfer_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    transfer = session.get(Transfer, transfer_id)
    if not transfer or transfer.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer not found")
    session.delete(transfer)
    session.commit()


@router.post("/import")
async def import_transfers_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, object]:
    assert current_user.id is not None
    content = (await file.read()).decode("utf-8")
    result = import_transfers(current_user.id, content, session)
    if result["errors"]:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=result)
    return result
