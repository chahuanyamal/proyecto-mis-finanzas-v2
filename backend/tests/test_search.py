from __future__ import annotations

from httpx import AsyncClient


class TestSearch:
    async def _create_account(self, client: AsyncClient, name: str = "Cuenta Principal") -> str:
        resp = await client.post("/api/v1/accounts", json={
            "name": name,
            "account_type": "checking",
            "currency": "CLP",
            "balance": "0",
        })
        assert resp.status_code == 201
        return resp.json()["id"]

    async def test_search_transactions_and_accounts(self, auth_client: AsyncClient) -> None:
        account_id = await self._create_account(auth_client, "Banco Buscable")
        await auth_client.post("/api/v1/transactions", json={
            "account_id": account_id,
            "date": "2026-05-01",
            "description": "Supermercado Central",
            "amount": "25000",
            "currency": "CLP",
            "movement_type": "expense",
        })

        resp = await auth_client.get("/api/v1/search", params={"q": "Supermercado"})
        assert resp.status_code == 200
        hits = resp.json()["hits"]
        assert any(hit["entity"] == "transaction" and "Supermercado" in hit["title"] for hit in hits)

        account_resp = await auth_client.get("/api/v1/search", params={"q": "Buscable"})
        assert account_resp.status_code == 200
        assert any(hit["entity"] == "account" and hit["title"] == "Banco Buscable" for hit in account_resp.json()["hits"])

    async def test_search_isolated_by_user(self, auth_client: AsyncClient, other_auth_client: AsyncClient) -> None:
        other_account = await self._create_account(other_auth_client, "Cuenta Ajena")
        await other_auth_client.post("/api/v1/transactions", json={
            "account_id": other_account,
            "date": "2026-05-01",
            "description": "Movimiento Secreto",
            "amount": "100",
            "currency": "CLP",
            "movement_type": "expense",
        })

        resp = await auth_client.get("/api/v1/search", params={"q": "Secreto"})
        assert resp.status_code == 200
        assert resp.json()["hits"] == []

    async def test_search_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/search", params={"q": "algo"})
        assert resp.status_code == 401
