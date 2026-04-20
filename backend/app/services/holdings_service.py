from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlmodel import Session, select

from app.models.asset import Asset, PriceCache
from app.models.trade import Trade
from app.services.price_fetcher import get_historical_fx_rate


@dataclass
class HoldingRow:
    asset_id: int
    asset_symbol: str
    asset_name: str
    net_quantity: Decimal
    cost_basis: Decimal
    avg_cost_per_unit: Decimal
    current_price: Decimal | None
    price_date: date | None
    current_value: Decimal | None
    unrealized_pnl: Decimal | None
    unrealized_pnl_pct: Decimal | None


@dataclass
class PortfolioSummary:
    total_cost_basis: Decimal
    total_current_value: Decimal | None
    total_unrealized_pnl: Decimal | None
    total_unrealized_pnl_pct: Decimal | None
    holdings: list[HoldingRow]


def compute_holdings(user_id: int, session: Session, base_currency: str) -> PortfolioSummary:
    today = datetime.now(UTC).date()

    # Sort trades ascending by date so SELL uses correct avg cost
    trades = list(
        session.exec(
            select(Trade)
            .where(Trade.user_id == user_id)
            .order_by(Trade.date.asc())  # type: ignore[attr-defined]
        ).all()
    )
    assets = {
        a.id: a
        for a in session.exec(select(Asset).where(Asset.user_id == user_id)).all()
        if a.id is not None
    }

    # Pre-fetch all unique (currency, date) historical FX rates to avoid N network calls
    hist_fx: dict[tuple[str, date], Decimal] = {}
    for trade in trades:
        c = trade.currency.upper()
        if c != base_currency.upper():
            key = (c, trade.date)
            if key not in hist_fx:
                rate = get_historical_fx_rate(trade.currency, base_currency, trade.date, session)
                if rate is not None:
                    hist_fx[key] = rate

    # Per-asset accumulators
    qty: dict[int, Decimal] = {}
    cost: dict[int, Decimal] = {}

    for trade in trades:
        aid = trade.asset_id
        qty.setdefault(aid, Decimal(0))
        cost.setdefault(aid, Decimal(0))

        if trade.operation == "BUY":
            trade_value = trade.quantity * trade.price_per_unit
            c = trade.currency.upper()
            if c != base_currency.upper():
                fx = hist_fx.get((c, trade.date))
                if fx is not None:
                    trade_value *= fx
            qty[aid] += trade.quantity
            cost[aid] += trade_value

        else:  # SELL
            avg = cost[aid] / qty[aid] if qty[aid] > 0 else Decimal(0)
            sell_cost = avg * trade.quantity
            qty[aid] -= trade.quantity
            cost[aid] -= sell_cost
            if qty[aid] < 0:
                qty[aid] = Decimal(0)
            if cost[aid] < 0:
                cost[aid] = Decimal(0)

    # Fetch the most recent available price for each asset (not just today),
    # consistent with how portfolio_history_service forward-fills prices.
    asset_ids = list(qty.keys())
    all_price_rows = list(
        session.exec(
            select(PriceCache).where(
                PriceCache.asset_id.in_(asset_ids),  # type: ignore[attr-defined]
            )
        ).all()
    ) if asset_ids else []
    prices: dict[int, tuple[Decimal, date]] = {}
    for p in all_price_rows:
        existing = prices.get(p.asset_id)
        if existing is None or p.date > existing[1]:
            prices[p.asset_id] = (p.price_in_base_currency, p.date)

    holdings: list[HoldingRow] = []
    for aid, net_qty in qty.items():
        if net_qty <= 0:
            continue
        asset = assets.get(aid)
        if asset is None:
            continue

        cb = cost.get(aid, Decimal(0))
        avg = cb / net_qty if net_qty else Decimal(0)

        price_entry = prices.get(aid)
        current_price = price_entry[0] if price_entry else None
        price_date = price_entry[1] if price_entry else None

        if current_price is not None:
            current_value = net_qty * current_price
            upnl = current_value - cb
            upnl_pct = (upnl / cb * 100) if cb else None
        else:
            current_value = None
            upnl = None
            upnl_pct = None

        holdings.append(HoldingRow(
            asset_id=aid,
            asset_symbol=asset.symbol,
            asset_name=asset.name,
            net_quantity=net_qty,
            cost_basis=cb,
            avg_cost_per_unit=avg,
            current_price=current_price,
            price_date=price_date,
            current_value=current_value,
            unrealized_pnl=upnl,
            unrealized_pnl_pct=upnl_pct,
        ))

    holdings.sort(key=lambda h: h.asset_symbol)

    total_cost = sum((h.cost_basis for h in holdings), Decimal(0))
    valued = [h for h in holdings if h.current_value is not None]
    total_value: Decimal | None = (
        sum((h.current_value for h in valued if h.current_value is not None), Decimal(0))
        if valued
        else None
    )
    total_pnl: Decimal | None = (total_value - total_cost) if total_value is not None else None
    total_pnl_pct: Decimal | None = (
        total_pnl / total_cost * 100 if (total_pnl is not None and total_cost) else None
    )

    return PortfolioSummary(
        total_cost_basis=total_cost,
        total_current_value=total_value,
        total_unrealized_pnl=total_pnl,
        total_unrealized_pnl_pct=total_pnl_pct,
        holdings=holdings,
    )
