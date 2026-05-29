from __future__ import annotations

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.statement_preview import StatementPreview
from app.models.uploaded_file import UploadedFile
from app.models.user import User


class TestStatements:
    async def _create_account(self, auth_client: AsyncClient) -> str:
        resp = await auth_client.post("/api/v1/accounts", json={
            "name": "Cuenta Cartolas",
            "account_type": "checking",
            "currency": "CLP",
            "balance": "0",
        })
        assert resp.status_code == 201
        return resp.json()["id"]

    async def test_list_parsers(self, auth_client: AsyncClient) -> None:
        resp = await auth_client.get("/api/v1/statements/parsers")
        assert resp.status_code == 200
        data = resp.json()
        keys = {item["key"] for item in data}
        assert {"itau", "bice", "generic"}.issubset(keys)
        assert all("display_name" in item for item in data)

    async def test_list_parsers_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/statements/parsers")
        assert resp.status_code == 401

    async def test_quality_stats(self, auth_client: AsyncClient, db_session: AsyncSession, test_user: User) -> None:
        account_id = await self._create_account(auth_client)
        statement = UploadedFile(
            account_id=uuid.UUID(account_id),
            user_id=uuid.UUID(str(test_user.id)),
            filename="cartola-calidad.pdf",
            bank_detected="itau:checking",
            status="processed",
        )
        db_session.add(statement)
        await db_session.commit()

        resp = await auth_client.get("/api/v1/statements/quality-stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["statement_count"] >= 1
        assert any(item["parser"] == "itau" for item in data["by_parser"])
        assert any(item["filename"] == "cartola-calidad.pdf" for item in data["recent"])

    async def test_export_preview_csv(self, auth_client: AsyncClient, db_session: AsyncSession, test_user: User) -> None:
        account_id = await self._create_account(auth_client)
        preview = StatementPreview(
            account_id=uuid.UUID(account_id),
            user_id=uuid.UUID(str(test_user.id)),
            filename="cartola-test.pdf",
            stored_filename="/tmp/cartola-test.pdf",
            bank_detected="test",
            status="ready",
            rows=[{"date": "2026-05-01", "description": "Compra", "amount": "1000", "movement_type": "expense"}],
        )
        db_session.add(preview)
        await db_session.commit()

        resp = await auth_client.get(f"/api/v1/statements/previews/{preview.id}/export.csv")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/csv")
        assert "date,description,amount,movement_type" in resp.text
        assert "Compra" in resp.text

    async def test_rollback_statement_deletes_transactions(self, auth_client: AsyncClient) -> None:
        account_id = await self._create_account(auth_client)
        create_resp = await auth_client.post("/api/v1/transactions", json={
            "account_id": account_id,
            "date": "2026-05-01",
            "description": "Movimiento rollback",
            "amount": "1000",
            "currency": "CLP",
            "movement_type": "expense",
        })
        assert create_resp.status_code == 201
        tx = create_resp.json()

        rollback_resp = await auth_client.post(f"/api/v1/statements/history/{tx['uploaded_file_id']}/rollback")
        assert rollback_resp.status_code == 200
        assert rollback_resp.json() == {"ok": True, "deleted_transactions": 1}

        get_resp = await auth_client.get(f"/api/v1/transactions/{tx['id']}")
        assert get_resp.status_code == 404
