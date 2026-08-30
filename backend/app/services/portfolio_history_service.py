import bisect
from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlmodel import Session, select

from app.core.constants import FIAT_TYPE_ID
from app.models.account import Account
from app.models.asset import Asset, PriceCache
from app.models.trade import Trade
from app.models.transfer import Transfer
from app.services.price_fetcher import get_historical_fx_rate

PriceLookup = Callable[[int, date], Decimal | None]


def _reduce(
    qty: dict, cost: dict | None, key, amount: Decimal
) -> Decimal:
    """
    Take `amount` out of a position at its average cost.

    The average is over the quantity held *before* the disposal. Returns the
    cost released, so callers can move it somewhere else (transfers do).
    """
    held = qty.get(key, Decimal(0))
    qty[key] = max(held - amount, Decimal(0))
    if cost is None:
        return Decimal(0)
    held_cost = cost.get(key, Decimal(0))
    avg = held_cost / held if held > 0 else Decimal(0)
    released = avg * amount
    cost[key] = max(held_cost - released, Decimal(0))
    return released


def _apply_trade(
    trade: Trade,
    qty: dict[int, Decimal],
    cost: dict[int, Decimal] | None = None,
    get_price: PriceLookup | None = None,
    acc_qty: dict[tuple[int, int], Decimal] | None = None,
    acc_cost: dict[tuple[int, int], Decimal] | None = None,
) -> None:
    """Update running quantity (and optionally cost basis) maps for a dual-asset trade."""
    fa = trade.from_asset_id
    ta = trade.to_asset_id

    from_price = get_price(fa, trade.date) if (cost is not None and get_price) else None
    from_value = trade.from_amount * from_price if from_price else Decimal(0)

    _reduce(qty, cost, fa, trade.from_amount)
    qty[ta] = qty.get(ta, Decimal(0)) + trade.to_amount
    if cost is not None:
        cost[ta] = cost.get(ta, Decimal(0)) + from_value
    if trade.fee_amount and trade.fee_asset_id:
        _reduce(qty, cost, trade.fee_asset_id, trade.fee_amount)

    if acc_qty is None:
        return

    acct = trade.account_id
    _reduce(acc_qty, acc_cost, (acct, fa), trade.from_amount)
    acc_qty[(acct, ta)] = acc_qty.get((acct, ta), Decimal(0)) + trade.to_amount
    if acc_cost is not None:
        acc_cost[(acct, ta)] = acc_cost.get((acct, ta), Decimal(0)) + from_value
    if trade.fee_amount and trade.fee_asset_id:
        _reduce(acc_qty, acc_cost, (acct, trade.fee_asset_id), trade.fee_amount)


def _apply_transfer(
    transfer: Transfer,
    asset_id: int,
    acc_qty: dict[tuple[int, int], Decimal],
    acc_cost: dict[tuple[int, int], Decimal],
) -> None:
    """
    Move a non-fiat asset between accounts, carrying its cost basis along.

    Global quantities are untouched — the asset never left the portfolio, only
    the per-account breakdown shifts. Mirrors holdings_service.
    """
    moved_cost = Decimal(0)
    if transfer.from_account_id is not None:
        key = (transfer.from_account_id, asset_id)
        held = acc_qty.get(key, Decimal(0))
        avg = acc_cost.get(key, Decimal(0)) / held if held > 0 else Decimal(0)
        moved_cost = avg * transfer.amount
        # The fee is burned, not transferred: it leaves and arrives nowhere.
        _reduce(acc_qty, acc_cost, key, transfer.amount + (transfer.fee or Decimal(0)))

    if transfer.to_account_id is not None:
        key = (transfer.to_account_id, asset_id)
        acc_qty[key] = acc_qty.get(key, Decimal(0)) + transfer.amount
        acc_cost[key] = acc_cost.get(key, Decimal(0)) + moved_cost


def compute_portfolio_history(
    user_id: int,
    session: Session,
    base_currency: str,
    days: int = 90,
    account_id: int | None = None,
) -> list[dict[str, str]]:
    """
    Daily value / cost / P&L / net-deposit series for the portfolio.

    With `account_id` set, the series covers only that account: its trades, and
    the transfers that moved assets or cash in or out of it.

    Value covers positions plus cash. P&L is measured against net deposits, so
    it answers "what have I made on the money I put in", not "what would I make
    if I sold today" — `total_cost` is still reported for the latter.
    """
    trades = sorted(
        session.exec(select(Trade).where(Trade.user_id == user_id)).all(),
        key=lambda t: (t.date, t.id or 0),
    )
    transfers = sorted(
        session.exec(select(Transfer).where(Transfer.user_id == user_id)).all(),
        key=lambda t: (t.date, t.id or 0),
    )
    assets = {
        a.id: a
        for a in session.exec(select(Asset).where(Asset.user_id == user_id)).all()
        if a.id is not None
    }
    if not assets:
        return []

    symbol_to_asset_id = {a.symbol.upper(): aid for aid, a in assets.items()}
    account_ids = {
        a.id
        for a in session.exec(select(Account).where(Account.user_id == user_id)).all()
        if a.id is not None
    }
    scope = {account_id} if account_id is not None else account_ids

    # ── Price lookup ──────────────────────────────────────────────────────────
    price_rows = session.exec(
        select(PriceCache).where(
            PriceCache.asset_id.in_(list(assets))  # type: ignore[attr-defined]
        )
    ).all()

    raw: dict[int, list[tuple[date, Decimal]]] = defaultdict(list)
    for p in price_rows:
        raw[p.asset_id].append((p.date, p.price_in_base_currency))

    price_dates: dict[int, list[date]] = {}
    price_vals: dict[int, list[Decimal]] = {}
    for aid, series in raw.items():
        series.sort()
        price_dates[aid] = [s[0] for s in series]
        price_vals[aid] = [s[1] for s in series]

    # Base currency is always 1; without it every EUR-funded cost collapses to 0.
    base_asset_ids = {
        aid for aid, a in assets.items() if a.symbol.upper() == base_currency.upper()
    }

    def get_price(aid: int, d: date) -> Decimal | None:
        if aid in base_asset_ids:
            return Decimal(1)
        dates = price_dates.get(aid)
        if not dates:
            return None
        idx = bisect.bisect_right(dates, d) - 1
        return price_vals[aid][idx] if idx >= 0 else None

    def unit_value(asset: Asset | None, d: date) -> Decimal:
        """Base-currency value of one unit of an asset on a given day."""
        if asset is None or asset.id is None:
            return Decimal(0)
        unit = get_price(asset.id, d)
        if unit is None and asset.asset_type_id == FIAT_TYPE_ID:
            unit = get_historical_fx_rate(asset.symbol, base_currency, d, session)
        return unit or Decimal(0)

    # ── Event stream ──────────────────────────────────────────────────────────
    # Trades sort before transfers within a day, so buy-then-send lands in order.
    events: list[tuple[date, int, int, str, object]] = []
    for t in trades:
        events.append((t.date, 0, t.id or 0, "trade", t))
    for tr in transfers:
        events.append((tr.date, 1, tr.id or 0, "transfer", tr))
    events.sort(key=lambda e: (e[0], e[1], e[2]))

    qty: dict[int, Decimal] = {}
    cost: dict[int, Decimal] = {}
    acc_qty: dict[tuple[int, int], Decimal] = {}
    acc_cost: dict[tuple[int, int], Decimal] = {}
    net_deposits = Decimal(0)
    # Cash is plain arithmetic and never floored, so same-day pairs can net out.
    fiat_qty: dict[tuple[int, int], Decimal] = {}

    def move_fiat(account: int | None, asset_id: int, amount: Decimal) -> None:
        if account is None:
            return
        fiat_qty[(account, asset_id)] = fiat_qty.get((account, asset_id), Decimal(0)) + amount

    def apply(event: tuple[date, int, int, str, object]) -> None:
        nonlocal net_deposits
        kind, obj = event[3], event[4]
        if kind == "trade":
            trade: Trade = obj  # type: ignore[assignment]
            _apply_trade(trade, qty, cost, get_price, acc_qty, acc_cost)
            for asset_id, amount in (
                (trade.from_asset_id, -trade.from_amount),
                (trade.to_asset_id, trade.to_amount),
                (trade.fee_asset_id, -(trade.fee_amount or Decimal(0))),
            ):
                a = assets.get(asset_id) if asset_id is not None else None
                if a is not None and a.asset_type_id == FIAT_TYPE_ID:
                    move_fiat(trade.account_id, asset_id, amount)  # type: ignore[arg-type]
            return

        transfer: Transfer = obj  # type: ignore[assignment]
        asset_id = symbol_to_asset_id.get(transfer.currency.upper())
        asset = assets.get(asset_id) if asset_id is not None else None

        # Internal moves cancel when both ends are in scope, leaving external money.
        unit = unit_value(asset, transfer.date)
        value = (
            transfer.value if transfer.value is not None else transfer.amount * unit
        )
        if transfer.to_account_id in scope:
            net_deposits += value
        if transfer.from_account_id in scope:
            net_deposits -= value
            if transfer.fee:
                net_deposits -= transfer.fee * unit

        if asset_id is None or asset is None:
            return
        if asset.asset_type_id != FIAT_TYPE_ID:
            _apply_transfer(transfer, asset_id, acc_qty, acc_cost)
            return
        move_fiat(transfer.to_account_id, asset_id, transfer.amount)
        move_fiat(transfer.from_account_id, asset_id, -(transfer.amount + (transfer.fee or Decimal(0))))

    today = datetime.now(UTC).date()
    cutoff = today - timedelta(days=days)

    ptr = 0
    n_events = len(events)
    while ptr < n_events and events[ptr][0] < cutoff:
        apply(events[ptr])
        ptr += 1

    def positions() -> list[tuple[int, Decimal, Decimal]]:
        """(asset_id, quantity, cost) for everything in scope right now."""
        if account_id is None:
            return [
                (aid, q, cost.get(aid, Decimal(0)))
                for aid, q in qty.items()
                if q > 0
            ]
        return [
            (aid, q, acc_cost.get((acct, aid), Decimal(0)))
            for (acct, aid), q in acc_qty.items()
            if acct == account_id and q > 0
        ]

    history: list[dict[str, str]] = []
    current_date = cutoff

    while current_date <= today:
        while ptr < n_events and events[ptr][0] <= current_date:
            apply(events[ptr])
            ptr += 1

        total_value = Decimal(0)
        total_cost = Decimal(0)
        has_price = False
        for aid, net_qty, position_cost in positions():
            asset = assets.get(aid)
            if asset is None or asset.asset_type_id == FIAT_TYPE_ID:
                continue
            price = get_price(aid, current_date)
            if price is None:
                continue
            total_value += net_qty * price
            total_cost += position_cost
            has_price = True

        for (acct, aid), balance in fiat_qty.items():
            if acct not in scope or balance <= 0:
                continue
            total_value += balance * unit_value(assets.get(aid), current_date)

        # Starts at the first priced day, then runs on so closed accounts hit zero.
        if has_price or history:
            history.append(
                {
                    "date": str(current_date),
                    "total_value": str(total_value),
                    "total_cost": str(total_cost),
                    "total_pnl": str(total_value - net_deposits),
                    "net_deposits": str(net_deposits),
                }
            )

        current_date += timedelta(days=1)

    return history
