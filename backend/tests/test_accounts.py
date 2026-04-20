"""Tests for /api/v1/accounts CRUD endpoints."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


ACCOUNTS_URL = "/api/v1/accounts"


def test_list_accounts_empty(client: TestClient, auth_headers: dict):
    resp = client.get(ACCOUNTS_URL, headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_account(client: TestClient, auth_headers: dict):
    resp = client.post(
        ACCOUNTS_URL,
        json={"name": "My Broker", "type": "broker"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Broker"
    assert data["type"] == "broker"
    assert "id" in data


def test_create_account_invalid_type(client: TestClient, auth_headers: dict):
    resp = client.post(
        ACCOUNTS_URL,
        json={"name": "Bad Account", "type": "invalid_type"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_list_accounts_returns_created(client: TestClient, auth_headers: dict):
    client.post(
        ACCOUNTS_URL,
        json={"name": "Cash Account", "type": "bank"},
        headers=auth_headers,
    )
    resp = client.get(ACCOUNTS_URL, headers=auth_headers)
    assert resp.status_code == 200
    names = [a["name"] for a in resp.json()]
    assert "Cash Account" in names


def test_update_account(client: TestClient, auth_headers: dict):
    create_resp = client.post(
        ACCOUNTS_URL,
        json={"name": "Old Name", "type": "wallet"},
        headers=auth_headers,
    )
    account_id = create_resp.json()["id"]

    patch_resp = client.patch(
        f"{ACCOUNTS_URL}/{account_id}",
        json={"name": "New Name", "type": "exchange"},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()
    assert updated["name"] == "New Name"
    assert updated["type"] == "exchange"


def test_update_nonexistent_account(client: TestClient, auth_headers: dict):
    resp = client.patch(
        f"{ACCOUNTS_URL}/999999",
        json={"name": "Ghost"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_delete_account(client: TestClient, auth_headers: dict):
    create_resp = client.post(
        ACCOUNTS_URL,
        json={"name": "To Delete", "type": "other"},
        headers=auth_headers,
    )
    account_id = create_resp.json()["id"]

    del_resp = client.delete(f"{ACCOUNTS_URL}/{account_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    # Should no longer appear in list
    list_resp = client.get(ACCOUNTS_URL, headers=auth_headers)
    ids = [a["id"] for a in list_resp.json()]
    assert account_id not in ids


def test_delete_nonexistent_account(client: TestClient, auth_headers: dict):
    resp = client.delete(f"{ACCOUNTS_URL}/999999", headers=auth_headers)
    assert resp.status_code == 404


def test_accounts_require_auth(client: TestClient):
    resp = client.get(ACCOUNTS_URL)
    assert resp.status_code == 401
