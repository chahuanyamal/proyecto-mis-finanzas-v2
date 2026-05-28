from __future__ import annotations

import pytest
from httpx import AsyncClient


class TestBudgets:
    async def _create_category(self, auth_client: AsyncClient) -> str:
        resp = await auth_client.post("/api/v1/categories", json={"name": "Alimentos"})
        assert resp.status_code == 201
        return resp.json()["id"]

    async def test_list_budgets_empty(self, auth_client: AsyncClient) -> None:
        resp = await auth_client.get("/api/v1/budgets")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_budget(self, auth_client: AsyncClient) -> None:
        cat_id = await self._create_category(auth_client)
        resp = await auth_client.post("/api/v1/budgets", json={
            "category_id": cat_id,
            "month": "2026-05",
            "amount": "300000",
            "alert_at_percent": 80,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["month"] == "2026-05"
        assert data["amount"] == "300000"
        assert data["alert_at_percent"] == 80
        assert data["category"] is not None

    async def test_create_duplicate_budget_returns_409(self, auth_client: AsyncClient) -> None:
        cat_id = await self._create_category(auth_client)
        await auth_client.post("/api/v1/budgets", json={
            "category_id": cat_id, "month": "2026-05", "amount": "100000"})
        resp = await auth_client.post("/api/v1/budgets", json={
            "category_id": cat_id, "month": "2026-05", "amount": "200000"})
        assert resp.status_code == 409

    async def test_filter_by_month(self, auth_client: AsyncClient) -> None:
        cat_id = await self._create_category(auth_client)
        await auth_client.post("/api/v1/budgets", json={
            "category_id": cat_id, "month": "2026-01", "amount": "100000"})
        await auth_client.post("/api/v1/budgets", json={
            "category_id": cat_id, "month": "2026-02", "amount": "200000"})
        resp = await auth_client.get("/api/v1/budgets?month=2026-01")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["month"] == "2026-01"

    async def test_update_budget(self, auth_client: AsyncClient) -> None:
        cat_id = await self._create_category(auth_client)
        create_resp = await auth_client.post("/api/v1/budgets", json={
            "category_id": cat_id, "month": "2026-05", "amount": "100000"})
        budget_id = create_resp.json()["id"]
        resp = await auth_client.patch(f"/api/v1/budgets/{budget_id}", json={"amount": "500000"})
        assert resp.status_code == 200
        assert resp.json()["amount"] == "500000"

    async def test_delete_budget(self, auth_client: AsyncClient) -> None:
        cat_id = await self._create_category(auth_client)
        create_resp = await auth_client.post("/api/v1/budgets", json={
            "category_id": cat_id, "month": "2026-05", "amount": "100000"})
        budget_id = create_resp.json()["id"]
        del_resp = await auth_client.delete(f"/api/v1/budgets/{budget_id}")
        assert del_resp.status_code == 204

    async def test_budgets_isolated_by_user(self, auth_client: AsyncClient, other_auth_client: AsyncClient) -> None:
        cat1 = (await auth_client.post("/api/v1/categories", json={"name": "Cat1"})).json()["id"]
        cat2 = (await other_auth_client.post("/api/v1/categories", json={"name": "Cat2"})).json()["id"]
        await auth_client.post("/api/v1/budgets", json={
            "category_id": cat1, "month": "2026-05", "amount": "100000"})
        await other_auth_client.post("/api/v1/budgets", json={
            "category_id": cat2, "month": "2026-05", "amount": "200000"})
        resp = await auth_client.get("/api/v1/budgets")
        assert len(resp.json()) == 1

    async def test_get_404_for_other_users_budget(self, auth_client: AsyncClient, other_auth_client: AsyncClient) -> None:
        cat = (await other_auth_client.post("/api/v1/categories", json={"name": "CatX"})).json()["id"]
        create_resp = await other_auth_client.post("/api/v1/budgets", json={
            "category_id": cat, "month": "2026-05", "amount": "100000"})
        budget_id = create_resp.json()["id"]
        resp = await auth_client.get(f"/api/v1/budgets/{budget_id}")
        assert resp.status_code == 404

    async def test_invalid_month_format_rejected(self, auth_client: AsyncClient) -> None:
        cat_id = await self._create_category(auth_client)
        resp = await auth_client.post("/api/v1/budgets", json={
            "category_id": cat_id, "month": "bad", "amount": "100000"})
        assert resp.status_code == 422

    async def test_without_auth_returns_401(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/budgets")
        assert resp.status_code == 401
