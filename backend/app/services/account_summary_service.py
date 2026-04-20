from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlmodel import Session, select

from app.models.account import Account
from app.models.asset import PriceCache
from app.models.trade import Trade
from app.models.transfer import Transfer
from app.services.price_fetcher import get_fx_rate


@dataclass
class AccountSummaryRow:
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


def compute_account_summaries(
    user_id: int, session: Session, base_currency: str
) -> list[AccountSummaryRow]:
    accounts = list(session.exec(select(Account).where(Account.user_id == user_id)).all())
    trades = sorted(
        session.exec(select(Trade).where(Trade.user_id == user_id)).all(),
        key=lambda t: t.date,
    )
    transfers = list(session.exec(select(Transfer).where(Transfer.user_id == user_id)).all())

    today = datetime.now(UTC).date()
    all_asset_ids = list({t.asset_id for t in trades})
    price_map: dict[int, Decimal] = {}
    if all_asset_ids:
        price_rows = session.exec(
            select(PriceCache).where(
                PriceCache.asset_id.in_(all_asset_ids),  # type: ignore[attr-defined]
                PriceCache.date == today,
            )
        ).all()
        price_map = {p.asset_id: p.price_in_base_currency for p in price_rows}

    # Fetch each unique live FX rate once for the entire computation
    fx_cache: dict[str, Decimal | None] = {}

    def cached_fx(from_currency: str) -> Decimal | None:
        key = from_currency.upper()
        if key not in fx_cache:
            fx_cache[key] = get_fx_rate(key, base_currency)
        return fx_cache[key]

    result: list[AccountSummaryRow] = []
    for account in accounts:
        assert account.id is not None
        account_trades = [t for t in trades if t.account_id == account.id]

        qty: dict[int, Decimal] = {}
        cost: dict[int, Decimal] = {}
        for trade in account_trades:
            aid = trade.asset_id
            qty.setdefault(aid, Decimal(0))
            cost.setdefault(aid, Decimal(0))
            trade_value = trade.quantity * trade.price_per_unit
            if trade.currency.upper() != base_currency.upper():
                fx = cached_fx(trade.currency)
                if fx:
                    trade_value *= fx
            if trade.operation == "BUY":
                qty[aid] += trade.quantity
                cost[aid] += trade_value
            else:
                avg = cost[aid] / qty[aid] if qty[aid] > 0 else Decimal(0)
                qty[aid] -= trade.quantity
                cost[aid] -= avg * trade.quantity
                qty[aid] = max(qty[aid], Decimal(0))
                cost[aid] = max(cost[aid], Decimal(0))

        cash_deposited = Decimal(0)
        cash_withdrawn = Decimal(0)
        for t in transfers:
            amt = t.amount
            if t.currency.upper() != base_currency.upper():
                fx = cached_fx(t.currency)
                if fx:
                    amt = t.amount * fx
            if t.to_account_id == account.id:
                cash_deposited += amt
            if t.from_account_id == account.id:
                cash_withdrawn += amt

        total_invested = sum(cost.values(), Decimal(0))
        total_value = sum(
            (net_qty * price_map.get(aid, Decimal(0))
             for aid, net_qty in qty.items()
             if net_qty > 0),
            Decimal(0),
        )
        total_pnl = total_value - total_invested
        total_pnl_pct = (total_pnl / total_invested * 100) if total_invested else None
        num_assets = sum(1 for q in qty.values() if q > 0)

        result.append(AccountSummaryRow(
            account_id=account.id,
            account_name=account.name,
            account_type=account.type,
            num_assets=num_assets,
            total_invested=total_invested,
            total_value=total_value,
            total_pnl=total_pnl,
            total_pnl_pct=total_pnl_pct,
            cash_deposited=cash_deposited,
            cash_withdrawn=cash_withdrawn,
        ))

    return result
