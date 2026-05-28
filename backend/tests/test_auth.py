from __future__ import annotations

import pytest
from httpx import AsyncClient


class TestAuthLogin:
    async def test_login_success_sets_cookies(self, client: AsyncClient, test_user) -> None:
        resp = await client.post("/api/v1/auth/login", json={"username": test_user.email, "password": "test123"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["email"] == test_user.email
        assert data["user"]["full_name"] == "Test User"
        assert "access_token" in resp.cookies
        assert "refresh_token" in resp.cookies

    async def test_login_wrong_password_returns_401(self, client: AsyncClient, test_user) -> None:
        resp = await client.post("/api/v1/auth/login", json={"username": test_user.email, "password": "wrong"})
        assert resp.status_code == 401

    async def test_login_nonexistent_user_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post("/api/v1/auth/login", json={"username": "nobody@nowhere.com", "password": "x"})
        assert resp.status_code == 401


class TestAuthMe:
    async def test_me_returns_user(self, auth_client: AsyncClient, test_user) -> None:
        resp = await auth_client.get("/api/v1/auth/me")
        assert resp.status_code == 200
        assert resp.json()["email"] == test_user.email

    async def test_me_without_auth_returns_401(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401


class TestAuthRefresh:
    async def test_refresh_with_valid_cookie(self, client: AsyncClient, test_user) -> None:
        login_resp = await client.post("/api/v1/auth/login", json={"username": test_user.email, "password": "test123"})
        client.cookies.update(login_resp.cookies)
        refresh_resp = await client.post("/api/v1/auth/refresh")
        assert refresh_resp.status_code == 200
        assert refresh_resp.json() == {"ok": True}

    async def test_refresh_without_cookie_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post("/api/v1/auth/refresh")
        assert resp.status_code == 401


class TestAuthLogout:
    async def test_logout_clears_cookies(self, auth_client: AsyncClient) -> None:
        resp = await auth_client.post("/api/v1/auth/logout")
        assert resp.status_code == 200
        me_resp = await auth_client.get("/api/v1/auth/me")
        assert me_resp.status_code == 401
