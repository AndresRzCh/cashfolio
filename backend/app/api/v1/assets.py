import csv
import io
from collections import defaultdict
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models.asset import Asset, CustomPrice, PriceCache
from app.models.trade import Trade
from app.models.user import User
from app.schemas.asset import (
    AssetCreate,
    AssetRead,
    AssetUpdate,
    AssetWithPrice,
    CustomPriceRead,
)
from app.services.custom_price_service import import_custom_prices
from app.services.price_fetcher import backfill_price_history, fetch_and_cache_price

router = APIRouter()


# ── Helper ────────────────────────────────────────────────────────────────────

def _get_asset_or_404(asset_id: int, user_id: int, session: Session) -> Asset:
    asset = session.get(Asset, asset_id)
    if not asset or asset.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return asset


# ── Asset CRUD ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[AssetWithPrice])
def list_assets(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[AssetWithPrice]:
    """
    List all assets for the current user.
    Includes today's cached price when available.
    Does NOT call external price APIs — reads PriceCache only.
    """
    today = datetime.now(UTC).date()
    assets = list(
        session.exec(select(Asset).where(Asset.user_id == current_user.id)).all()
    )

    # Load all PriceCache rows for these assets in one query, compute history stats
    asset_ids = [a.id for a in assets]
    all_prices: list[PriceCache] = []
    history_stats: dict[int, tuple[date, date]] = {}
    if asset_ids:
        all_prices = list(
            session.exec(
                select(PriceCache).where(PriceCache.asset_id.in_(asset_ids))  # type: ignore[attr-defined]
            ).all()
        )
        price_dates: dict[int, list[date]] = defaultdict(list)
        for p in all_prices:
            price_dates[int(p.asset_id)].append(p.date)
        history_stats = {
            aid: (min(dates), max(dates))
            for aid, dates in price_dates.items()
        }

    result: list[AssetWithPrice] = []
    for asset in assets:
        # Today's cached price (already loaded above, look it up from all_prices)
        today_price = next(
            (p for p in all_prices if p.asset_id == asset.id and p.date == today),
            None,
        )
        hs = history_stats.get(asset.id)  # type: ignore[arg-type]
        first_d: date | None = hs[0] if hs else None
        last_d: date | None = hs[1] if hs else None

        result.append(
            AssetWithPrice(
                id=asset.id,  # type: ignore[arg-type]
                user_id=asset.user_id,
                symbol=asset.symbol,
                name=asset.name,
                asset_type_id=asset.asset_type_id,
                price_source=asset.price_source,
                external_id=asset.external_id,
                current_price=str(today_price.price_in_base_currency) if today_price else None,
                price_date=today_price.date if today_price else None,
                history_first_date=first_d,
                history_last_date=last_d,
            )
        )
    return result


@router.get("/{asset_id}", response_model=AssetRead)
def get_asset(
    asset_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Asset:
    return _get_asset_or_404(asset_id, current_user.id, session)


@router.post("", response_model=AssetRead, status_code=status.HTTP_201_CREATED)
def create_asset(
    body: AssetCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Asset:
    asset = Asset(
        user_id=current_user.id,
        symbol=body.symbol,
        name=body.name,
        asset_type_id=body.asset_type_id,
        price_source=body.price_source,
        external_id=body.external_id,
    )
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return asset


@router.patch("/{asset_id}", response_model=AssetRead)
def update_asset(
    asset_id: int,
    body: AssetUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Asset:
    asset = _get_asset_or_404(asset_id, current_user.id, session)
    if body.symbol is not None:
        asset.symbol = body.symbol
    if body.name is not None:
        asset.name = body.name
    if body.asset_type_id is not None:
        asset.asset_type_id = body.asset_type_id
    if body.price_source is not None:
        asset.price_source = body.price_source
    if body.external_id is not None:
        asset.external_id = body.external_id
    session.add(asset)
    session.commit()
    session.refresh(asset)
    return asset


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    asset = _get_asset_or_404(asset_id, current_user.id, session)
    session.delete(asset)
    session.commit()


# ── Price refresh (user-initiated, explicit action) ───────────────────────────

@router.post("/{asset_id}/refresh-price")
def refresh_price(
    asset_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Explicitly trigger a price backfill for this asset from the earliest trade
    date, then fetch today's price. This is an explicit user action, not on the
    hot path.
    """
    asset = _get_asset_or_404(asset_id, current_user.id, session)
    today = datetime.now(UTC).date()

    # Find the earliest trade date for this asset to determine backfill window
    earliest_trade = session.exec(
        select(Trade)
        .where(Trade.asset_id == asset_id, Trade.user_id == current_user.id)
        .order_by(Trade.date)  # type: ignore[arg-type]
    ).first()
    earliest_trade_date = earliest_trade.date if earliest_trade else None

    if earliest_trade_date is None:
        count = 0
    else:
        days = (today - earliest_trade_date).days + 1
        count = backfill_price_history(asset, current_user, session, days)

    # Fetch/refresh today's price
    price = fetch_and_cache_price(asset, current_user, session)

    return {
        "price": str(price) if price is not None else None,
        "date": today.isoformat() if price is not None else None,
        "inserted": count,
    }


# ── Price-cache export / import ───────────────────────────────────────────────

@router.get("/{asset_id}/price-cache/export")
def export_price_cache(
    asset_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Download PriceCache for this asset as CSV (date,price)."""
    asset = _get_asset_or_404(asset_id, current_user.id, session)
    rows = session.exec(
        select(PriceCache)
        .where(PriceCache.asset_id == asset_id)
        .order_by(PriceCache.date)  # type: ignore[arg-type]
    ).all()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["date", "price"])
    for r in rows:
        w.writerow([r.date.isoformat(), str(r.price_in_base_currency)])
    out.seek(0)
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{asset.symbol}_price_history.csv"'
        },
    )


@router.post("/{asset_id}/price-cache/import")
async def import_price_cache(
    asset_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Import PriceCache from CSV (date,price). Skips existing dates."""
    from decimal import Decimal, InvalidOperation

    _get_asset_or_404(asset_id, current_user.id, session)
    content = (await file.read()).decode("utf-8")

    existing: set[date] = {
        p.date
        for p in session.exec(
            select(PriceCache).where(PriceCache.asset_id == asset_id)
        ).all()
    }

    reader = csv.DictReader(io.StringIO(content))
    imported = 0
    errors: list[str] = []
    for i, row in enumerate(reader, start=2):
        try:
            d = date.fromisoformat(row["date"].strip())
            price = Decimal(row["price"].strip())
        except (KeyError, ValueError, InvalidOperation) as e:
            errors.append(f"Row {i}: {e}")
            continue
        if d not in existing:
            session.add(
                PriceCache(asset_id=asset_id, date=d, price_in_base_currency=price)
            )
            imported += 1

    if imported > 0:
        session.commit()
    return {"imported": imported, "errors": errors}


# ── Custom prices ─────────────────────────────────────────────────────────────

@router.post("/{asset_id}/custom-prices/upload")
async def upload_custom_prices(
    asset_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Upload a CSV file of custom prices for an asset.
    Format: header row with 'date' and 'price' columns.
    Transactional: returns 422 with row-level errors if any row is invalid.
    """
    asset = _get_asset_or_404(asset_id, current_user.id, session)
    content = (await file.read()).decode("utf-8")
    result = import_custom_prices(asset.id, content, session)  # type: ignore[arg-type]
    if result["errors"]:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=result)
    return result


@router.get("/{asset_id}/custom-prices", response_model=list[CustomPriceRead])
def list_custom_prices(
    asset_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[CustomPrice]:
    _get_asset_or_404(asset_id, current_user.id, session)
    return list(
        session.exec(
            select(CustomPrice)
            .where(CustomPrice.asset_id == asset_id)
            .order_by(CustomPrice.date.desc())  # type: ignore[arg-type]
        ).all()
    )


@router.delete(
    "/{asset_id}/custom-prices/{price_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_custom_price(
    asset_id: int,
    price_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    _get_asset_or_404(asset_id, current_user.id, session)
    cp = session.get(CustomPrice, price_id)
    if not cp or cp.asset_id != asset_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Custom price not found"
        )
    session.delete(cp)
    session.commit()
