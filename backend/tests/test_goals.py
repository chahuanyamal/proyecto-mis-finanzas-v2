from __future__ import annotations

from httpx import AsyncClient


class TestGoals:
    async def _create_goal(self, auth_client: AsyncClient) -> str:
        resp = await auth_client.post("/api/v1/goals", json={
            "name": "Viaje",
            "target_amount": "1000000",
            "current_amount": "100000",
            "currency": "CLP",
        })
        assert resp.status_code == 201
        return resp.json()["id"]

    async def test_deposit_and_contributions(self, auth_client: AsyncClient) -> None:
        goal_id = await self._create_goal(auth_client)
        deposit = await auth_client.post(f"/api/v1/goals/{goal_id}/deposit", json={
            "amount": "50000",
            "date": "2026-05-01",
            "note": "Aporte mayo",
        })
        assert deposit.status_code == 200
        assert deposit.json()["current_amount"] == "150000.00"

        contributions = await auth_client.get(f"/api/v1/goals/{goal_id}/contributions")
        assert contributions.status_code == 200
        data = contributions.json()
        assert len(data) == 1
        assert data[0]["amount"] == "50000.00"
        assert data[0]["note"] == "Aporte mayo"

    async def test_goal_deposit_requires_ownership(self, auth_client: AsyncClient, other_auth_client: AsyncClient) -> None:
        goal_id = await self._create_goal(auth_client)
        resp = await other_auth_client.post(f"/api/v1/goals/{goal_id}/deposit", json={"amount": "1"})
        assert resp.status_code == 404

    async def test_goal_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/goals")
        assert resp.status_code == 401
