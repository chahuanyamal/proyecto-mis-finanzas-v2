from __future__ import annotations

import pytest
from httpx import AsyncClient


class TestAccounts:
    async def test_list_accounts_empty(self, auth_client: AsyncClient) -> None:
        resp = await auth_client.get("/api/v1/accounts")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_account(self, auth_client: AsyncClient) -> None:
        resp = await auth_client.post("/api/v1/accounts", json={
            "name": "Cuenta Corriente",
            "account_type": "checking",
            "currency": "CLP",
            "balance": "100000",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Cuenta Corriente"
        assert data["currency"] == "CLP"
        assert data["balance"] == "100000"

    async def test_create_with_institution(self, auth_client: AsyncClient) -> None:
        inst_resp = await auth_client.get("/api/v1/institutions")
        assert inst_resp.status_code == 200
        institutions = inst_resp.json()
        inst_id = institutions[0]["id"] if institutions else None
        resp = await auth_client.post("/api/v1/accounts", json={
            "name": "Cuenta BICE",
            "account_type": "checking",
            "currency": "CLP",
            "balance": "0",
            "institution_id": inst_id,
        })
        assert resp.status_code == 201
        assert resp.json()["institution"] is not None

    async def test_invalid_institution_returns_404(self, auth_client: AsyncClient) -> None:
        import uuid
        resp = await auth_client.post("/api/v1/accounts", json={
            "name": "X",
            "account_type": "checking",
            "currency": "CLP",
            "balance": "0",
            "institution_id": str(uuid.uuid4()),
        })
        assert resp.status_code == 404

    async def test_get_account_404(self, auth_client: AsyncClient) -> None:
        import uuid
        resp = await auth_client.get(f"/api/v1/accounts/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_update_account(self, auth_client: AsyncClient) -> None:
        create_resp = await auth_client.post("/api/v1/accounts", json={
            "name": "Original",
            "account_type": "checking",
            "currency": "CLP",
            "balance": "50000",
        })
        acc_id = create_resp.json()["id"]
        resp = await auth_client.patch(f"/api/v1/accounts/{acc_id}", json={"name": "Renamed"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed"

    async def test_delete_account(self, auth_client: AsyncClient) -> None:
        create_resp = await auth_client.post("/api/v1/accounts", json={
            "name": "ToDelete",
            "account_type": "cash",
            "currency": "USD",
            "balance": "0",
        })
        acc_id = create_resp.json()["id"]
        del_resp = await auth_client.delete(f"/api/v1/accounts/{acc_id}")
        assert del_resp.status_code == 204
        get_resp = await auth_client.get(f"/api/v1/accounts/{acc_id}")
        assert get_resp.status_code == 404

    async def test_list_accounts_only_own(self, auth_client: AsyncClient, other_auth_client: AsyncClient) -> None:
        await auth_client.post("/api/v1/accounts", json={
            "name": "Mia", "account_type": "checking", "currency": "CLP", "balance": "0"})
        await other_auth_client.post("/api/v1/accounts", json={
            "name": "Ajena", "account_type": "checking", "currency": "CLP", "balance": "0"})
        resp = await auth_client.get("/api/v1/accounts")
        data = resp.json()
        names = [a["name"] for a in data]
        assert "Mia" in names
        assert "Ajena" not in names

    async def test_cannot_access_other_users_account(self, auth_client: AsyncClient, other_auth_client: AsyncClient) -> None:
        create_resp = await other_auth_client.post("/api/v1/accounts", json={
            "name": "Ajena", "account_type": "checking", "currency": "CLP", "balance": "0"})
        acc_id = create_resp.json()["id"]
        resp = await auth_client.get(f"/api/v1/accounts/{acc_id}")
        assert resp.status_code == 404

    async def test_create_account_without_auth_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post("/api/v1/accounts", json={
            "name": "X", "account_type": "checking", "currency": "CLP", "balance": "0"})
        assert resp.status_code == 401
