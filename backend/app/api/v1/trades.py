import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models.account import Account
from app.models.asset import Asset
from app.models.trade import Trade
from app.models.user import User
from app.schemas.trade import TradeCreate, TradeRead, TradeUpdate
from app.services.trade_import_service import import_trades

router = APIRouter()


@router.get("", response_model=list[TradeRead])
def list_trades(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[Trade]:
    return list(
        session.exec(
            select(Trade)
            .where(Trade.user_id == current_user.id)
            .order_by(Trade.date.desc())  # type: ignore[attr-defined]
        ).all()
    )


@router.post("", response_model=TradeRead, status_code=status.HTTP_201_CREATED)
def create_trade(
    body: TradeCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Trade:
    trade = Trade(
        user_id=current_user.id,
        account_id=body.account_id,
        operation=body.operation,
        asset_id=body.asset_id,
        quantity=body.quantity,
        price_per_unit=body.price_per_unit,
        currency=body.currency,
        fee=body.fee,
        fee_currency=body.fee_currency,
        date=body.date,
        note=body.note,
    )
    session.add(trade)
    session.commit()
    session.refresh(trade)
    return trade


@router.get("/export")
def export_trades_csv(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    trades = list(
        session.exec(
            select(Trade)
            .where(Trade.user_id == current_user.id)
            .order_by(Trade.date.desc())  # type: ignore[attr-defined]
        ).all()
    )

    # Build lookup maps for account and asset names (user-scoped)
    accounts = {
        a.id: a.name
        for a in session.exec(
            select(Account).where(Account.user_id == current_user.id)
        ).all()
    }
    assets = {
        a.id: a.symbol
        for a in session.exec(
            select(Asset).where(Asset.user_id == current_user.id)
        ).all()
    }

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "date", "account", "operation", "asset",
        "quantity", "price_per_unit", "currency", "fee", "fee_currency", "note",
    ])
    for t in trades:
        writer.writerow([
            t.id, t.date,
            accounts.get(t.account_id, str(t.account_id)),
            t.operation,
            assets.get(t.asset_id, str(t.asset_id)),
            t.quantity, t.price_per_unit, t.currency,
            t.fee if t.fee is not None else "", t.fee_currency or "", t.note or "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=trades.csv"},
    )


@router.get("/{trade_id}", response_model=TradeRead)
def get_trade(
    trade_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Trade:
    trade = session.get(Trade, trade_id)
    if not trade or trade.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade


@router.patch("/{trade_id}", response_model=TradeRead)
def update_trade(
    trade_id: int,
    body: TradeUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Trade:
    trade = session.get(Trade, trade_id)
    if not trade or trade.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(trade, field, value)
    session.add(trade)
    session.commit()
    session.refresh(trade)
    return trade


@router.delete("/{trade_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trade(
    trade_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    trade = session.get(Trade, trade_id)
    if not trade or trade.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    session.delete(trade)
    session.commit()


@router.post("/import")
async def import_trades_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, object]:
    assert current_user.id is not None
    content = (await file.read()).decode("utf-8")
    result = import_trades(current_user.id, content, session)
    if result["errors"]:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=result)
    return result
