import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import httpx
from sqlmodel import Session, select

from app.models.firefly import FireflyAccount, FireflyConfig

logger = logging.getLogger(__name__)

ACCOUNT_TYPES = {"asset", "liabilities", "loan", "debt", "mortgage"}


def _safe_decimal(value: object) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError):
        return Decimal("0")


def sync_firefly_accounts(user_id: int, session: Session) -> int:
    config = session.exec(
        select(FireflyConfig).where(FireflyConfig.user_id == user_id)
    ).first()
    if config is None:
        raise ValueError("Firefly III not configured for this user")

    base_url = config.url.rstrip("/")
    headers = {"Authorization": f"Bearer {config.api_token}", "Accept": "application/json"}

    fetched: list[dict] = []
    page = 1
    with httpx.Client(timeout=15) as client:
        while True:
            resp = client.get(
                f"{base_url}/api/v1/accounts",
                headers=headers,
                params={"page": page, "type": "all"},
            )
            resp.raise_for_status()
            body = resp.json()
            data = body.get("data", [])
            fetched.extend(data)
            meta = body.get("meta", {}).get("pagination", {})
            if page >= meta.get("total_pages", 1):
                break
            page += 1

    now = datetime.now(timezone.utc)

    # Remove stale cached accounts for this user
    old = list(session.exec(
        select(FireflyAccount).where(FireflyAccount.user_id == user_id)
    ).all())
    for row in old:
        session.delete(row)
    session.flush()

    count = 0
    for item in fetched:
        attrs = item.get("attributes", {})
        acct_type = attrs.get("type", "")
        # Only include asset and liability-type accounts (have meaningful balances)
        if acct_type not in ACCOUNT_TYPES:
            continue
        firefly_id = str(item.get("id", ""))
        balance = _safe_decimal(attrs.get("current_balance", "0"))
        currency = attrs.get("currency_code") or attrs.get("currency", "EUR")
        name = attrs.get("name", f"Account {firefly_id}")
        account = FireflyAccount(
            user_id=user_id,
            firefly_id=firefly_id,
            name=name,
            account_type=acct_type,
            balance=balance,
            currency_code=str(currency),
            last_synced_at=now,
        )
        session.add(account)
        count += 1

    config.last_synced_at = now
    session.add(config)
    session.commit()

    logger.info("Firefly sync done for user %d — %d accounts", user_id, count)
    return count
