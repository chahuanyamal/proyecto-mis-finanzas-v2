from __future__ import annotations

from httpx import AsyncClient


class TestRecurring:
    async def _create_account(self, client: AsyncClient) -> str:
        resp = await client.post("/api/v1/accounts", json={
            "name": "Cuenta recurrentes",
            "account_type": "checking",
            "currency": "CLP",
            "balance": "0",
        })
        assert resp.status_code == 201
        return resp.json()["id"]

    async def test_detect_recurring_from_transactions(self, auth_client: AsyncClient) -> None:
        account_id = await self._create_account(auth_client)
        for date in ["2026-01-05", "2026-02-05", "2026-03-05"]:
            resp = await auth_client.post("/api/v1/transactions", json={
                "account_id": account_id,
                "date": date,
                "description": "Netflix Pago Mensual",
                "amount": "9990",
                "currency": "CLP",
                "movement_type": "expense",
            })
            assert resp.status_code == 201

        detect = await auth_client.post("/api/v1/recurring/detect")
        assert detect.status_code == 200
        assert detect.json()["created"] >= 1
        assert detect.json()["items"][0]["frequency"] == "monthly"

        second = await auth_client.post("/api/v1/recurring/detect")
        assert second.status_code == 200
        assert second.json()["created"] == 0

    async def test_upcoming_recurring(self, auth_client: AsyncClient) -> None:
        resp = await auth_client.post("/api/v1/recurring", json={
            "name": "Arriendo",
            "amount": "350000",
            "currency": "CLP",
            "frequency": "monthly",
            "movement_type": "expense",
            "next_date": "2026-01-01",
            "active": True,
        })
        assert resp.status_code == 201

        upcoming = await auth_client.get("/api/v1/recurring/upcoming", params={"days": 365})
        assert upcoming.status_code == 200
        assert any(item["name"] == "Arriendo" for item in upcoming.json())

    async def test_recurring_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.post("/api/v1/recurring/detect")
        assert resp.status_code == 401
