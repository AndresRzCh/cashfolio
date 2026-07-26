import csv
import io
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models.account import Account
from app.models.asset import Asset
from app.models.trade import Trade
from app.models.transfer import Transfer
from app.models.user import User
from app.schemas.trade import TradeCreate, TradeRead, TradeUpdate

router = APIRouter()

_BALANCE_TOLERANCE = Decimal("0.000001")


def _account_balances(
    account_id: int,
    user_id: int,
    session: Session,
    exclude_trade_id: int | None = None,
) -> dict[int, Decimal]:
    """Return {asset_id: quantity} for all assets in the account, including FIAT from transfers."""
    assets = {
        a.id: a
        for a in session.exec(select(Asset).where(Asset.user_id == user_id)).all()
        if a.id is not None
    }
    # Any transferred asset (fiat or crypto) credits/debits the account balance,
    # so a trade can spend funds or crypto that arrived via transfer.
    symbol_to_id: dict[str, int] = {
        a.symbol.upper(): a.id
        for a in assets.values()
        if a.id is not None
    }

    qty: dict[int, Decimal] = {}

    for t in session.exec(select(Transfer).where(Transfer.user_id == user_id)).all():
        aid = symbol_to_id.get(t.currency.upper())
        if aid is None:
            continue
        qty.setdefault(aid, Decimal(0))
        if t.to_account_id == account_id:
            qty[aid] += t.amount
        if t.from_account_id == account_id:
            qty[aid] -= t.amount
            if t.fee and t.fee > 0:
                qty[aid] -= t.fee

    # Order by date then id so same-date intermediate trades net out correctly
    for trade in session.exec(
        select(Trade)
        .where(Trade.user_id == user_id, Trade.account_id == account_id)
        .order_by(Trade.date, Trade.id)  # type: ignore[attr-defined]
    ).all():
        if exclude_trade_id is not None and trade.id == exclude_trade_id:
            continue
        qty.setdefault(trade.from_asset_id, Decimal(0))
        qty.setdefault(trade.to_asset_id, Decimal(0))
        qty[trade.from_asset_id] -= trade.from_amount
        qty[trade.to_asset_id] += trade.to_amount
        if trade.fee_amount and trade.fee_asset_id:
            qty.setdefault(trade.fee_asset_id, Decimal(0))
            qty[trade.fee_asset_id] -= trade.fee_amount

    # Floor only at the end — intermediate negatives on same-date pairs must be allowed to net
    return {k: max(v, Decimal(0)) for k, v in qty.items()}


def _check_from_balance(
    account_id: int,
    user_id: int,
    from_asset_id: int,
    from_amount: Decimal,
    session: Session,
    exclude_trade_id: int | None = None,
) -> None:
    balances = _account_balances(account_id, user_id, session, exclude_trade_id)
    available = balances.get(from_asset_id, Decimal(0))
    if available + _BALANCE_TOLERANCE < from_amount:
        asset = session.get(Asset, from_asset_id)
        symbol = asset.symbol if asset else str(from_asset_id)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient {symbol} balance: available {available:.8f}, needed {from_amount:.8f}",
        )


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
    _check_from_balance(
        body.account_id, current_user.id, body.from_asset_id, body.from_amount, session
    )
    trade = Trade(
        user_id=current_user.id,
        account_id=body.account_id,
        from_asset_id=body.from_asset_id,
        from_amount=body.from_amount,
        to_asset_id=body.to_asset_id,
        to_amount=body.to_amount,
        fee_asset_id=body.fee_asset_id,
        fee_amount=body.fee_amount,
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
        "id", "date", "account",
        "from_asset", "from_amount",
        "to_asset", "to_amount",
        "fee_asset", "fee_amount", "note",
    ])
    for t in trades:
        writer.writerow([
            t.id, t.date,
            accounts.get(t.account_id, str(t.account_id)),
            assets.get(t.from_asset_id, str(t.from_asset_id)),
            t.from_amount,
            assets.get(t.to_asset_id, str(t.to_asset_id)),
            t.to_amount,
            assets.get(t.fee_asset_id, "") if t.fee_asset_id else "",
            t.fee_amount if t.fee_amount is not None else "",
            t.note or "",
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
    _check_from_balance(
        trade.account_id,
        current_user.id,
        trade.from_asset_id,
        trade.from_amount,
        session,
        exclude_trade_id=trade_id,
    )
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


@router.post("/import", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def import_trades_csv() -> dict[str, str]:
    """CSV import format changed with dual-asset trade model. Not yet implemented."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="CSV import is temporarily unavailable while the new trade format is being finalised.",
    )
