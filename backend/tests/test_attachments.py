from __future__ import annotations

from httpx import AsyncClient


class TestAttachments:
    async def _account(self, c):
        r = await c.post("/api/v1/accounts", json={
            "name": "A", "account_type": "checking", "currency": "CLP", "balance": "0"})
        return r.json()["id"]

    async def _tx(self, c, acc):
        r = await c.post("/api/v1/transactions", json={
            "account_id": acc, "date": "2026-02-01", "description": "Compra",
            "amount": "1000", "currency": "CLP", "movement_type": "expense"})
        return r.json()["id"]

    async def test_upload_list_download_delete(self, auth_client: AsyncClient) -> None:
        acc = await self._account(auth_client)
        tx = await self._tx(auth_client, acc)

        # upload PNG
        files = {"file": ("recibo.png", b"\x89PNG\r\n\x1a\nfakepngdata", "image/png")}
        up = await auth_client.post(f"/api/v1/transactions/{tx}/attachments", files=files)
        assert up.status_code == 201
        att_id = up.json()["id"]
        assert up.json()["filename"] == "recibo.png"
        assert up.json()["size"] > 0

        lst = await auth_client.get(f"/api/v1/transactions/{tx}/attachments")
        assert lst.status_code == 200 and len(lst.json()) == 1

        dl = await auth_client.get(f"/api/v1/attachments/{att_id}/download")
        assert dl.status_code == 200
        assert dl.content.startswith(b"\x89PNG")

        d = await auth_client.delete(f"/api/v1/attachments/{att_id}")
        assert d.status_code == 204
        lst2 = await auth_client.get(f"/api/v1/transactions/{tx}/attachments")
        assert len(lst2.json()) == 0

    async def test_rejects_bad_type(self, auth_client: AsyncClient) -> None:
        acc = await self._account(auth_client)
        tx = await self._tx(auth_client, acc)
        files = {"file": ("malo.exe", b"MZ...", "application/x-msdownload")}
        r = await auth_client.post(f"/api/v1/transactions/{tx}/attachments", files=files)
        assert r.status_code == 415

    async def test_requires_auth(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/transactions/00000000-0000-0000-0000-000000000000/attachments")).status_code == 401
