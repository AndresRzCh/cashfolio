from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlmodel import Session, select

from app.models.account import Account
from app.models.asset import Asset, PriceCache
from app.models.trade import Trade
from app.models.transfer import Transfer
from app.core.constants import FIAT_TYPE_ID
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
    accounts: list['AccountHoldingRow'] = field(default_factory=list)


@dataclass
class AccountHoldingRow:
    account_id: int
    account_name: str
    net_quantity: Decimal
    cost_basis: Decimal
    current_value: Decimal | None
    unrealized_pnl: Decimal | None
    unrealized_pnl_pct: Decimal | None


@dataclass
class FiatAccountRow:
    currency: str
    amount: Decimal
    cost_basis: Decimal
    current_value: Decimal | None
    unrealized_pnl: Decimal | None


@dataclass
class AccountFiatSummary:
    account_id: int
    account_name: str
    rows: list[FiatAccountRow] = field(default_factory=list)


@dataclass
class PortfolioSummary:
    total_cost_basis: Decimal
    total_current_value: Decimal | None
    total_unrealized_pnl: Decimal | None
    total_unrealized_pnl_pct: Decimal | None
    holdings: list[HoldingRow]
    account_fiat: list[AccountFiatSummary] = field(default_factory=list)
    total_net_deposits: Decimal = Decimal(0)


def _get_latest_price(
    asset_id: int,
    prices_map: dict[int, dict[date, Decimal]],
) -> tuple[Decimal, date] | None:
    date_map = prices_map.get(asset_id)
    if not date_map:
        return None
    latest_date = max(date_map)
    return (date_map[latest_date], latest_date)


def _get_price_at_date(
    asset_id: int,
    prices_map: dict[int, dict[date, Decimal]],
    target: date,
) -> Decimal | None:
    """Return the most recent price on or before target date."""
    date_map = prices_map.get(asset_id)
    if not date_map:
        return None
    eligible = [d for d in date_map if d <= target]
    if not eligible:
        return None
    return date_map[max(eligible)]


def compute_holdings(user_id: int, session: Session, base_currency: str) -> PortfolioSummary:
    today = datetime.now(UTC).date()

    trades = list(
        session.exec(
            select(Trade)
            .where(Trade.user_id == user_id)
            .order_by(Trade.date.asc(), Trade.id.asc())  # type: ignore[attr-defined]
        ).all()
    )

    transfers = list(
        session.exec(select(Transfer).where(Transfer.user_id == user_id)).all()
    )

    assets = {
        a.id: a
        for a in session.exec(select(Asset).where(Asset.user_id == user_id)).all()
        if a.id is not None
    }

    accounts = {
        a.id: a
        for a in session.exec(select(Account).where(Account.user_id == user_id)).all()
        if a.id is not None
    }

    # Build prices_map: asset_id -> {date -> price_in_base_currency}
    all_asset_ids = list(assets.keys())
    all_price_rows = (
        list(
            session.exec(
                select(PriceCache).where(
                    PriceCache.asset_id.in_(all_asset_ids)  # type: ignore[attr-defined]
                )
            ).all()
        )
        if all_asset_ids
        else []
    )
    prices_map: dict[int, dict[date, Decimal]] = {}
    for p in all_price_rows:
        prices_map.setdefault(p.asset_id, {})[p.date] = p.price_in_base_currency

    # ── Asset holdings via dual-asset trades ─────────────────────────────────
    qty: dict[int, Decimal] = {}
    cost: dict[int, Decimal] = {}
    acc_qty: dict[tuple[int, int], Decimal] = {}   # (account_id, asset_id)
    acc_cost: dict[tuple[int, int], Decimal] = {}  # (account_id, asset_id)

    for trade in trades:
        fa = trade.from_asset_id
        ta = trade.to_asset_id

        qty.setdefault(fa, Decimal(0))
        qty.setdefault(ta, Decimal(0))
        cost.setdefault(fa, Decimal(0))
        cost.setdefault(ta, Decimal(0))

        # Value of from_asset in base_currency at trade date
        from_price = _get_price_at_date(fa, prices_map, trade.date)
        if from_price is None:
            from_asset = assets.get(fa)
            if from_asset and from_asset.price_source == "fx":
                from_price = get_historical_fx_rate(
                    from_asset.symbol, base_currency, trade.date, session
                )
        from_value = trade.from_amount * from_price if from_price else Decimal(0)

        # Average over the quantity held before the trade, not after.
        avg_from_cost = cost[fa] / qty[fa] if qty[fa] > 0 else Decimal(0)
        cost[fa] -= avg_from_cost * trade.from_amount
        qty[fa] -= trade.from_amount
        qty[fa] = max(qty[fa], Decimal(0))
        cost[fa] = max(cost[fa], Decimal(0))

        # Receive to_asset — cost basis = value of what was given
        cost[ta] += from_value
        qty[ta] += trade.to_amount

        # Fees reduce the fee asset
        if trade.fee_amount and trade.fee_asset_id:
            fea = trade.fee_asset_id
            qty.setdefault(fea, Decimal(0))
            cost.setdefault(fea, Decimal(0))
            avg_fee_cost = cost[fea] / qty[fea] if qty[fea] > 0 else Decimal(0)
            cost[fea] -= avg_fee_cost * trade.fee_amount
            qty[fea] -= trade.fee_amount
            qty[fea] = max(qty[fea], Decimal(0))
            cost[fea] = max(cost[fea], Decimal(0))

        # Per-account tracking (mirrors global logic, scoped to account)
        acct = trade.account_id
        k_from = (acct, fa)
        k_to = (acct, ta)
        acc_qty.setdefault(k_from, Decimal(0))
        acc_qty.setdefault(k_to, Decimal(0))
        acc_cost.setdefault(k_from, Decimal(0))
        acc_cost.setdefault(k_to, Decimal(0))

        avg_from_acc = acc_cost[k_from] / acc_qty[k_from] if acc_qty[k_from] > 0 else Decimal(0)
        acc_cost[k_from] -= avg_from_acc * trade.from_amount
        acc_qty[k_from] -= trade.from_amount
        acc_qty[k_from] = max(acc_qty[k_from], Decimal(0))
        acc_cost[k_from] = max(acc_cost[k_from], Decimal(0))

        acc_cost[k_to] += from_value
        acc_qty[k_to] += trade.to_amount

        if trade.fee_amount and trade.fee_asset_id:
            fea = trade.fee_asset_id
            k_fee = (acct, fea)
            acc_qty.setdefault(k_fee, Decimal(0))
            acc_cost.setdefault(k_fee, Decimal(0))
            avg_fee_acc = acc_cost[k_fee] / acc_qty[k_fee] if acc_qty[k_fee] > 0 else Decimal(0)
            acc_cost[k_fee] -= avg_fee_acc * trade.fee_amount
            acc_qty[k_fee] -= trade.fee_amount
            acc_qty[k_fee] = max(acc_qty[k_fee], Decimal(0))
            acc_cost[k_fee] = max(acc_cost[k_fee], Decimal(0))

    # ── Crypto transfers move quantity + cost basis between accounts ──────────
    # Global qty/cost are unchanged; only the per-account breakdown shifts.
    sym_to_asset_id = {
        a.symbol.upper(): aid for aid, a in assets.items()
    }
    for t in sorted(transfers, key=lambda x: (x.date, x.id or 0)):
        aid = sym_to_asset_id.get(t.currency.upper())
        if aid is None:
            continue
        asset = assets.get(aid)
        if asset is None or asset.asset_type_id == FIAT_TYPE_ID:
            continue  # fiat handled separately
        if t.from_account_id is not None:
            k = (t.from_account_id, aid)
            cur_qty = acc_qty.get(k, Decimal(0))
            cur_cost = acc_cost.get(k, Decimal(0))
            move_qty = t.amount + (t.fee or Decimal(0))
            avg = cur_cost / cur_qty if cur_qty > 0 else Decimal(0)
            moved_cost = avg * t.amount  # fee is a loss, not transferred cost
            acc_qty[k] = max(cur_qty - move_qty, Decimal(0))
            acc_cost[k] = max(cur_cost - avg * move_qty, Decimal(0))
        else:
            moved_cost = Decimal(0)
        if t.to_account_id is not None:
            k = (t.to_account_id, aid)
            acc_qty[k] = acc_qty.get(k, Decimal(0)) + t.amount
            acc_cost[k] = acc_cost.get(k, Decimal(0)) + moved_cost

    holdings: list[HoldingRow] = []
    for aid, net_qty in qty.items():
        if net_qty <= Decimal("0.0000001"):
            continue
        asset = assets.get(aid)
        if asset is None:
            continue
        if asset.asset_type_id == FIAT_TYPE_ID:  # cash lives in account_fiat, not here
            continue

        cb = cost.get(aid, Decimal(0))
        avg = cb / net_qty if net_qty else Decimal(0)
        price_entry = _get_latest_price(aid, prices_map)
        current_price = price_entry[0] if price_entry else None
        price_date = price_entry[1] if price_entry else None
        current_value = net_qty * current_price if current_price is not None else None
        upnl = (current_value - cb) if current_value is not None else None
        upnl_pct = (upnl / cb * 100) if (upnl is not None and cb > 0) else None

        # Build per-account breakdown for this asset
        holding_accounts: list[AccountHoldingRow] = []
        for (acct_id, a_id), net_acc_qty in acc_qty.items():
            if a_id != aid or net_acc_qty <= Decimal("0.0000001"):
                continue
            acc_obj = accounts.get(acct_id)
            if acc_obj is None:
                continue
            cb_acc = acc_cost.get((acct_id, aid), Decimal(0))
            val_acc = net_acc_qty * current_price if current_price is not None else None
            pnl_acc = (val_acc - cb_acc) if val_acc is not None else None
            pnl_pct_acc = (pnl_acc / cb_acc * 100) if (pnl_acc is not None and cb_acc > 0) else None
            holding_accounts.append(AccountHoldingRow(
                account_id=acct_id,
                account_name=acc_obj.name,
                net_quantity=net_acc_qty,
                cost_basis=cb_acc,
                current_value=val_acc,
                unrealized_pnl=pnl_acc,
                unrealized_pnl_pct=pnl_pct_acc,
            ))
        holding_accounts.sort(key=lambda a: a.account_name)

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
            accounts=holding_accounts,
        ))
    holdings.sort(key=lambda h: h.asset_symbol)

    # ── Per-account FIAT balances (only for fiat_enabled accounts) ────────────
    fiat_accounts = [a for a in accounts.values() if a.fiat_enabled]
    account_fiat: list[AccountFiatSummary] = []

    # Same-date fiat-receiving trades sort first, so EUR→USD can fund USD→crypto.
    fiat_sorted_trades = sorted(
        trades,
        key=lambda t: (
            t.date,
            0 if (assets.get(t.to_asset_id) and assets[t.to_asset_id].asset_type_id == FIAT_TYPE_ID) else 1,
            t.id,
        ),
    )

    for acc in fiat_accounts:
        fiat_amount: dict[str, Decimal] = {}
        fiat_cost: dict[str, Decimal] = {}

        # Only fiat transfers count here; crypto ones are in the breakdown above.
        for t in transfers:
            if t.note == 'traspaso':
                continue
            t_asset = sym_to_asset_id.get(t.currency.upper())
            if t_asset is None or assets[t_asset].asset_type_id != FIAT_TYPE_ID:
                continue
            c = t.currency.upper()
            fiat_amount.setdefault(c, Decimal(0))
            fiat_cost.setdefault(c, Decimal(0))

            if t.to_account_id == acc.id:
                rate = (
                    get_historical_fx_rate(c, base_currency, t.date, session)
                    if c != base_currency.upper()
                    else Decimal("1")
                )
                fx = rate or Decimal("1")
                fiat_amount[c] += t.amount
                fiat_cost[c] += t.amount * fx

            if t.from_account_id == acc.id:
                avg_cost = fiat_cost[c] / fiat_amount[c] if fiat_amount[c] > 0 else Decimal(0)
                fiat_amount[c] -= t.amount
                fiat_cost[c] -= avg_cost * t.amount
                if t.fee and t.fee > 0:
                    avg_c = fiat_cost[c] / fiat_amount[c] if fiat_amount[c] > 0 else Decimal(0)
                    fiat_amount[c] -= t.fee
                    fiat_cost[c] -= avg_c * t.fee

        # Trades on this account — only cash assets matter for this section
        for trade in fiat_sorted_trades:
            if trade.account_id != acc.id:
                continue

            fa_asset = assets.get(trade.from_asset_id)
            ta_asset = assets.get(trade.to_asset_id)

            if fa_asset and fa_asset.asset_type_id == FIAT_TYPE_ID:
                c = fa_asset.symbol.upper()
                fiat_amount.setdefault(c, Decimal(0))
                fiat_cost.setdefault(c, Decimal(0))
                avg_c = fiat_cost[c] / fiat_amount[c] if fiat_amount[c] > 0 else Decimal(0)
                fiat_amount[c] -= trade.from_amount
                fiat_cost[c] -= avg_c * trade.from_amount

            if ta_asset and ta_asset.asset_type_id == FIAT_TYPE_ID:
                c = ta_asset.symbol.upper()
                fiat_amount.setdefault(c, Decimal(0))
                fiat_cost.setdefault(c, Decimal(0))
                rate = (
                    get_historical_fx_rate(c, base_currency, trade.date, session)
                    if c != base_currency.upper()
                    else Decimal("1")
                )
                fx = rate or Decimal("1")
                fiat_amount[c] += trade.to_amount
                fiat_cost[c] += trade.to_amount * fx

            if trade.fee_amount and trade.fee_asset_id:
                fee_asset = assets.get(trade.fee_asset_id)
                if fee_asset and fee_asset.asset_type_id == FIAT_TYPE_ID:
                    c = fee_asset.symbol.upper()
                    fiat_amount.setdefault(c, Decimal(0))
                    fiat_cost.setdefault(c, Decimal(0))
                    avg_c = fiat_cost[c] / fiat_amount[c] if fiat_amount[c] > 0 else Decimal(0)
                    fiat_amount[c] -= trade.fee_amount
                    fiat_cost[c] -= avg_c * trade.fee_amount

        rows: list[FiatAccountRow] = []
        for c, amount in fiat_amount.items():
            if amount <= Decimal("0.0001"):
                continue
            cb = max(fiat_cost.get(c, Decimal(0)), Decimal(0))
            rate = (
                get_historical_fx_rate(c, base_currency, today, session)
                if c != base_currency.upper()
                else Decimal("1")
            )
            current_val = amount * rate if rate is not None else None
            upnl = (current_val - cb) if current_val is not None else None
            rows.append(FiatAccountRow(
                currency=c,
                amount=amount,
                cost_basis=cb,
                current_value=current_val,
                unrealized_pnl=upnl,
            ))

        rows.sort(key=lambda r: r.currency)
        if rows:
            account_fiat.append(AccountFiatSummary(
                account_id=acc.id,
                account_name=acc.name,
                rows=rows,
            ))

    # ── Net deposits ──────────────────────────────────────────────────────────
    # Internal transfers touch both sides and cancel out on their own.
    net_deposits = Decimal(0)
    for t in transfers:
        aid = sym_to_asset_id.get(t.currency.upper())
        asset = assets.get(aid) if aid is not None else None
        unit: Decimal | None = None
        if asset is not None and asset.id is not None:
            unit = _get_price_at_date(asset.id, prices_map, t.date)
            if unit is None and asset.symbol.upper() == base_currency.upper():
                unit = Decimal(1)
            if unit is None and asset.asset_type_id == FIAT_TYPE_ID:
                unit = get_historical_fx_rate(asset.symbol, base_currency, t.date, session)
        value = t.value if t.value is not None else t.amount * (unit or Decimal(0))
        if t.to_account_id is not None:
            net_deposits += value
        if t.from_account_id is not None:
            net_deposits -= value
            if t.fee:
                net_deposits -= t.fee * (unit or Decimal(0))

    # ── Totals ────────────────────────────────────────────────────────────────
    total_cost = sum((h.cost_basis for h in holdings), Decimal(0))
    valued = [h for h in holdings if h.current_value is not None]
    total_value: Decimal | None = (
        sum((h.current_value for h in valued if h.current_value is not None), Decimal(0))
        if valued
        else None
    )
    total_pnl: Decimal | None = (total_value - total_cost) if total_value is not None else None
    total_pnl_pct: Decimal | None = (
        total_pnl / total_cost * 100 if (total_pnl is not None and total_cost > 0) else None
    )

    return PortfolioSummary(
        total_cost_basis=total_cost,
        total_current_value=total_value,
        total_unrealized_pnl=total_pnl,
        total_unrealized_pnl_pct=total_pnl_pct,
        holdings=holdings,
        account_fiat=account_fiat,
        total_net_deposits=net_deposits,
    )
