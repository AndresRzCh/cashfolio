"""
Price fetcher service.

Fetches current prices from external APIs.
Never call these from hot-path request handlers — use the scheduler or
the explicit on-demand refresh endpoint only.
"""
import logging
import time
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation

import httpx
from sqlmodel import Session, select

from app.models.asset import Asset, CustomPrice, PriceCache
from app.models.fx_rate_cache import FxRateCache
from app.models.user import User

logger = logging.getLogger(__name__)

BINANCE_API_URL = "https://api.binance.com/api/v3"
FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"


def _safe_decimal(value: object) -> Decimal | None:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError):
        return None


# ── FX conversion ─────────────────────────────────────────────────────────────

def get_fx_rate(from_currency: str, to_currency: str) -> Decimal | None:
    """Fetch live FX rate from Frankfurter (ECB data). Returns None on failure."""
    if from_currency.upper() == to_currency.upper():
        return Decimal("1")
    try:
        with httpx.Client(timeout=10) as client:
            r = client.get(
                FRANKFURTER_URL,
                params={"from": from_currency.upper(), "to": to_currency.upper()},
            )
            r.raise_for_status()
            rates = r.json().get("rates", {})
            return _safe_decimal(rates.get(to_currency.upper()))
    except Exception as exc:
        logger.warning(
            "Frankfurter FX fetch failed (%s -> %s): %s", from_currency, to_currency, exc
        )
        return None


def get_historical_fx_rate(
    from_currency: str,
    to_currency: str,
    trade_date: date,
    session: Session,
) -> Decimal | None:
    """
    Return the FX rate for from_currency -> to_currency on trade_date.

    Checks FxRateCache first. On a cache miss, fetches from Frankfurter
    historical endpoint and persists the result. Frankfurter returns the
    closest prior business day when trade_date is a weekend/holiday.
    """
    if from_currency.upper() == to_currency.upper():
        return Decimal("1")

    from_up = from_currency.upper()
    to_up = to_currency.upper()

    # Cache lookup
    cached = session.exec(
        select(FxRateCache).where(
            FxRateCache.from_currency == from_up,
            FxRateCache.to_currency == to_up,
            FxRateCache.date == trade_date,
        )
    ).first()
    if cached:
        return cached.rate

    # Fetch from Frankfurter historical endpoint
    url = f"https://api.frankfurter.dev/v1/{trade_date}"
    try:
        with httpx.Client(timeout=10) as client:
            r = client.get(url, params={"from": from_up, "to": to_up})
            r.raise_for_status()
            rates = r.json().get("rates", {})
            rate = _safe_decimal(rates.get(to_up))
    except Exception as exc:
        logger.warning(
            "Frankfurter historical fetch failed (%s -> %s, %s): %s",
            from_currency, to_currency, trade_date, exc,
        )
        return None

    if rate is None:
        return None

    entry = FxRateCache(
        from_currency=from_up,
        to_currency=to_up,
        date=trade_date,
        rate=rate,
    )
    session.add(entry)
    try:
        session.commit()
    except Exception:
        session.rollback()

    return rate


# ── Binance ───────────────────────────────────────────────────────────────────

def fetch_binance_price(symbol: str, base_currency: str) -> Decimal | None:
    """Fetch current crypto price from Binance public API (free, no key).

    Price is always returned in base_currency via FX conversion from USD.
    """
    pair = f"{symbol.upper()}USDT"
    try:
        with httpx.Client(timeout=10) as client:
            r = client.get(f"{BINANCE_API_URL}/ticker/price", params={"symbol": pair})
            r.raise_for_status()
            price_usd = _safe_decimal(r.json().get("price"))
        if price_usd is None:
            return None
        if base_currency.upper() == "USD":
            return price_usd
        fx = get_fx_rate("USD", base_currency)
        return price_usd * fx if fx is not None else None
    except Exception as exc:
        logger.warning("Binance fetch failed for %s: %s", pair, exc)
        return None


# ── yfinance ──────────────────────────────────────────────────────────────────

def fetch_yfinance_price(ticker: str, base_currency: str) -> Decimal | None:
    """
    Fetch current price via yfinance.
    yfinance returns prices in the asset's native currency; we then convert
    via Frankfurter if the asset currency differs from base_currency.
    """
    try:
        import yfinance as yf  # lazy import — not always needed

        info = yf.Ticker(ticker).fast_info
        raw = getattr(info, "last_price", None) or getattr(
            info, "regular_market_previous_close", None
        )
        price = _safe_decimal(raw)
        if price is None:
            return None
        asset_currency = (getattr(info, "currency", None) or base_currency).upper()
        if asset_currency != base_currency.upper():
            fx = get_fx_rate(asset_currency, base_currency)
            if fx is None:
                return None
            price = price * fx
        return price
    except Exception as exc:
        logger.warning("yfinance fetch failed for %s: %s", ticker, exc)
        return None


# ── Custom price lookup ────────────────────────────────────────────────────────

def get_custom_price(asset_id: int, target_date: date, session: Session) -> Decimal | None:
    """Return the most recent CustomPrice on or before target_date."""
    row = session.exec(
        select(CustomPrice)
        .where(CustomPrice.asset_id == asset_id, CustomPrice.date <= target_date)
        .order_by(CustomPrice.date.desc())  # type: ignore[attr-defined]
    ).first()
    return row.price if row else None


# ── Main dispatcher ────────────────────────────────────────────────────────────

def fetch_and_cache_price(asset: Asset, user: User, session: Session) -> Decimal | None:
    """
    Fetch the current price for an asset, store it in PriceCache, and return it.
    Checks the cache first — only hits the external API if today's price is absent.
    """
    today = datetime.now(UTC).date()

    # Check cache first
    cached = session.exec(
        select(PriceCache).where(
            PriceCache.asset_id == asset.id,
            PriceCache.date == today,
        )
    ).first()
    if cached:
        return cached.price_in_base_currency

    # Fetch from source
    price: Decimal | None = None
    source = asset.price_source

    if source == "binance" and asset.external_id:
        price = fetch_binance_price(asset.external_id, user.base_currency)
    elif source == "yfinance" and asset.external_id:
        price = fetch_yfinance_price(asset.external_id, user.base_currency)
    elif source == "custom":
        price = get_custom_price(asset.id, today, session)  # type: ignore[arg-type]
    # source == "none" -> price stays None

    if price is not None:
        entry = PriceCache(
            asset_id=asset.id, date=today, price_in_base_currency=price
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)

    return price


# ── Historical backfill ────────────────────────────────────────────────────────

def _backfill_binance(
    symbol: str, base_currency: str, days: int
) -> list[tuple[date, Decimal]]:
    """Fetch daily close prices from Binance klines. Paginates in 1000-day chunks."""
    from datetime import timedelta

    pair = f"{symbol.upper()}USDT"
    today = datetime.now(UTC).date()
    cutoff = today - timedelta(days=days)

    fx = Decimal("1")
    if base_currency.upper() != "USD":
        rate = get_fx_rate("USD", base_currency)
        if rate is None:
            logger.warning(
                "Binance backfill: could not get FX rate USD->%s, aborting", base_currency
            )
            return []
        fx = rate

    by_date: dict[date, Decimal] = {}
    chunk_start = cutoff

    while chunk_start < today:
        chunk_end = min(chunk_start + timedelta(days=999), today)
        start_ms = int(
            datetime(chunk_start.year, chunk_start.month, chunk_start.day, tzinfo=UTC).timestamp()
            * 1000
        )
        end_ms = int(
            datetime(chunk_end.year, chunk_end.month, chunk_end.day, tzinfo=UTC).timestamp()
            * 1000
        )
        try:
            with httpx.Client(timeout=60) as client:
                r = client.get(
                    f"{BINANCE_API_URL}/klines",
                    params={
                        "symbol": pair,
                        "interval": "1d",
                        "startTime": start_ms,
                        "endTime": end_ms,
                        "limit": 1000,
                    },
                )
                r.raise_for_status()
                for candle in r.json():
                    # candle: [openTime, open, high, low, close, vol, closeTime, ...]
                    close_time_ms = candle[6]
                    close_price = _safe_decimal(candle[4])
                    if close_price is not None:
                        d = datetime.fromtimestamp(close_time_ms / 1000, tz=UTC).date()
                        by_date[d] = close_price * fx
        except Exception as exc:
            logger.warning(
                "Binance backfill chunk %s–%s failed for %s: %s",
                chunk_start, chunk_end, pair, exc,
            )

        chunk_start = chunk_end + timedelta(days=1)
        if chunk_start < today:
            time.sleep(0.2)

    return list(by_date.items())


def _backfill_yfinance(
    ticker_symbol: str, base_currency: str, days: int
) -> list[tuple[date, Decimal]]:
    """Fetch daily Close price history from yfinance."""
    try:
        from datetime import timedelta

        import yfinance as yf

        end = datetime.now(UTC).date()
        start = end - timedelta(days=days)
        ticker = yf.Ticker(ticker_symbol)
        hist = ticker.history(start=start.isoformat(), end=end.isoformat())
        if hist.empty:
            return []
        info = ticker.fast_info
        asset_currency = (getattr(info, "currency", None) or base_currency).upper()
        fx = Decimal("1")
        if asset_currency != base_currency.upper():
            rate = get_fx_rate(asset_currency, base_currency)
            if rate is None:
                return []
            fx = rate
        result: list[tuple[date, Decimal]] = []
        for idx, row in hist.iterrows():
            d = idx.date() if hasattr(idx, "date") else idx
            close = row.get("Close") or row.get("close")
            price = _safe_decimal(close)
            if price is not None:
                result.append((d, price * fx))
        return result
    except Exception as exc:
        logger.warning("yfinance backfill failed for %s: %s", ticker_symbol, exc)
        return []


def backfill_price_history(
    asset: Asset, user: User, session: Session, days: int = 365
) -> int:
    """
    Fetch and insert historical daily prices for an asset into PriceCache.
    Skips dates already cached. Returns the number of new rows inserted.
    """
    if asset.price_source not in ("binance", "yfinance") or not asset.external_id:
        return 0

    existing: set[date] = {
        p.date
        for p in session.exec(
            select(PriceCache).where(PriceCache.asset_id == asset.id)
        ).all()
    }

    if asset.price_source == "binance":
        points = _backfill_binance(asset.external_id, user.base_currency, days)
    else:
        points = _backfill_yfinance(asset.external_id, user.base_currency, days)

    count = 0
    for d, price in points:
        if d not in existing:
            session.add(
                PriceCache(asset_id=asset.id, date=d, price_in_base_currency=price)
            )
            count += 1

    if count > 0:
        session.commit()

    logger.info(
        "Backfilled %d price rows for asset %s (id=%s)", count, asset.symbol, asset.id
    )
    return count
