import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlmodel import Session, select

from app.models.account import Account
from app.models.transfer import Transfer


def import_transfers(user_id: int, csv_content: str, session: Session) -> dict[str, object]:
    """
    Parse and import transfers from CSV.

    Required columns: date, amount, currency
    Optional columns: from_account, to_account, fee, note

    'from_account' and 'to_account' are resolved by Account.name (user-scoped).
    Empty values are treated as null (external source/destination).
    Validates that at least one of from_account or to_account is provided per row.

    All-or-nothing: writes only if errors list is empty.
    Returns {"imported": int, "errors": list[str]}.
    """
    reader = csv.DictReader(io.StringIO(csv_content.strip()))
    required = {"date", "amount", "currency"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        return {
            "imported": 0,
            "errors": [f"CSV must have columns: {', '.join(sorted(required))}"],
        }

    # Pre-load user's accounts as name→id map
    account_map: dict[str, int] = {
        a.name: a.id
        for a in session.exec(
            select(Account).where(Account.user_id == user_id)
        ).all()
        if a.id is not None
    }

    rows: list[Transfer] = []
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

        # amount
        try:
            amount = Decimal(get("amount"))
            if amount <= 0:
                raise ValueError
        except (InvalidOperation, ValueError):
            errors.append(
                f"Row {i}: amount must be a positive number, got '{get('amount')}'"
            )
            continue

        # currency
        currency = get("currency")
        if not currency:
            errors.append(f"Row {i}: currency is required")
            continue

        # optional from_account (resolve by name; empty = null)
        from_account_id: int | None = None
        raw_from = get("from_account")
        if raw_from:
            from_account_id = account_map.get(raw_from)
            if from_account_id is None:
                errors.append(f"Row {i}: Account '{raw_from}' not found")
                continue

        # optional to_account (resolve by name; empty = null)
        to_account_id: int | None = None
        raw_to = get("to_account")
        if raw_to:
            to_account_id = account_map.get(raw_to)
            if to_account_id is None:
                errors.append(f"Row {i}: Account '{raw_to}' not found")
                continue

        # at least one account must be provided
        if from_account_id is None and to_account_id is None:
            errors.append(
                f"Row {i}: at least one of from_account or to_account must be provided"
            )
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

        note = get("note") or None

        rows.append(
            Transfer(
                user_id=user_id,
                from_account_id=from_account_id,
                to_account_id=to_account_id,
                amount=amount,
                currency=currency,
                fee=fee,
                date=parsed_date,
                note=note,
            )
        )

    if errors:
        return {"imported": 0, "errors": errors}

    for transfer in rows:
        session.add(transfer)
    session.commit()
    return {"imported": len(rows), "errors": []}
