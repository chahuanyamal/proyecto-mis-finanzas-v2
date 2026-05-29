from __future__ import annotations

from httpx import AsyncClient


class TestReports:
    async def _create_account(self, client: AsyncClient) -> str:
        resp = await client.post("/api/v1/accounts", json={
            "name": "Cuenta reportes",
            "account_type": "checking",
            "currency": "CLP",
            "balance": "0",
        })
        assert resp.status_code == 201
        return resp.json()["id"]

    async def test_annual_report_and_csv(self, auth_client: AsyncClient) -> None:
        account_id = await self._create_account(auth_client)
        await auth_client.post("/api/v1/transactions", json={
            "account_id": account_id,
            "date": "2026-05-01",
            "description": "Sueldo",
            "amount": "1000000",
            "currency": "CLP",
            "movement_type": "income",
        })
        await auth_client.post("/api/v1/transactions", json={
            "account_id": account_id,
            "date": "2026-05-02",
            "description": "Gasto",
            "amount": "200000",
            "currency": "CLP",
            "movement_type": "expense",
        })

        report = await auth_client.get("/api/v1/reports/annual/2026")
        assert report.status_code == 200
        data = report.json()
        assert data["year"] == 2026
        assert data["transaction_count"] >= 2
        clp = next(item for item in data["totals"] if item["currency"] == "CLP")
        assert clp["income"] == "1000000.00"
        assert clp["expenses"] == "200000.00"

        csv_resp = await auth_client.get("/api/v1/reports/annual/2026/csv")
        assert csv_resp.status_code == 200
        assert csv_resp.headers["content-type"].startswith("text/csv")
        assert "section,period_or_category,currency,income,expenses,net,count" in csv_resp.text

    async def test_reports_require_auth(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/reports/annual/2026")
        assert resp.status_code == 401
