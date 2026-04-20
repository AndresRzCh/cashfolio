"""
Tests for /api/v1/holdings: compute holdings from trades, verify average-cost math.

All FX rates are mocked to 1:1 (same-currency trades) so arithmetic is clean.
Price API calls are also patched out — holdings will have no current_price
unless we manually insert a PriceCache row.
"""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models.asset import PriceCache

HOLDINGS_URL = "/api/v1/holdings"
ACCOUNTS_URL = "/api/v1/accounts"
ASSETS_URL = "/api/v1/assets"
TRADES_URL = "/api/v1/trades"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_account(client: TestClient, headers: dict, name: str) -> int:
    resp = client.post(ACCOUNTS_URL, json={"name": name, "type": "broker"}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_asset(client: TestClient, headers: dict, symbol: str) -> int:
    resp = client.post(
        ASSETS_URL,
        json={"symbol": symbol, "name": f"{symbol} Name", "price_source": "none"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _buy(client, headers, acct_id, asset_id, qty, price, date="2025-01-01", currency="EUR"):
    resp = client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "operation": "BUY",
            "asset_id": asset_id,
            "quantity": str(qty),
            "price_per_unit": str(price),
            "currency": currency,
            "date": date,
        },
        headers=headers,
    )
    assert resp.status_code == 201


def _sell(client, headers, acct_id, asset_id, qty, price, date="2025-06-01", currency="EUR"):
    resp = client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "operation": "SELL",
            "asset_id": asset_id,
            "quantity": str(qty),
            "price_per_unit": str(price),
            "currency": currency,
            "date": date,
        },
        headers=headers,
    )
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# Holdings tests — each uses its own unique symbols to avoid cross-test pollution
# ---------------------------------------------------------------------------

def test_holdings_empty(client: TestClient, auth_headers: dict):
    resp = client.get(HOLDINGS_URL, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "holdings" in data
    assert "total_cost_basis" in data


def test_single_buy_creates_holding(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Hold Broker 1")
    asset_id = _create_asset(client, auth_headers, "HOLD1")

    _buy(client, auth_headers, acct_id, asset_id, qty=10, price=100)

    resp = client.get(HOLDINGS_URL, headers=auth_headers)
    data = resp.json()

    holding = next((h for h in data["holdings"] if h["asset_symbol"] == "HOLD1"), None)
    assert holding is not None
    assert float(holding["net_quantity"]) == pytest.approx(10.0)
    assert float(holding["cost_basis"]) == pytest.approx(1000.0)   # 10 * 100
    assert float(holding["avg_cost_per_unit"]) == pytest.approx(100.0)


def test_two_buys_average_cost(client: TestClient, auth_headers: dict):
    """
    Buy 10 @ 100 = 1000, then buy 10 @ 200 = 2000.
    Total qty = 20, total cost = 3000, avg = 150.
    """
    acct_id = _create_account(client, auth_headers, "Avg Broker")
    asset_id = _create_asset(client, auth_headers, "AVGTEST")

    _buy(client, auth_headers, acct_id, asset_id, qty=10, price=100, date="2025-01-01")
    _buy(client, auth_headers, acct_id, asset_id, qty=10, price=200, date="2025-02-01")

    resp = client.get(HOLDINGS_URL, headers=auth_headers)
    data = resp.json()

    holding = next(h for h in data["holdings"] if h["asset_symbol"] == "AVGTEST")
    assert float(holding["net_quantity"]) == pytest.approx(20.0)
    assert float(holding["cost_basis"]) == pytest.approx(3000.0)
    assert float(holding["avg_cost_per_unit"]) == pytest.approx(150.0)


def test_buy_then_partial_sell_average_cost(client: TestClient, auth_headers: dict):
    """
    Buy 10 @ 100 (cost = 1000, avg = 100).
    Sell 4 @ 120 (removes 4 * avg(100) = 400 from cost basis).
    Remaining: qty=6, cost=600, avg=100.
    """
    acct_id = _create_account(client, auth_headers, "Sell Broker 2")
    asset_id = _create_asset(client, auth_headers, "SELLTEST")

    _buy(client, auth_headers, acct_id, asset_id, qty=10, price=100, date="2025-01-01")
    _sell(client, auth_headers, acct_id, asset_id, qty=4, price=120, date="2025-03-01")

    resp = client.get(HOLDINGS_URL, headers=auth_headers)
    data = resp.json()

    holding = next(h for h in data["holdings"] if h["asset_symbol"] == "SELLTEST")
    assert float(holding["net_quantity"]) == pytest.approx(6.0)
    assert float(holding["cost_basis"]) == pytest.approx(600.0)
    assert float(holding["avg_cost_per_unit"]) == pytest.approx(100.0)


def test_full_sell_removes_holding(client: TestClient, auth_headers: dict):
    """
    Buy 5 @ 200, sell all 5 -> no holding should appear.
    """
    acct_id = _create_account(client, auth_headers, "Full Sell Broker")
    asset_id = _create_asset(client, auth_headers, "FULLSELL")

    _buy(client, auth_headers, acct_id, asset_id, qty=5, price=200, date="2025-01-01")
    _sell(client, auth_headers, acct_id, asset_id, qty=5, price=250, date="2025-04-01")

    resp = client.get(HOLDINGS_URL, headers=auth_headers)
    data = resp.json()

    holding = next((h for h in data["holdings"] if h["asset_symbol"] == "FULLSELL"), None)
    assert holding is None


def test_total_cost_basis_sums_holdings(client: TestClient, auth_headers: dict):
    """
    Two distinct assets with known costs. total_cost_basis should include both.
    """
    acct_id = _create_account(client, auth_headers, "Total Broker")
    a1_id = _create_asset(client, auth_headers, "TOTAL1")
    a2_id = _create_asset(client, auth_headers, "TOTAL2")

    _buy(client, auth_headers, acct_id, a1_id, qty=2, price=500, date="2025-01-01")   # 1000
    _buy(client, auth_headers, acct_id, a2_id, qty=4, price=250, date="2025-01-01")   # 1000

    resp = client.get(HOLDINGS_URL, headers=auth_headers)
    data = resp.json()

    # Total cost must be at least the two known amounts (there may be other holdings)
    total = float(data["total_cost_basis"])
    assert total >= 2000.0


def test_holdings_current_value_with_cached_price(
    client: TestClient,
    auth_headers: dict,
    session: Session,
):
    """
    Insert a PriceCache row manually, then verify holdings returns current_value.
    """
    from datetime import date

    acct_id = _create_account(client, auth_headers, "Price Broker")
    asset_id = _create_asset(client, auth_headers, "PRICED")

    _buy(client, auth_headers, acct_id, asset_id, qty=5, price=100, date="2025-01-01")

    # Manually seed a price so compute_holdings can compute current_value
    session.add(
        PriceCache(
            asset_id=asset_id,
            date=date(2025, 6, 1),
            price_in_base_currency=Decimal("150"),
        )
    )
    session.commit()

    resp = client.get(HOLDINGS_URL, headers=auth_headers)
    data = resp.json()

    holding = next(h for h in data["holdings"] if h["asset_symbol"] == "PRICED")
    assert holding["current_price"] is not None
    assert float(holding["current_price"]) == pytest.approx(150.0)
    # current_value = 5 * 150 = 750
    assert float(holding["current_value"]) == pytest.approx(750.0)
    # unrealized_pnl = 750 - 500 = 250
    assert float(holding["unrealized_pnl"]) == pytest.approx(250.0)
    # unrealized_pnl_pct = 250/500 * 100 = 50%
    assert float(holding["unrealized_pnl_pct"]) == pytest.approx(50.0)


def test_holdings_export_csv(client: TestClient, auth_headers: dict):
    resp = client.get(f"{HOLDINGS_URL}/export", headers=auth_headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    text = resp.text
    assert "asset_symbol" in text
    assert "cost_basis" in text


def test_holdings_require_auth(client: TestClient):
    resp = client.get(HOLDINGS_URL)
    assert resp.status_code == 401
