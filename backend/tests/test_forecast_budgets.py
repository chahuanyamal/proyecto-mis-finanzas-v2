from __future__ import annotations

import datetime
from httpx import AsyncClient


class TestForecast:
    async def _acct(self, c, bal="100000"):
        r = await c.post("/api/v1/accounts", json={
            "name": "Cuenta", "account_type": "checking", "currency": "CLP", "balance": bal})
        return r.json()["id"]

    async def test_forecast_basic(self, auth_client: AsyncClient) -> None:
        await self._acct(auth_client, "200000")
        r = await auth_client.get("/api/v1/dashboard/forecast", params={"days": 60})
        assert r.status_code == 200
        body = r.json()
        assert body["currency"] == "CLP"
        assert float(body["start_balance"]) == 200000
        assert len(body["points"]) >= 2
        assert "lowest_balance" in body and "end_balance" in body

    async def test_forecast_requires_auth(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/dashboard/forecast")).status_code == 401


class TestBudgetSuggestions:
    async def _acct(self, c):
        r = await c.post("/api/v1/accounts", json={
            "name": "C", "account_type": "checking", "currency": "CLP", "balance": "0"})
        return r.json()["id"]

    async def _cat(self, c, name):
        r = await c.post("/api/v1/categories", json={"name": name})
        return r.json()["id"]

    async def test_suggests_from_history(self, auth_client: AsyncClient) -> None:
        acc = await self._acct(auth_client)
        cat = await self._cat(auth_client, "Supermercado")
        today = datetime.date.today()
        # gasto en los 2 meses previos
        for delta in (35, 65):
            d = today.replace(day=1) - datetime.timedelta(days=delta)
            r = await auth_client.post("/api/v1/transactions", json={
                "account_id": acc, "date": d.isoformat(), "description": "Jumbo",
                "amount": "120000", "currency": "CLP", "movement_type": "expense", "category_id": cat})
            assert r.status_code == 201
        r = await auth_client.get("/api/v1/budgets/suggestions", params={"lookback": 3})
        assert r.status_code == 200
        sugg = r.json()
        assert any(s["category_id"] == cat and float(s["suggested_amount"]) > 0 for s in sugg)

    async def test_excludes_already_budgeted(self, auth_client: AsyncClient) -> None:
        acc = await self._acct(auth_client)
        cat = await self._cat(auth_client, "Transporte")
        today = datetime.date.today()
        d = today.replace(day=1) - datetime.timedelta(days=35)
        await auth_client.post("/api/v1/transactions", json={
            "account_id": acc, "date": d.isoformat(), "description": "Metro",
            "amount": "40000", "currency": "CLP", "movement_type": "expense", "category_id": cat})
        month = today.strftime("%Y-%m")
        await auth_client.post("/api/v1/budgets", json={
            "category_id": cat, "month": month, "amount": "50000", "alert_at_percent": 80})
        r = await auth_client.get("/api/v1/budgets/suggestions", params={"month": month})
        assert all(s["category_id"] != cat for s in r.json())


class TestMonthlyInsights:
    async def test_insights_basic(self, auth_client):
        r = await auth_client.get("/api/v1/dashboard/insights")
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)

    async def test_insights_requires_auth(self, client):
        assert (await client.get("/api/v1/dashboard/insights")).status_code == 401
