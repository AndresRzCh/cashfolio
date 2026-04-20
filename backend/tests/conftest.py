"""
Shared pytest fixtures for the CashFolio backend test suite.

Key design decisions:
- In-memory SQLite database per test session (StaticPool keeps a single connection).
- get_session dependency is overridden so every endpoint hits the in-memory DB.
- get_historical_fx_rate and fetch_and_cache_price are patched to return
  deterministic values so no external network calls are made.
- A `auth_headers` fixture registers + logs in a test user and returns the
  Bearer token header dict ready for use in test requests.
"""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.core.db import get_session
from app.main import app

# ---------------------------------------------------------------------------
# Database fixture — fresh in-memory SQLite for every test module
# ---------------------------------------------------------------------------

@pytest.fixture(name="session", scope="module")
def session_fixture():
    """Create all tables in a fresh in-memory SQLite, yield a Session."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="client", scope="module")
def client_fixture(session: Session):
    """Override get_session to use the in-memory session, return TestClient."""

    def _get_session_override():
        return session

    app.dependency_overrides[get_session] = _get_session_override

    # Patch external network calls so tests never hit real APIs
    with (
        patch(
            "app.services.holdings_service.get_historical_fx_rate",
            return_value=Decimal("1"),
        ),
        patch(
            "app.services.price_fetcher.fetch_and_cache_price",
            return_value=None,
        ),
    ):
        with TestClient(app, raise_server_exceptions=True) as c:
            yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

TEST_EMAIL = "testuser@example.com"
TEST_PASSWORD = "s3cr3tPassw0rd!"
TEST_CURRENCY = "EUR"


@pytest.fixture(name="auth_headers", scope="module")
def auth_headers_fixture(client: TestClient) -> dict[str, str]:
    """Register (idempotent) + log in the test user; return Bearer headers."""
    client.post(
        "/api/v1/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "base_currency": TEST_CURRENCY},
    )
    resp = client.post(
        "/api/v1/auth/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
