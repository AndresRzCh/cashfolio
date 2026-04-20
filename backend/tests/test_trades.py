"""Tests for /api/v1/trades: create, list, CSV export."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


TRADES_URL = "/api/v1/trades"
ACCOUNTS_URL = "/api/v1/accounts"
ASSETS_URL = "/api/v1/assets"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_account(client: TestClient, headers: dict, name: str = "Broker") -> int:
    resp = client.post(ACCOUNTS_URL, json={"name": name, "type": "broker"}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_asset(client: TestClient, headers: dict, symbol: str = "BTC") -> int:
    resp = client.post(
        ASSETS_URL,
        json={"symbol": symbol, "name": f"{symbol} Asset", "price_source": "none"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_list_trades_empty(client: TestClient, auth_headers: dict):
    resp = client.get(TRADES_URL, headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_buy_trade(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Buy Broker")
    asset_id = _create_asset(client, auth_headers, "BTCBUY")

    resp = client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "operation": "BUY",
            "asset_id": asset_id,
            "quantity": "0.5",
            "price_per_unit": "30000.00",
            "currency": "EUR",
            "date": "2025-01-15",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["operation"] == "BUY"
    assert data["account_id"] == acct_id
    assert data["asset_id"] == asset_id
    assert float(data["quantity"]) == pytest.approx(0.5)
    assert float(data["price_per_unit"]) == pytest.approx(30000.0)


def test_create_sell_trade(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Sell Broker")
    asset_id = _create_asset(client, auth_headers, "ETHSELL")

    resp = client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "operation": "SELL",
            "asset_id": asset_id,
            "quantity": "1.0",
            "price_per_unit": "2000.00",
            "currency": "USD",
            "fee": "5.00",
            "fee_currency": "USD",
            "date": "2025-03-20",
            "note": "Partial exit",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["operation"] == "SELL"
    assert float(data["fee"]) == pytest.approx(5.0)
    assert data["fee_currency"] == "USD"
    assert data["note"] == "Partial exit"


def test_create_trade_invalid_operation(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Bad Op Broker")
    asset_id = _create_asset(client, auth_headers, "XYZOP")

    resp = client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "operation": "HOLD",  # invalid
            "asset_id": asset_id,
            "quantity": "1.0",
            "price_per_unit": "100.00",
            "currency": "EUR",
            "date": "2025-01-01",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_create_trade_zero_quantity_rejected(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Zero Qty Broker")
    asset_id = _create_asset(client, auth_headers, "ZEROSYM")

    resp = client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "operation": "BUY",
            "asset_id": asset_id,
            "quantity": "0",
            "price_per_unit": "100.00",
            "currency": "EUR",
            "date": "2025-01-01",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_create_trade_operation_case_insensitive(client: TestClient, auth_headers: dict):
    """Lowercase 'buy' should be normalized to 'BUY'."""
    acct_id = _create_account(client, auth_headers, "Case Broker")
    asset_id = _create_asset(client, auth_headers, "CASEOP")

    resp = client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "operation": "buy",
            "asset_id": asset_id,
            "quantity": "1",
            "price_per_unit": "50.00",
            "currency": "EUR",
            "date": "2025-04-01",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["operation"] == "BUY"


def test_list_trades_contains_created(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "List Broker")
    asset_id = _create_asset(client, auth_headers, "LISTASSET")

    client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "operation": "BUY",
            "asset_id": asset_id,
            "quantity": "3",
            "price_per_unit": "111.11",
            "currency": "EUR",
            "date": "2025-05-05",
        },
        headers=auth_headers,
    )
    resp = client.get(TRADES_URL, headers=auth_headers)
    prices = [float(t["price_per_unit"]) for t in resp.json()]
    assert any(abs(p - 111.11) < 0.01 for p in prices)


def test_update_trade(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Update Broker")
    asset_id = _create_asset(client, auth_headers, "UPDASSET")

    create_resp = client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "operation": "BUY",
            "asset_id": asset_id,
            "quantity": "1",
            "price_per_unit": "100.00",
            "currency": "EUR",
            "date": "2025-01-01",
        },
        headers=auth_headers,
    )
    tid = create_resp.json()["id"]

    patch_resp = client.patch(
        f"{TRADES_URL}/{tid}",
        json={"price_per_unit": "120.00", "note": "Corrected price"},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    assert float(patch_resp.json()["price_per_unit"]) == pytest.approx(120.0)
    assert patch_resp.json()["note"] == "Corrected price"


def test_delete_trade(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Del Broker")
    asset_id = _create_asset(client, auth_headers, "DELASSET")

    create_resp = client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "operation": "BUY",
            "asset_id": asset_id,
            "quantity": "1",
            "price_per_unit": "10.00",
            "currency": "EUR",
            "date": "2025-01-01",
        },
        headers=auth_headers,
    )
    tid = create_resp.json()["id"]

    del_resp = client.delete(f"{TRADES_URL}/{tid}", headers=auth_headers)
    assert del_resp.status_code == 204

    get_resp = client.get(f"{TRADES_URL}/{tid}", headers=auth_headers)
    assert get_resp.status_code == 404


def test_export_trades_csv(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "CSV Broker")
    asset_id = _create_asset(client, auth_headers, "CSVTRADE")

    client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "operation": "BUY",
            "asset_id": asset_id,
            "quantity": "7",
            "price_per_unit": "42.00",
            "currency": "EUR",
            "date": "2025-08-08",
        },
        headers=auth_headers,
    )
    resp = client.get(f"{TRADES_URL}/export", headers=auth_headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    text = resp.text
    assert "operation" in text
    assert "quantity" in text
    assert "42" in text


def test_trades_require_auth(client: TestClient):
    resp = client.get(TRADES_URL)
    assert resp.status_code == 401
