"""Tests for /api/v1/asset-types and /api/v1/assets CRUD endpoints."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


ASSET_TYPES_URL = "/api/v1/asset-types"
ASSETS_URL = "/api/v1/assets"


# ---------------------------------------------------------------------------
# Asset Types
# ---------------------------------------------------------------------------

def test_list_asset_types_empty(client: TestClient, auth_headers: dict):
    resp = client.get(ASSET_TYPES_URL, headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_asset_type(client: TestClient, auth_headers: dict):
    resp = client.post(
        ASSET_TYPES_URL,
        json={"name": "Crypto"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Crypto"
    assert "id" in data


def test_update_asset_type(client: TestClient, auth_headers: dict):
    create_resp = client.post(
        ASSET_TYPES_URL,
        json={"name": "Stocks"},
        headers=auth_headers,
    )
    at_id = create_resp.json()["id"]

    patch_resp = client.patch(
        f"{ASSET_TYPES_URL}/{at_id}",
        json={"name": "Equities"},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["name"] == "Equities"


def test_delete_asset_type(client: TestClient, auth_headers: dict):
    create_resp = client.post(
        ASSET_TYPES_URL,
        json={"name": "To Delete Type"},
        headers=auth_headers,
    )
    at_id = create_resp.json()["id"]

    del_resp = client.delete(f"{ASSET_TYPES_URL}/{at_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    list_resp = client.get(ASSET_TYPES_URL, headers=auth_headers)
    ids = [t["id"] for t in list_resp.json()]
    assert at_id not in ids


def test_asset_types_require_auth(client: TestClient):
    resp = client.get(ASSET_TYPES_URL)
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------

def _make_asset_type(client: TestClient, headers: dict) -> int:
    resp = client.post(ASSET_TYPES_URL, json={"name": "Test Type"}, headers=headers)
    return resp.json()["id"]


def test_list_assets_empty(client: TestClient, auth_headers: dict):
    resp = client.get(ASSETS_URL, headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_asset_minimal(client: TestClient, auth_headers: dict):
    resp = client.post(
        ASSETS_URL,
        json={"symbol": "BTC", "name": "Bitcoin", "price_source": "binance"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["symbol"] == "BTC"
    assert data["name"] == "Bitcoin"
    assert data["price_source"] == "binance"
    assert "id" in data


def test_create_asset_with_type(client: TestClient, auth_headers: dict):
    at_id = _make_asset_type(client, auth_headers)
    resp = client.post(
        ASSETS_URL,
        json={
            "symbol": "ETH",
            "name": "Ethereum",
            "asset_type_id": at_id,
            "price_source": "binance",
            "external_id": "ETH",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["asset_type_id"] == at_id
    assert data["external_id"] == "ETH"


def test_create_asset_invalid_price_source(client: TestClient, auth_headers: dict):
    resp = client.post(
        ASSETS_URL,
        json={"symbol": "XYZ", "name": "Unknown", "price_source": "invalid_source"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_get_asset_by_id(client: TestClient, auth_headers: dict):
    create_resp = client.post(
        ASSETS_URL,
        json={"symbol": "ADA", "name": "Cardano", "price_source": "none"},
        headers=auth_headers,
    )
    asset_id = create_resp.json()["id"]

    get_resp = client.get(f"{ASSETS_URL}/{asset_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["symbol"] == "ADA"


def test_update_asset(client: TestClient, auth_headers: dict):
    create_resp = client.post(
        ASSETS_URL,
        json={"symbol": "SOL", "name": "Solana", "price_source": "none"},
        headers=auth_headers,
    )
    asset_id = create_resp.json()["id"]

    patch_resp = client.patch(
        f"{ASSETS_URL}/{asset_id}",
        json={"name": "Solana (updated)", "price_source": "binance", "external_id": "SOL"},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["name"] == "Solana (updated)"
    assert data["external_id"] == "SOL"


def test_delete_asset(client: TestClient, auth_headers: dict):
    create_resp = client.post(
        ASSETS_URL,
        json={"symbol": "DOGE", "name": "Dogecoin", "price_source": "none"},
        headers=auth_headers,
    )
    asset_id = create_resp.json()["id"]

    del_resp = client.delete(f"{ASSETS_URL}/{asset_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    get_resp = client.get(f"{ASSETS_URL}/{asset_id}", headers=auth_headers)
    assert get_resp.status_code == 404


def test_get_nonexistent_asset(client: TestClient, auth_headers: dict):
    resp = client.get(f"{ASSETS_URL}/999999", headers=auth_headers)
    assert resp.status_code == 404


def test_assets_require_auth(client: TestClient):
    resp = client.get(ASSETS_URL)
    assert resp.status_code == 401
