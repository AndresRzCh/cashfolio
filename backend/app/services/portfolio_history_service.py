import bisect
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlmodel import Session, select

from app.models.asset import PriceCache
from app.models.trade import Trade
from app.services.price_fetcher import get_historical_fx_rate


def _apply_trade(
    trade: Trade,
    qty: dict[int, Decimal],
    cost: dict[int, Decimal],
    base_currency: str,
    fx_cache: dict[tuple[str, date], Decimal],
) -> None:
    aid = trade.asset_id
    qty.setdefault(aid, Decimal(0))
    cost.setdefault(aid, Decimal(0))
    trade_value = trade.quantity * trade.price_per_unit
    c = trade.currency.upper()
    if c != base_currency.upper():
        trade_value *= fx_cache.get((c, trade.date), Decimal("1"))
    if trade.operation == "BUY":
        qty[aid] += trade.quantity
        cost[aid] += trade_value
    else:
        avg = cost[aid] / qty[aid] if qty[aid] > 0 else Decimal(0)
        qty[aid] -= trade.quantity
        cost[aid] -= avg * trade.quantity
        qty[aid] = max(qty[aid], Decimal(0))
        cost[aid] = max(cost[aid], Decimal(0))


def compute_portfolio_history(
    user_id: int, session: Session, base_currency: str, days: int = 90
) -> list[dict[str, str]]:
    trades = sorted(
        session.exec(select(Trade).where(Trade.user_id == user_id)).all(),
        key=lambda t: t.date,
    )
    asset_ids = list({t.asset_id for t in trades})
    if not asset_ids:
        return []

    today = datetime.now(UTC).date()
    cutoff = today - timedelta(days=days)

    # Load ALL cached prices (no date filter) so we can forward-fill any gaps
    price_rows = session.exec(
        select(PriceCache).where(
            PriceCache.asset_id.in_(asset_ids)  # type: ignore[attr-defined]
        )
    ).all()

    # Build per-asset sorted price series for O(log n) forward-fill via bisect
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
        dates = asset_price_dates.get(aid)
        if not dates:
            return None
        idx = bisect.bisect_right(dates, d) - 1
        return asset_price_vals[aid][idx] if idx >= 0 else None

    # Pre-cache historical FX rates keyed by (currency, date) to avoid N network calls
    fx_cache: dict[tuple[str, date], Decimal] = {}
    for t in trades:
        c = t.currency.upper()
        if c != base_currency.upper():
            key = (c, t.date)
            if key not in fx_cache:
                rate = get_historical_fx_rate(t.currency, base_currency, t.date, session)
                fx_cache[key] = rate if rate is not None else Decimal("1")

    # Walk forward through calendar days, advancing the trade pointer once per
    # trade (O(n_trades + n_days × n_assets) total)
    qty: dict[int, Decimal] = {}
    cost: dict[int, Decimal] = {}
    trade_ptr = 0
    n_trades = len(trades)

    # Consume all trades strictly before cutoff
    while trade_ptr < n_trades and trades[trade_ptr].date < cutoff:
        _apply_trade(trades[trade_ptr], qty, cost, base_currency, fx_cache)
        trade_ptr += 1

    history: list[dict[str, str]] = []
    current_date = cutoff

    while current_date <= today:
        # Apply any trades that fall on this calendar day
        while trade_ptr < n_trades and trades[trade_ptr].date <= current_date:
            _apply_trade(trades[trade_ptr], qty, cost, base_currency, fx_cache)
            trade_ptr += 1

        # Compute portfolio value using forward-filled prices
        total_value = Decimal(0)
        has_price = False
        for aid, net_qty in qty.items():
            if net_qty > 0:
                price = get_price(aid, current_date)
                if price is not None:
                    total_value += net_qty * price
                    has_price = True

        if has_price:
            total_cost = sum(cost.values(), Decimal(0))
            history.append(
                {
                    "date": str(current_date),
                    "total_value": str(total_value),
                    "total_cost": str(total_cost),
                    "total_pnl": str(total_value - total_cost),
                }
            )

        current_date += timedelta(days=1)

    return history
