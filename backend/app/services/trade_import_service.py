import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlmodel import Session, select

from app.models.account import Account
from app.models.asset import Asset
from app.models.trade import Trade

OPERATIONS = {"BUY", "SELL"}


def import_trades(user_id: int, csv_content: str, session: Session) -> dict[str, object]:
    """
    Parse and import trades from CSV.

    Required columns: date, account, operation, asset, quantity, price_per_unit, currency
    Optional columns: fee, fee_currency, note

    'account' is resolved by Account.name (user-scoped).
    'asset' is resolved by Asset.symbol (user-scoped).

    All-or-nothing: writes only if errors list is empty.
    Returns {"imported": int, "errors": list[str]}.
    """
    reader = csv.DictReader(io.StringIO(csv_content.strip()))
    required = {
        "date", "account", "operation", "asset", "quantity", "price_per_unit", "currency"
    }
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        return {
            "imported": 0,
            "errors": [f"CSV must have columns: {', '.join(sorted(required))}"],
        }

    # Pre-load user's accounts and assets as name→id maps
    account_map: dict[str, int] = {
        a.name: a.id
        for a in session.exec(
            select(Account).where(Account.user_id == user_id)
        ).all()
        if a.id is not None
    }
    asset_map: dict[str, int] = {
        a.symbol: a.id
        for a in session.exec(
            select(Asset).where(Asset.user_id == user_id)
        ).all()
        if a.id is not None
    }

    rows: list[Trade] = []
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):

        def get(col: str, _row: dict[str, str | None] = row) -> str:
            return (_row.get(col) or "").strip()

        # date
        try:
            parsed_date = date.fromisoformat(get("date"))
        except ValueError:
            errors.append(f"Row {i}: invalid date '{get('date')}' (expected YYYY-MM-DD)")
            continue

        # account (resolve by name)
        account_name = get("account")
        if not account_name:
            errors.append(f"Row {i}: account is required")
            continue
        account_id = account_map.get(account_name)
        if account_id is None:
            errors.append(f"Row {i}: Account '{account_name}' not found")
            continue

        # operation
        operation = get("operation").upper()
        if operation not in OPERATIONS:
            errors.append(f"Row {i}: operation must be 'BUY' or 'SELL', got '{get('operation')}'")
            continue

        # asset (resolve by symbol)
        asset_symbol = get("asset")
        if not asset_symbol:
            errors.append(f"Row {i}: asset is required")
            continue
        asset_id = asset_map.get(asset_symbol)
        if asset_id is None:
            errors.append(f"Row {i}: Asset '{asset_symbol}' not found")
            continue

        # quantity
        try:
            quantity = Decimal(get("quantity"))
            if quantity <= 0:
                raise ValueError
        except (InvalidOperation, ValueError):
            errors.append(
                f"Row {i}: quantity must be a positive number, got '{get('quantity')}'"
            )
            continue

        # price_per_unit
        try:
            price_per_unit = Decimal(get("price_per_unit"))
            if price_per_unit < 0:
                raise ValueError
        except (InvalidOperation, ValueError):
            errors.append(
                f"Row {i}: price_per_unit must be >= 0, got '{get('price_per_unit')}'"
            )
            continue

        # currency
        currency = get("currency")
        if not currency:
            errors.append(f"Row {i}: currency is required")
            continue

        # optional fee (>= 0)
        fee: Decimal | None = None
        raw_fee = get("fee")
        if raw_fee:
            try:
                fee = Decimal(raw_fee)
                if fee < 0:
                    raise ValueError
            except (InvalidOperation, ValueError):
                errors.append(f"Row {i}: invalid fee '{raw_fee}'")
                continue

        fee_currency = get("fee_currency") or None
        note = get("note") or None

        rows.append(
            Trade(
                user_id=user_id,
                account_id=account_id,
                operation=operation,
                asset_id=asset_id,
                quantity=quantity,
                price_per_unit=price_per_unit,
                currency=currency,
                fee=fee,
                fee_currency=fee_currency,
                date=parsed_date,
                note=note,
            )
        )

    if errors:
        return {"imported": 0, "errors": errors}

    for trade in rows:
        session.add(trade)
    session.commit()
    return {"imported": len(rows), "errors": []}
