"""
FX Rate Cache management endpoints.

All endpoints require authentication but FxRateCache is a global shared
cache — no user-scoping is applied to queries.
"""
import csv
import io
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models.fx_rate_cache import FxRateCache
from app.models.user import User
from app.schemas.fx_rate import FxRateFetchRequest, FxRateRead
from app.services.price_fetcher import get_historical_fx_rate

router = APIRouter()

MAX_FETCH_DAYS = 1096  # ~3 years


# ── Static routes first (before /{id}) ────────────────────────────────────────


@router.get("/export")
def export_fx_rates_csv(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Download all cached FX rates as a CSV file."""
    rows = session.exec(
        select(FxRateCache).order_by(
            FxRateCache.from_currency,
            FxRateCache.to_currency,
            FxRateCache.date,  # type: ignore[arg-type]
        )
    ).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["date", "from_currency", "to_currency", "rate"])
    for r in rows:
        writer.writerow([r.date, r.from_currency, r.to_currency, r.rate])
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=fx_rates.csv"},
    )


@router.post("/import")
async def import_fx_rates_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, object]:
    """
    Bulk import FX rates from CSV.
    Required columns: date, from_currency, to_currency, rate
    Existing rows (same from_currency + to_currency + date) are skipped.
    """
    try:
        content = (await file.read()).decode("utf-8")
        reader = csv.DictReader(io.StringIO(content))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not parse CSV: {exc}",
        )

    required_cols = {"date", "from_currency", "to_currency", "rate"}
    if reader.fieldnames is None or not required_cols.issubset(set(reader.fieldnames)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV must have columns: {', '.join(sorted(required_cols))}",
        )

    # Pre-load existing keys for fast lookup
    existing: set[tuple[str, str, date]] = {
        (r.from_currency, r.to_currency, r.date)
        for r in session.exec(select(FxRateCache)).all()
    }

    imported = 0
    skipped = 0
    errors: list[dict[str, object]] = []

    for row_num, row in enumerate(reader, start=2):  # 1-based, row 1 is header
        try:
            raw_date = row["date"].strip()
            from_cur = row["from_currency"].strip().upper()
            to_cur = row["to_currency"].strip().upper()
            raw_rate = row["rate"].strip()

            if not raw_date or not from_cur or not to_cur or not raw_rate:
                raise ValueError("Empty required field")

            try:
                parsed_date = date.fromisoformat(raw_date)
            except ValueError:
                raise ValueError(f"Invalid date '{raw_date}' — expected YYYY-MM-DD")

            try:
                rate = Decimal(raw_rate)
            except InvalidOperation:
                raise ValueError(f"Invalid rate '{raw_rate}'")

            if rate <= Decimal("0"):
                raise ValueError("rate must be > 0")

            key = (from_cur, to_cur, parsed_date)
            if key in existing:
                skipped += 1
                continue

            session.add(
                FxRateCache(
                    from_currency=from_cur,
                    to_currency=to_cur,
                    date=parsed_date,
                    rate=rate,
                )
            )
            existing.add(key)
            imported += 1

        except Exception as exc:
            errors.append({"row": row_num, "error": str(exc)})

    if imported > 0:
        try:
            session.commit()
        except Exception as exc:
            session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error during commit: {exc}",
            )

    return {"imported": imported, "skipped": skipped, "errors": errors}


@router.post("/fetch")
def fetch_fx_rates(
    body: FxRateFetchRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    """
    Trigger Frankfurter historical fetch for a currency pair over a date range.
    Newly cached rows are counted; already-cached dates are skipped.
    Capped at 3 years (1096 days) to prevent abuse.
    """
    if body.end_date < body.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be >= start_date",
        )

    total_days = (body.end_date - body.start_date).days + 1
    if total_days > MAX_FETCH_DAYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Date range too large — maximum {MAX_FETCH_DAYS} days (~3 years)",
        )

    from_cur = body.from_currency.upper()
    to_cur = body.to_currency.upper()

    # Snapshot already-cached dates before we begin
    already_cached: set[date] = {
        r.date
        for r in session.exec(
            select(FxRateCache).where(
                FxRateCache.from_currency == from_cur,
                FxRateCache.to_currency == to_cur,
            )
        ).all()
    }

    fetched = 0
    current = body.start_date
    while current <= body.end_date:
        if current not in already_cached:
            rate = get_historical_fx_rate(from_cur, to_cur, current, session)
            if rate is not None:
                # get_historical_fx_rate commits its own row; track to avoid re-fetching
                already_cached.add(current)
                fetched += 1
        current += timedelta(days=1)

    return {"fetched": fetched}


@router.get("", response_model=list[FxRateRead])
def list_fx_rates(
    from_currency: str | None = None,
    to_currency: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[FxRateCache]:
    """List cached FX rates, optionally filtered by currency pair. Max 500 rows, newest first."""
    query = select(FxRateCache).order_by(
        FxRateCache.date.desc()  # type: ignore[attr-defined]
    ).limit(500)

    if from_currency:
        query = query.where(FxRateCache.from_currency == from_currency.upper())
    if to_currency:
        query = query.where(FxRateCache.to_currency == to_currency.upper())

    return list(session.exec(query).all())


# ── Parameterized routes last ──────────────────────────────────────────────────


@router.delete("/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fx_rate(
    rate_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a single cached FX rate row by primary key."""
    row = session.get(FxRateCache, rate_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="FX rate not found",
        )
    session.delete(row)
    session.commit()
