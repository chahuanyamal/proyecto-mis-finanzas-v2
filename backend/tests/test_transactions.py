from __future__ import annotations

import pytest
from httpx import AsyncClient


class TestTransactions:
    async def _create_account(self, auth_client: AsyncClient) -> str:
        resp = await auth_client.post("/api/v1/accounts", json={
            "name": "Test Account", "account_type": "checking", "currency": "CLP", "balance": "0"})
        assert resp.status_code == 201
        return resp.json()["id"]

    async def _create_category(self, auth_client: AsyncClient) -> str | None:
        resp = await auth_client.post("/api/v1/categories", json={"name": "Comida"})
        return resp.json()["id"] if resp.status_code == 201 else None

    async def test_list_transactions_empty(self, auth_client: AsyncClient) -> None:
        resp = await auth_client.get("/api/v1/transactions")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_transaction(self, auth_client: AsyncClient) -> None:
        acc_id = await self._create_account(auth_client)
        resp = await auth_client.post("/api/v1/transactions", json={
            "account_id": acc_id,
            "date": "2026-05-01",
            "description": "Supermercado",
            "amount": "25000",
            "currency": "CLP",
            "movement_type": "expense",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["description"] == "Supermercado"
        assert data["amount"] == "25000"
        assert data["movement_type"] == "expense"

    async def test_create_transaction_with_category(self, auth_client: AsyncClient) -> None:
        acc_id = await self._create_account(auth_client)
        cat_id = await self._create_category(auth_client)
        resp = await auth_client.post("/api/v1/transactions", json={
            "account_id": acc_id,
            "category_id": cat_id,
            "date": "2026-05-01",
            "description": "Compra",
            "amount": "5000",
            "currency": "CLP",
            "movement_type": "expense",
        })
        assert resp.status_code == 201
        assert resp.json()["category"] is not None

    async def test_create_income_transaction(self, auth_client: AsyncClient) -> None:
        acc_id = await self._create_account(auth_client)
        resp = await auth_client.post("/api/v1/transactions", json={
            "account_id": acc_id,
            "date": "2026-05-01",
            "description": "Sueldo",
            "amount": "1500000",
            "currency": "CLP",
            "movement_type": "income",
        })
        assert resp.status_code == 201
        assert resp.json()["movement_type"] == "income"

    async def test_get_transaction_404(self, auth_client: AsyncClient) -> None:
        import uuid
        resp = await auth_client.get(f"/api/v1/transactions/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_update_transaction(self, auth_client: AsyncClient) -> None:
        acc_id = await self._create_account(auth_client)
        create_resp = await auth_client.post("/api/v1/transactions", json={
            "account_id": acc_id,
            "date": "2026-05-01",
            "description": "Original",
            "amount": "1000",
            "currency": "CLP",
            "movement_type": "expense",
        })
        tx_id = create_resp.json()["id"]
        resp = await auth_client.patch(f"/api/v1/transactions/{tx_id}", json={"description": "Modificado"})
        assert resp.status_code == 200
        assert resp.json()["description"] == "Modificado"

    async def test_delete_transaction(self, auth_client: AsyncClient) -> None:
        acc_id = await self._create_account(auth_client)
        create_resp = await auth_client.post("/api/v1/transactions", json={
            "account_id": acc_id,
            "date": "2026-05-01",
            "description": "ToDelete",
            "amount": "1",
            "currency": "CLP",
            "movement_type": "expense",
        })
        tx_id = create_resp.json()["id"]
        del_resp = await auth_client.delete(f"/api/v1/transactions/{tx_id}")
        assert del_resp.status_code == 204
        get_resp = await auth_client.get(f"/api/v1/transactions/{tx_id}")
        assert get_resp.status_code == 404

    async def test_transactions_isolated_by_user(self, auth_client: AsyncClient, other_auth_client: AsyncClient) -> None:
        acc1 = await self._create_account(auth_client)
        acc2 = (await other_auth_client.post("/api/v1/accounts", json={
            "name": "Other", "account_type": "checking", "currency": "CLP", "balance": "0"})).json()["id"]
        await auth_client.post("/api/v1/transactions", json={
            "account_id": acc1, "date": "2026-05-01", "description": "Mia", "amount": "100", "currency": "CLP", "movement_type": "expense"})
        await other_auth_client.post("/api/v1/transactions", json={
            "account_id": acc2, "date": "2026-05-01", "description": "Ajena", "amount": "200", "currency": "CLP", "movement_type": "expense"})
        resp = await auth_client.get("/api/v1/transactions")
        descriptions = [t["description"] for t in resp.json()]
        assert "Mia" in descriptions
        assert "Ajena" not in descriptions

    async def test_filter_by_account(self, auth_client: AsyncClient) -> None:
        acc1 = await self._create_account(auth_client)
        resp = await auth_client.post("/api/v1/accounts", json={
            "name": "Second", "account_type": "savings", "currency": "CLP", "balance": "0"})
        acc2 = resp.json()["id"]
        await auth_client.post("/api/v1/transactions", json={
            "account_id": acc1, "date": "2026-05-01", "description": "Acc1", "amount": "100", "currency": "CLP", "movement_type": "expense"})
        await auth_client.post("/api/v1/transactions", json={
            "account_id": acc2, "date": "2026-05-02", "description": "Acc2", "amount": "200", "currency": "CLP", "movement_type": "expense"})
        filtered = await auth_client.get(f"/api/v1/transactions?account_id={acc1}")
        assert len(filtered.json()) == 1

    async def test_filter_by_date_range(self, auth_client: AsyncClient) -> None:
        acc_id = await self._create_account(auth_client)
        await auth_client.post("/api/v1/transactions", json={
            "account_id": acc_id, "date": "2026-01-01", "description": "Old", "amount": "100", "currency": "CLP", "movement_type": "expense"})
        await auth_client.post("/api/v1/transactions", json={
            "account_id": acc_id, "date": "2026-06-01", "description": "New", "amount": "200", "currency": "CLP", "movement_type": "expense"})
        filtered = await auth_client.get("/api/v1/transactions?start_date=2026-03-01&end_date=2026-12-31")
        assert len(filtered.json()) == 1
        assert filtered.json()[0]["description"] == "New"

    async def test_export_excel(self, auth_client: AsyncClient) -> None:
        acc_id = await self._create_account(auth_client)
        await auth_client.post("/api/v1/transactions", json={
            "account_id": acc_id, "date": "2026-05-01", "description": "X", "amount": "100", "currency": "CLP", "movement_type": "expense"})
        resp = await auth_client.get("/api/v1/transactions/export/excel")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    async def test_auto_categorize(self, auth_client: AsyncClient) -> None:
        acc_id = await self._create_account(auth_client)
        cat_resp = await auth_client.post("/api/v1/categories", json={"name": "Super"})
        cat_id = cat_resp.json()["id"]
        await auth_client.post("/api/v1/category-rules", json={
            "target_category_id": cat_id,
            "field": "description",
            "operator": "contains",
            "pattern": "super",
            "priority": 10,
        })
        await auth_client.post("/api/v1/transactions", json={
            "account_id": acc_id, "date": "2026-05-01", "description": "Supermercado XYZ", "amount": "5000", "currency": "CLP", "movement_type": "expense"})
        result = await auth_client.post("/api/v1/transactions/auto-categorize")
        assert result.status_code == 200
        assert result.json()["updated"] >= 1

    async def test_transaction_without_auth_returns_401(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/transactions")
        assert resp.status_code == 401
