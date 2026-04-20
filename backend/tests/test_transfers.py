"""Tests for /api/v1/transfers: create, list, CSV export."""
from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient


TRANSFERS_URL = "/api/v1/transfers"
ACCOUNTS_URL = "/api/v1/accounts"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_account(client: TestClient, headers: dict, name: str = "Test Bank") -> int:
    resp = client.post(ACCOUNTS_URL, json={"name": name, "type": "bank"}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_list_transfers_empty(client: TestClient, auth_headers: dict):
    resp = client.get(TRANSFERS_URL, headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_transfer_deposit(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Deposit Bank")
    resp = client.post(
        TRANSFERS_URL,
        json={
            "to_account_id": acct_id,
            "amount": "1000.00",
            "currency": "EUR",
            "date": "2025-01-10",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["to_account_id"] == acct_id
    assert data["from_account_id"] is None
    assert data["currency"] == "EUR"
    # amount is serialized as Decimal string
    assert float(data["amount"]) == pytest.approx(1000.0)


def test_create_transfer_withdrawal(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Withdrawal Bank")
    resp = client.post(
        TRANSFERS_URL,
        json={
            "from_account_id": acct_id,
            "amount": "250.50",
            "currency": "EUR",
            "date": "2025-02-01",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["from_account_id"] == acct_id
    assert data["to_account_id"] is None


def test_create_transfer_between_accounts(client: TestClient, auth_headers: dict):
    from_id = _create_account(client, auth_headers, "From Bank")
    to_id = _create_account(client, auth_headers, "To Broker")
    resp = client.post(
        TRANSFERS_URL,
        json={
            "from_account_id": from_id,
            "to_account_id": to_id,
            "amount": "500.00",
            "currency": "EUR",
            "fee": "2.50",
            "date": "2025-03-15",
            "note": "Monthly investment",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["from_account_id"] == from_id
    assert data["to_account_id"] == to_id
    assert float(data["fee"]) == pytest.approx(2.50)
    assert data["note"] == "Monthly investment"


def test_create_transfer_no_accounts_rejected(client: TestClient, auth_headers: dict):
    """Both from and to are None — must be rejected by model_validator."""
    resp = client.post(
        TRANSFERS_URL,
        json={
            "amount": "100.00",
            "currency": "EUR",
            "date": "2025-01-01",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_create_transfer_negative_amount_rejected(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Neg Bank")
    resp = client.post(
        TRANSFERS_URL,
        json={
            "to_account_id": acct_id,
            "amount": "-50.00",
            "currency": "EUR",
            "date": "2025-01-01",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_list_transfers_contains_created(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "List Bank")
    client.post(
        TRANSFERS_URL,
        json={"to_account_id": acct_id, "amount": "777.77", "currency": "EUR", "date": "2025-06-01"},
        headers=auth_headers,
    )
    resp = client.get(TRANSFERS_URL, headers=auth_headers)
    amounts = [float(t["amount"]) for t in resp.json()]
    assert any(abs(a - 777.77) < 0.01 for a in amounts)


def test_update_transfer(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Update Bank")
    create_resp = client.post(
        TRANSFERS_URL,
        json={"to_account_id": acct_id, "amount": "100.00", "currency": "EUR", "date": "2025-01-01"},
        headers=auth_headers,
    )
    tid = create_resp.json()["id"]

    patch_resp = client.patch(
        f"{TRANSFERS_URL}/{tid}",
        json={"amount": "200.00", "note": "Updated"},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    assert float(patch_resp.json()["amount"]) == pytest.approx(200.0)
    assert patch_resp.json()["note"] == "Updated"


def test_delete_transfer(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "Del Bank")
    create_resp = client.post(
        TRANSFERS_URL,
        json={"to_account_id": acct_id, "amount": "50.00", "currency": "EUR", "date": "2025-01-01"},
        headers=auth_headers,
    )
    tid = create_resp.json()["id"]

    del_resp = client.delete(f"{TRANSFERS_URL}/{tid}", headers=auth_headers)
    assert del_resp.status_code == 204

    get_resp = client.get(f"{TRANSFERS_URL}/{tid}", headers=auth_headers)
    assert get_resp.status_code == 404


def test_export_transfers_csv(client: TestClient, auth_headers: dict):
    acct_id = _create_account(client, auth_headers, "CSV Bank")
    client.post(
        TRANSFERS_URL,
        json={"to_account_id": acct_id, "amount": "999.00", "currency": "EUR", "date": "2025-07-04"},
        headers=auth_headers,
    )
    resp = client.get(f"{TRANSFERS_URL}/export", headers=auth_headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    text = resp.text
    # Must have header row
    assert "amount" in text
    assert "currency" in text
    # Must contain the amount we just created
    assert "999" in text


def test_transfers_require_auth(client: TestClient):
    resp = client.get(TRANSFERS_URL)
    assert resp.status_code == 401
