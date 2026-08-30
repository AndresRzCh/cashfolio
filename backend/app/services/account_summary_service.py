from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlmodel import Session, select

from app.core.constants import FIAT_TYPE_ID
from app.models.account import Account
from app.models.asset import Asset, PriceCache
from app.models.trade import Trade
from app.models.transfer import Transfer
from app.services.price_fetcher import get_historical_fx_rate

_TOL = Decimal("0.0000001")


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
    """Per-account P&L using a flow model.

    Trades are internal conversions (they only move quantities within an
    account). Every inflow (external deposit / transfer in) and outflow
    (external withdrawal / transfer out) is valued in the base currency at the
    time it happened. An account's P&L is then::

        P&L = current_value - inflows + outflows

    so an emptied account still shows the realized gain/loss from crypto it
    held and transferred out (transfer out valued above its entry value = gain).
    Current value uses the latest available price for each asset (consistent
    with the Holdings page).
    """
    base = base_currency.upper()
    accounts = list(session.exec(select(Account).where(Account.user_id == user_id)).all())
    trades = sorted(
        session.exec(select(Trade).where(Trade.user_id == user_id)).all(),
        key=lambda t: (t.date, t.id or 0),
    )
    transfers = list(session.exec(select(Transfer).where(Transfer.user_id == user_id)).all())

    assets_by_id = {
        a.id: a
        for a in session.exec(select(Asset).where(Asset.user_id == user_id)).all()
        if a.id is not None
    }
    assets_by_sym = {a.symbol.upper(): a for a in assets_by_id.values()}

    # Latest available price per asset (max date in PriceCache).
    latest_price: dict[int, Decimal] = {}
    latest_date: dict[int, date] = {}
    if assets_by_id:
        for p in session.exec(
            select(PriceCache).where(
                PriceCache.asset_id.in_(list(assets_by_id))  # type: ignore[attr-defined]
            )
        ).all():
            if p.asset_id not in latest_date or p.date > latest_date[p.asset_id]:
                latest_date[p.asset_id] = p.date
                latest_price[p.asset_id] = p.price_in_base_currency

    def price_of(asset_id: int) -> Decimal | None:
        a = assets_by_id.get(asset_id)
        if a is not None and a.symbol.upper() == base:
            return Decimal(1)
        return latest_price.get(asset_id)

    def unit_value(asset: Asset | None, d: date) -> Decimal | None:
        """Base-currency value of one unit of asset on date d."""
        if asset is None:
            return Decimal(1)  # unknown symbol — assume base currency
        if asset.symbol.upper() == base:
            return Decimal(1)
        if asset.asset_type_id == FIAT_TYPE_ID:  # cash: use historical FX
            fx = get_historical_fx_rate(asset.symbol, base, d, session)
            return fx if fx is not None else price_of(asset.id or -1)
        return price_of(asset.id or -1)

    def transfer_value(t: Transfer, asset: Asset | None) -> Decimal:
        if t.value is not None:
            return t.value
        uv = unit_value(asset, t.date)
        return t.amount * uv if uv is not None else Decimal(0)

    result: list[AccountSummaryRow] = []
    for account in accounts:
        assert account.id is not None
        qty: dict[int, Decimal] = {}
        inflows = Decimal(0)
        outflows = Decimal(0)
        cash_deposited = Decimal(0)
        cash_withdrawn = Decimal(0)

        for t in transfers:
            asset = assets_by_sym.get(t.currency.upper())
            val = transfer_value(t, asset)
            if t.to_account_id == account.id:
                inflows += val
                if t.from_account_id is None:
                    cash_deposited += val
                if asset and asset.id is not None:
                    qty[asset.id] = qty.get(asset.id, Decimal(0)) + t.amount
            if t.from_account_id == account.id:
                fee_val = (
                    t.fee * (unit_value(asset, t.date) or Decimal(0))
                    if t.fee
                    else Decimal(0)
                )
                outflows += val + fee_val
                if t.to_account_id is None:
                    cash_withdrawn += val
                if asset and asset.id is not None:
                    qty[asset.id] = (
                        qty.get(asset.id, Decimal(0)) - t.amount - (t.fee or Decimal(0))
                    )

        for trade in trades:
            if trade.account_id != account.id:
                continue
            qty[trade.from_asset_id] = qty.get(trade.from_asset_id, Decimal(0)) - trade.from_amount
            qty[trade.to_asset_id] = qty.get(trade.to_asset_id, Decimal(0)) + trade.to_amount
            if trade.fee_amount and trade.fee_asset_id:
                qty[trade.fee_asset_id] = (
                    qty.get(trade.fee_asset_id, Decimal(0)) - trade.fee_amount
                )

        total_value = Decimal(0)
        num_assets = 0
        for aid, q in qty.items():
            if q <= _TOL:
                continue
            num_assets += 1
            p = price_of(aid)
            if p is not None:
                total_value += q * p

        total_pnl = total_value - inflows + outflows
        total_invested = inflows - outflows
        total_pnl_pct = (total_pnl / inflows * 100) if inflows > 0 else None

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
