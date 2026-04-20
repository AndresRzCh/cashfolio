import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlmodel import Session, select

from app.models.asset import CustomPrice


def import_custom_prices(
    asset_id: int,
    csv_content: str,
    session: Session,
) -> dict:
    """
    Parse and import custom price CSV.

    Expected format: CSV with header row containing 'date' and 'price' columns.
    - date: ISO format (YYYY-MM-DD)
    - price: non-negative decimal number

    Returns {"imported": int, "errors": list[str]}.
    All-or-nothing: writes only if errors list is empty.
    Upserts: if a CustomPrice for (asset_id, date) already exists, it is updated.
    """
    reader = csv.DictReader(io.StringIO(csv_content.strip()))
    if reader.fieldnames is None or not {"date", "price"}.issubset(set(reader.fieldnames)):
        return {"imported": 0, "errors": ["CSV must have 'date' and 'price' columns"]}

    rows: list[tuple[date, Decimal]] = []
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):  # row 1 is the header
        raw_date = (row.get("date") or "").strip()
        raw_price = (row.get("price") or "").strip()

        try:
            parsed_date = date.fromisoformat(raw_date)
        except ValueError:
            errors.append(f"Row {i}: invalid date '{raw_date}' (expected YYYY-MM-DD)")
            continue

        try:
            parsed_price = Decimal(raw_price)
            if parsed_price < 0:
                raise ValueError("negative")
        except (InvalidOperation, ValueError):
            errors.append(f"Row {i}: invalid price '{raw_price}'")
            continue

        rows.append((parsed_date, parsed_price))

    if errors:
        return {"imported": 0, "errors": errors}

    for parsed_date, parsed_price in rows:
        existing = session.exec(
            select(CustomPrice).where(
                CustomPrice.asset_id == asset_id,
                CustomPrice.date == parsed_date,
            )
        ).first()
        if existing:
            existing.price = parsed_price
            session.add(existing)
        else:
            session.add(
                CustomPrice(asset_id=asset_id, date=parsed_date, price=parsed_price)
            )

    session.commit()
    return {"imported": len(rows), "errors": []}
