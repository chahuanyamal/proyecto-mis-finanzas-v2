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


class TestTokenRevocation:
    async def test_access_token_invalid_after_logout(self, client: AsyncClient, test_user) -> None:
        login = await client.post("/api/v1/auth/login", json={"username": test_user.email, "password": "test123"})
        access = login.cookies["access_token"]
        client.cookies.update(login.cookies)
        await client.post("/api/v1/auth/logout")

        # Reutilizar el access token revocado (no solo la cookie borrada) → 401.
        client.cookies.clear()
        client.cookies.set("access_token", access)
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    async def test_old_refresh_token_rejected_after_rotation(self, client: AsyncClient, test_user) -> None:
        login = await client.post("/api/v1/auth/login", json={"username": test_user.email, "password": "test123"})
        old_refresh = login.cookies["refresh_token"]
        client.cookies.update(login.cookies)

        first = await client.post("/api/v1/auth/refresh")
        assert first.status_code == 200

        # El refresh token original quedó revocado por la rotación.
        client.cookies.clear()
        client.cookies.set("refresh_token", old_refresh)
        second = await client.post("/api/v1/auth/refresh")
        assert second.status_code == 401
