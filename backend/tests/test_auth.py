"""Tests for /api/v1/auth endpoints: register, login, refresh."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"


def test_register_new_user(client: TestClient):
    resp = client.post(
        REGISTER_URL,
        json={
            "email": "newuser@example.com",
            "password": "CorrectHorseBattery9!",
            "base_currency": "USD",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "newuser@example.com"
    assert data["base_currency"] == "USD"
    assert "id" in data
    # password_hash must never be exposed
    assert "password_hash" not in data
    assert "password" not in data


def test_register_duplicate_email(client: TestClient):
    payload = {"email": "dup@example.com", "password": "Pass1234!", "base_currency": "EUR"}
    resp1 = client.post(REGISTER_URL, json=payload)
    assert resp1.status_code == 201
    resp2 = client.post(REGISTER_URL, json=payload)
    assert resp2.status_code in (400, 409, 422)


def test_login_valid_credentials(client: TestClient):
    # Register first
    client.post(
        REGISTER_URL,
        json={"email": "logintest@example.com", "password": "Valid1234!", "base_currency": "GBP"},
    )
    resp = client.post(
        LOGIN_URL,
        data={"username": "logintest@example.com", "password": "Valid1234!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client: TestClient):
    client.post(
        REGISTER_URL,
        json={"email": "wrongpass@example.com", "password": "RealPass1!", "base_currency": "EUR"},
    )
    resp = client.post(
        LOGIN_URL,
        data={"username": "wrongpass@example.com", "password": "WrongPass!"},
    )
    assert resp.status_code in (400, 401, 403)


def test_login_unknown_user(client: TestClient):
    resp = client.post(
        LOGIN_URL,
        data={"username": "nobody@example.com", "password": "Anything1!"},
    )
    assert resp.status_code in (400, 401, 403)


def test_refresh_token(client: TestClient):
    client.post(
        REGISTER_URL,
        json={"email": "refresh@example.com", "password": "Refresh1234!", "base_currency": "EUR"},
    )
    login_resp = client.post(
        LOGIN_URL,
        data={"username": "refresh@example.com", "password": "Refresh1234!"},
    )
    refresh_token = login_resp.json()["refresh_token"]

    resp = client.post(REFRESH_URL, json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_refresh_with_access_token_rejected(client: TestClient):
    """Sending the access token to the refresh endpoint must fail."""
    client.post(
        REGISTER_URL,
        json={"email": "badrefresh@example.com", "password": "BadRef1234!", "base_currency": "EUR"},
    )
    login_resp = client.post(
        LOGIN_URL,
        data={"username": "badrefresh@example.com", "password": "BadRef1234!"},
    )
    access_token = login_resp.json()["access_token"]

    resp = client.post(REFRESH_URL, json={"refresh_token": access_token})
    assert resp.status_code in (400, 401, 422)


def test_protected_endpoint_without_token(client: TestClient):
    resp = client.get("/api/v1/accounts")
    assert resp.status_code == 401
