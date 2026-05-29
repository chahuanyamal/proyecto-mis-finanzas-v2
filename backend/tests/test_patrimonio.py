from __future__ import annotations

from httpx import AsyncClient


class TestPatrimonio:
    async def _create_account(self, client: AsyncClient, name: str, balance: str = "100000") -> str:
        resp = await client.post("/api/v1/accounts", json={
            "name": name,
            "account_type": "checking",
            "currency": "CLP",
            "balance": balance,
        })
        assert resp.status_code == 201
        return resp.json()["id"]

    async def test_history_and_compare(self, auth_client: AsyncClient) -> None:
        account_id = await self._create_account(auth_client, "Patrimonio", "100000")
        await auth_client.post("/api/v1/transactions", json={
            "account_id": account_id,
            "date": "2026-05-01",
            "description": "Ingreso",
            "amount": "10000",
            "currency": "CLP",
            "movement_type": "income",
        })

        history = await auth_client.get("/api/v1/patrimonio/history", params={"months": 3, "currency": "CLP"})
        assert history.status_code == 200
        assert history.json()["months"] == 3
        assert isinstance(history.json()["history"], list)

        trend = await auth_client.get("/api/v1/patrimonio/account-trend", params={"months": 3, "currency": "CLP"})
        assert trend.status_code == 200
        assert trend.json()["accounts"][0]["name"] == "Patrimonio"

        compare = await auth_client.get("/api/v1/patrimonio/compare", params={"months_ago": 1, "currency": "CLP"})
        assert compare.status_code == 200
        assert "totals" in compare.json()

    async def test_patrimonio_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/patrimonio/history")
        assert resp.status_code == 401
