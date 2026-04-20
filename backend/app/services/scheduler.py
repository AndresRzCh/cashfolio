import logging
from datetime import UTC, datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import Session, select

from app.core.db import engine
from app.models.asset import Asset
from app.models.firefly import FireflyConfig
from app.models.user import User
from app.services.firefly_service import sync_firefly_accounts
from app.services.price_fetcher import fetch_and_cache_price

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="UTC")


def refresh_all_prices() -> None:
    """Fetch and cache today's price for every asset across all users."""
    logger.info("Nightly price refresh started at %s", datetime.now(UTC).isoformat())
    success = 0
    failed = 0
    with Session(engine) as session:
        assets = list(session.exec(select(Asset)).all())
        users = {u.id: u for u in session.exec(select(User)).all() if u.id is not None}
        for asset in assets:
            user = users.get(asset.user_id)
            if user is None:
                continue
            try:
                price = fetch_and_cache_price(asset, user, session)
                if price is not None:
                    success += 1
                else:
                    failed += 1
            except Exception as exc:
                logger.warning("Price refresh failed for asset %s: %s", asset.symbol, exc)
                failed += 1
    logger.info("Nightly price refresh done — %d ok, %d failed", success, failed)


def sync_all_firefly() -> None:
    """Nightly Firefly III account balance sync for all configured users."""
    logger.info("Nightly Firefly sync started at %s", datetime.now(UTC).isoformat())
    with Session(engine) as session:
        configs = list(session.exec(select(FireflyConfig)).all())
    for config in configs:
        with Session(engine) as session:
            try:
                count = sync_firefly_accounts(config.user_id, session)
                logger.info("Firefly sync ok for user %d — %d accounts", config.user_id, count)
            except Exception as exc:
                logger.warning("Firefly sync failed for user %d: %s", config.user_id, exc)


def start_scheduler() -> None:
    scheduler.add_job(
        refresh_all_prices,
        trigger=CronTrigger(hour=0, minute=5, timezone="UTC"),  # 00:05 UTC daily
        id="nightly_price_refresh",
        replace_existing=True,
    )
    scheduler.add_job(
        sync_all_firefly,
        trigger=CronTrigger(hour=0, minute=15, timezone="UTC"),  # 00:15 UTC daily
        id="nightly_firefly_sync",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started — nightly price refresh at 00:05 UTC, Firefly sync at 00:15 UTC")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
