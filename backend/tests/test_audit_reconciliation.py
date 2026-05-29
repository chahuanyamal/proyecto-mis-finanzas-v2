from __future__ import annotations

from httpx import AsyncClient


class TestAuditAndReconciliation:
    async def _create_account(self, client: AsyncClient, *, balance: str = "800") -> str:
        resp = await client.post("/api/v1/accounts", json={
            "name": "Cuenta control",
            "account_type": "checking",
            "currency": "CLP",
            "balance": balance,
        })
        assert resp.status_code == 201
        return resp.json()["id"]

    async def test_audit_records_transaction_create(self, auth_client: AsyncClient) -> None:
        account_id = await self._create_account(auth_client)
        create = await auth_client.post("/api/v1/transactions", json={
            "account_id": account_id,
            "date": "2026-05-01",
            "description": "Audit",
            "amount": "100",
            "currency": "CLP",
            "movement_type": "expense",
        })
        assert create.status_code == 201

        audit = await auth_client.get("/api/v1/audit")
        assert audit.status_code == 200
        assert any(item["entity_type"] == "transaction" and item["action"] == "create" for item in audit.json())

        filtered = await auth_client.get("/api/v1/audit", params={"entity_type": "transaction", "limit": 10})
        assert filtered.status_code == 200
        assert all(item["entity_type"] == "transaction" for item in filtered.json())

        export = await auth_client.get("/api/v1/audit/export.csv", params={"entity_type": "transaction"})
        assert export.status_code == 200
        assert export.headers["content-type"].startswith("text/csv")
        assert "created_at,action,entity_type,entity_id,metadata" in export.text

    async def test_reconciliation_summary(self, auth_client: AsyncClient) -> None:
        account_id = await self._create_account(auth_client, balance="800")
        await auth_client.post("/api/v1/transactions", json={
            "account_id": account_id,
            "date": "2026-05-01",
            "description": "Ingreso",
            "amount": "1000",
            "currency": "CLP",
            "movement_type": "income",
        })
        await auth_client.post("/api/v1/transactions", json={
            "account_id": account_id,
            "date": "2026-05-02",
            "description": "Gasto",
            "amount": "200",
            "currency": "CLP",
            "movement_type": "expense",
        })

        resp = await auth_client.get("/api/v1/reconciliation/summary", params={"currency": "CLP"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok_count"] >= 1
        assert data["start_date"] is None
        assert data["accounts"][0]["movement_balance"] == "800.00"

        filtered = await auth_client.get("/api/v1/reconciliation/summary", params={"currency": "CLP", "start_date": "2026-05-02", "end_date": "2026-05-02"})
        assert filtered.status_code == 200
        filtered_data = filtered.json()
        assert filtered_data["start_date"] == "2026-05-02"
        assert filtered_data["end_date"] == "2026-05-02"
        assert filtered_data["accounts"][0]["movement_balance"] == "-200.00"

    async def test_audit_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/audit")
        assert resp.status_code == 401
