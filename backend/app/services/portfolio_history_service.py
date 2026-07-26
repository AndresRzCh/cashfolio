import bisect
from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlmodel import Session, select

from app.models.asset import Asset, PriceCache
from app.models.trade import Trade


def _apply_trade(
    trade: Trade,
    qty: dict[int, Decimal],
    cost: dict[int, Decimal] | None = None,
    get_price: Callable[[int, date], Decimal | None] | None = None,
) -> None:
    """Update running quantity (and optionally cost basis) map for a dual-asset trade."""
    fa = trade.from_asset_id
    ta = trade.to_asset_id

    qty.setdefault(fa, Decimal(0))
    qty.setdefault(ta, Decimal(0))

    if cost is not None:
        cost.setdefault(fa, Decimal(0))
        cost.setdefault(ta, Decimal(0))

        from_price = get_price(fa, trade.date) if get_price else None
        from_value = trade.from_amount * from_price if from_price else Decimal(0)

        total_from_qty = qty[fa] + trade.from_amount
        avg_from_cost = cost[fa] / total_from_qty if total_from_qty > 0 else Decimal(0)
        cost[fa] -= avg_from_cost * trade.from_amount
        cost[fa] = max(cost[fa], Decimal(0))

        cost[ta] += from_value

        if trade.fee_amount and trade.fee_asset_id:
            fea = trade.fee_asset_id
            cost.setdefault(fea, Decimal(0))
            total_fee_qty = qty.get(fea, Decimal(0)) + trade.fee_amount
            avg_fee_cost = cost[fea] / total_fee_qty if total_fee_qty > 0 else Decimal(0)
            cost[fea] -= avg_fee_cost * trade.fee_amount
            cost[fea] = max(cost[fea], Decimal(0))

    qty[fa] -= trade.from_amount
    qty[ta] += trade.to_amount

    qty[fa] = max(qty[fa], Decimal(0))
    if trade.fee_asset_id:
        qty.setdefault(trade.fee_asset_id, Decimal(0))
        qty[trade.fee_asset_id] -= trade.fee_amount or Decimal(0)
        qty[trade.fee_asset_id] = max(qty.get(trade.fee_asset_id, Decimal(0)), Decimal(0))


def compute_portfolio_history(
    user_id: int, session: Session, base_currency: str, days: int = 90
) -> list[dict[str, str]]:
    trades = sorted(
        session.exec(select(Trade).where(Trade.user_id == user_id)).all(),
        key=lambda t: t.date,
    )

    asset_ids: set[int] = set()
    for t in trades:
        asset_ids.add(t.from_asset_id)
        asset_ids.add(t.to_asset_id)
        if t.fee_asset_id:
            asset_ids.add(t.fee_asset_id)

    if not asset_ids:
        return []

    # The base currency is always worth 1 in base currency. Without this, EUR
    # (which has no historical price rows) values at 0 and cost basis collapses
    # to 0 for every EUR-funded trade.
    base_asset_ids = {
        a.id
        for a in session.exec(select(Asset).where(Asset.user_id == user_id)).all()
        if a.id is not None and a.symbol.upper() == base_currency.upper()
    }

    today = datetime.now(UTC).date()
    cutoff = today - timedelta(days=days)

    price_rows = session.exec(
        select(PriceCache).where(
            PriceCache.asset_id.in_(list(asset_ids))  # type: ignore[attr-defined]
        )
    ).all()

    raw: dict[int, list[tuple[date, Decimal]]] = defaultdict(list)
    for p in price_rows:
        raw[p.asset_id].append((p.date, p.price_in_base_currency))

    asset_price_dates: dict[int, list[date]] = {}
    asset_price_vals: dict[int, list[Decimal]] = {}
    for aid, series in raw.items():
        series.sort()
        asset_price_dates[aid] = [s[0] for s in series]
        asset_price_vals[aid] = [s[1] for s in series]

    def get_price(aid: int, d: date) -> Decimal | None:
        if aid in base_asset_ids:
            return Decimal(1)
        dates = asset_price_dates.get(aid)
        if not dates:
            return None
        idx = bisect.bisect_right(dates, d) - 1
        return asset_price_vals[aid][idx] if idx >= 0 else None

    qty: dict[int, Decimal] = {}
    cost: dict[int, Decimal] = {}
    trade_ptr = 0
    n_trades = len(trades)

    while trade_ptr < n_trades and trades[trade_ptr].date < cutoff:
        _apply_trade(trades[trade_ptr], qty, cost, get_price)
        trade_ptr += 1

    history: list[dict[str, str]] = []
    current_date = cutoff

    while current_date <= today:
        while trade_ptr < n_trades and trades[trade_ptr].date <= current_date:
            _apply_trade(trades[trade_ptr], qty, cost, get_price)
            trade_ptr += 1

        total_value = Decimal(0)
        has_price = False
        for aid, net_qty in qty.items():
            if net_qty > 0:
                price = get_price(aid, current_date)
                if price is not None:
                    total_value += net_qty * price
                    has_price = True

        if has_price:
            total_cost = sum(v for v in cost.values() if v > 0)
            total_pnl = total_value - total_cost
            history.append(
                {
                    "date": str(current_date),
                    "total_value": str(total_value),
                    "total_cost": str(total_cost),
                    "total_pnl": str(total_pnl),
                }
            )

        current_date += timedelta(days=1)

    return history
