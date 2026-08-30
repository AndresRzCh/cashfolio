"""Tests for /api/v1/trades: create, update, delete, list, CSV export."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.constants import FIAT_TYPE_ID

TRADES_URL = "/api/v1/trades"
TRANSFERS_URL = "/api/v1/transfers"
ACCOUNTS_URL = "/api/v1/accounts"
ASSETS_URL = "/api/v1/assets"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_account(client: TestClient, headers: dict, name: str = "Broker") -> int:
    resp = client.post(
        ACCOUNTS_URL,
        json={"name": name, "type": "broker", "fiat_enabled": True},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_asset(client: TestClient, headers: dict, symbol: str = "BTC") -> int:
    resp = client.post(
        ASSETS_URL,
        json={"symbol": symbol, "name": f"{symbol} Asset", "price_source": "none"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _cash_asset(client: TestClient, headers: dict, symbol: str = "EUR") -> int:
    """The currency side of a trade: fiat type, priced by FX (mocked to 1 in tests)."""
    existing = client.get(ASSETS_URL, headers=headers).json()
    for a in existing:
        if a["symbol"] == symbol:
            return a["id"]
    resp = client.post(
        ASSETS_URL,
        json={
            "symbol": symbol,
            "name": symbol,
            "price_source": "fx",
            "asset_type_id": FIAT_TYPE_ID,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _fund(client: TestClient, headers: dict, acct_id: int, amount: str,
          currency: str = "EUR", date: str = "2024-12-01") -> None:
    """Deposit cash from outside so the account can afford a buy."""
    resp = client.post(
        TRANSFERS_URL,
        json={"to_account_id": acct_id, "amount": amount, "currency": currency, "date": date},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text


def _trade(client: TestClient, headers: dict, **body) -> dict:
    resp = client.post(TRADES_URL, json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


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
    eur_id = _cash_asset(client, auth_headers)
    _fund(client, auth_headers, acct_id, "15000.00")

    data = _trade(
        client, auth_headers,
        account_id=acct_id,
        from_asset_id=eur_id, from_amount="15000.00",
        to_asset_id=asset_id, to_amount="0.5",
        date="2025-01-15",
    )
    assert data["account_id"] == acct_id
    assert data["from_asset_id"] == eur_id
    assert data["to_asset_id"] == asset_id
    assert float(data["from_amount"]) == pytest.approx(15000.0)
    assert float(data["to_amount"]) == pytest.approx(0.5)


def test_create_sell_trade_with_fee(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Sell Broker")
    asset_id = _create_asset(client, auth_headers, "ETHSELL")
    eur_id = _cash_asset(client, auth_headers)
    _fund(client, auth_headers, acct_id, "2000.00")
    _trade(
        client, auth_headers,
        account_id=acct_id,
        from_asset_id=eur_id, from_amount="2000.00",
        to_asset_id=asset_id, to_amount="1.0",
        date="2025-01-10",
    )

    data = _trade(
        client, auth_headers,
        account_id=acct_id,
        from_asset_id=asset_id, from_amount="1.0",
        to_asset_id=eur_id, to_amount="2500.00",
        fee_asset_id=eur_id, fee_amount="5.00",
        date="2025-03-20", note="Partial exit",
    )
    assert float(data["fee_amount"]) == pytest.approx(5.0)
    assert data["fee_asset_id"] == eur_id
    assert data["note"] == "Partial exit"


def test_create_trade_missing_field_rejected(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Bad Body Broker")
    asset_id = _create_asset(client, auth_headers, "XYZOP")

    resp = client.post(
        TRADES_URL,
        json={"account_id": acct_id, "to_asset_id": asset_id, "to_amount": "1", "date": "2025-01-01"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_create_trade_zero_amount_rejected(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Zero Qty Broker")
    asset_id = _create_asset(client, auth_headers, "ZEROSYM")
    eur_id = _cash_asset(client, auth_headers)

    resp = client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "from_asset_id": eur_id, "from_amount": "100",
            "to_asset_id": asset_id, "to_amount": "0",
            "date": "2025-01-01",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_create_trade_insufficient_balance_rejected(client: TestClient, auth_headers: dict):
    """Spending more than the account holds is refused, not silently allowed."""
    acct_id = _create_account(client, auth_headers, "Broke Broker")
    asset_id = _create_asset(client, auth_headers, "BROKESYM")
    eur_id = _cash_asset(client, auth_headers)
    _fund(client, auth_headers, acct_id, "100.00")

    resp = client.post(
        TRADES_URL,
        json={
            "account_id": acct_id,
            "from_asset_id": eur_id, "from_amount": "500",
            "to_asset_id": asset_id, "to_amount": "1",
            "date": "2025-01-01",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert "Insufficient" in resp.text


def test_list_trades_contains_created(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "List Broker")
    asset_id = _create_asset(client, auth_headers, "LISTASSET")
    eur_id = _cash_asset(client, auth_headers)
    _fund(client, auth_headers, acct_id, "333.33")
    _trade(
        client, auth_headers,
        account_id=acct_id,
        from_asset_id=eur_id, from_amount="333.33",
        to_asset_id=asset_id, to_amount="3",
        date="2025-05-05",
    )

    resp = client.get(TRADES_URL, headers=auth_headers)
    amounts = [float(t["from_amount"]) for t in resp.json() if t["to_asset_id"] == asset_id]
    assert any(abs(a - 333.33) < 0.01 for a in amounts)


def test_update_trade(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Update Broker")
    asset_id = _create_asset(client, auth_headers, "UPDASSET")
    eur_id = _cash_asset(client, auth_headers)
    _fund(client, auth_headers, acct_id, "100.00")
    tid = _trade(
        client, auth_headers,
        account_id=acct_id,
        from_asset_id=eur_id, from_amount="100.00",
        to_asset_id=asset_id, to_amount="1",
        date="2025-01-01",
    )["id"]

    resp = client.patch(
        f"{TRADES_URL}/{tid}",
        json={"to_amount": "1.2", "note": "Corrected quantity"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert float(resp.json()["to_amount"]) == pytest.approx(1.2)
    assert resp.json()["note"] == "Corrected quantity"


def test_delete_trade(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Del Broker")
    asset_id = _create_asset(client, auth_headers, "DELASSET")
    eur_id = _cash_asset(client, auth_headers)
    _fund(client, auth_headers, acct_id, "10.00")
    tid = _trade(
        client, auth_headers,
        account_id=acct_id,
        from_asset_id=eur_id, from_amount="10.00",
        to_asset_id=asset_id, to_amount="1",
        date="2025-01-01",
    )["id"]

    assert client.delete(f"{TRADES_URL}/{tid}", headers=auth_headers).status_code == 204
    assert client.get(f"{TRADES_URL}/{tid}", headers=auth_headers).status_code == 404


def test_export_trades_csv(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "CSV Broker")
    asset_id = _create_asset(client, auth_headers, "CSVTRADE")
    eur_id = _cash_asset(client, auth_headers)
    _fund(client, auth_headers, acct_id, "294.00")
    _trade(
        client, auth_headers,
        account_id=acct_id,
        from_asset_id=eur_id, from_amount="294.00",
        to_asset_id=asset_id, to_amount="7",
        date="2025-08-08",
    )

    resp = client.get(f"{TRADES_URL}/export", headers=auth_headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    text = resp.text
    assert "from_asset" in text
    assert "to_amount" in text
    assert "CSVTRADE" in text


def test_trades_require_auth(client: TestClient):
    resp = client.get(TRADES_URL)
    assert resp.status_code == 401
