from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestCategories:
    async def test_list_includes_system_categories(self, auth_client: AsyncClient):
        resp = await auth_client.get("/api/v1/categories")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0
        # Las categorías sembradas son del sistema (user_id None).
        assert all(c["user_id"] is None for c in data)

    async def test_create_category_sets_owner(self, auth_client: AsyncClient):
        resp = await auth_client.post("/api/v1/categories", json={"name": "Mi categoría"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["user_id"] is not None
        assert body["name"] == "Mi categoría"

    async def test_cannot_update_system_category(self, auth_client: AsyncClient):
        listed = (await auth_client.get("/api/v1/categories")).json()
        system_id = listed[0]["id"]
        resp = await auth_client.patch(f"/api/v1/categories/{system_id}", json={"name": "Hackeada"})
        assert resp.status_code == 404

    async def test_cannot_delete_system_category(self, auth_client: AsyncClient):
        listed = (await auth_client.get("/api/v1/categories")).json()
        system_id = listed[0]["id"]
        resp = await auth_client.delete(f"/api/v1/categories/{system_id}")
        assert resp.status_code == 404

    async def test_categories_isolated_between_users(
        self, auth_client: AsyncClient, other_auth_client: AsyncClient
    ):
        created = (await auth_client.post("/api/v1/categories", json={"name": "Privada"})).json()
        cat_id = created["id"]

        # El otro usuario no la ve en su listado...
        other_list = (await other_auth_client.get("/api/v1/categories")).json()
        assert cat_id not in {c["id"] for c in other_list}

        # ...ni puede editarla o borrarla.
        assert (await other_auth_client.patch(f"/api/v1/categories/{cat_id}", json={"name": "X"})).status_code == 404
        assert (await other_auth_client.delete(f"/api/v1/categories/{cat_id}")).status_code == 404

    async def test_cannot_reference_other_users_category_in_budget(
        self, auth_client: AsyncClient, other_auth_client: AsyncClient
    ):
        created = (await auth_client.post("/api/v1/categories", json={"name": "Solo mía"})).json()
        resp = await other_auth_client.post(
            "/api/v1/budgets",
            json={"category_id": created["id"], "month": "2026-05", "amount": "100", "alert_at_percent": 80},
        )
        assert resp.status_code == 404
