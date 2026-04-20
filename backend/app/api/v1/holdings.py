import csv
import io
import threading

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models.asset import Asset
from app.models.user import User
from app.schemas.holding import PortfolioSummaryRead
from app.services.holdings_service import PortfolioSummary, compute_holdings
from app.services.portfolio_history_service import compute_portfolio_history
from app.services.scheduler import refresh_all_prices

router = APIRouter()


@router.get("", response_model=PortfolioSummaryRead)
def get_holdings(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> PortfolioSummary:
    assert current_user.id is not None
    return compute_holdings(current_user.id, session, current_user.base_currency)


@router.get("/history")
def get_holdings_history(
    days: int = Query(default=90, ge=1, le=3650),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[dict[str, str]]:
    assert current_user.id is not None
    return compute_portfolio_history(current_user.id, session, current_user.base_currency, days)


@router.get("/export")
def export_holdings_csv(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    assert current_user.id is not None
    summary = compute_holdings(current_user.id, session, current_user.base_currency)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "asset_symbol", "asset_name", "net_quantity", "cost_basis",
        "avg_cost_per_unit", "current_price", "current_value",
        "unrealized_pnl", "unrealized_pnl_pct",
    ])
    for h in summary.holdings:
        writer.writerow([
            h.asset_symbol,
            h.asset_name,
            h.net_quantity,
            h.cost_basis,
            h.avg_cost_per_unit,
            h.current_price if h.current_price is not None else "",
            h.current_value if h.current_value is not None else "",
            h.unrealized_pnl if h.unrealized_pnl is not None else "",
            h.unrealized_pnl_pct if h.unrealized_pnl_pct is not None else "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=holdings.csv"},
    )


@router.post("/refresh-all-prices")
def trigger_price_refresh(
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Manually trigger the nightly price refresh job (admin convenience endpoint)."""
    thread = threading.Thread(target=refresh_all_prices, daemon=True)
    thread.start()
    return {"status": "refresh started"}


@router.post("/backfill-history")
def backfill_history(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    """Backfill price history for all user assets, each from its own first trade date."""
    from datetime import UTC, datetime

    from app.models.trade import Trade
    from app.services.price_fetcher import backfill_price_history

    today = datetime.now(UTC).date()
    assets = session.exec(
        select(Asset).where(Asset.user_id == current_user.id)
    ).all()

    total = 0
    for asset in assets:
        earliest = session.exec(
            select(Trade.date)
            .where(Trade.asset_id == asset.id, Trade.user_id == current_user.id)
            .order_by(Trade.date)  # type: ignore[attr-defined]
        ).first()
        if earliest is None:
            continue
        days = (today - earliest).days + 1
        total += backfill_price_history(asset, current_user, session, days)

    return {"inserted": total}
