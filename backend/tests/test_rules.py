from __future__ import annotations

from httpx import AsyncClient


class TestRulePreviewAndApply:
    async def _account(self, client: AsyncClient) -> str:
        resp = await client.post("/api/v1/accounts", json={
            "name": "Cuenta reglas", "account_type": "checking",
            "currency": "CLP", "balance": "0",
        })
        assert resp.status_code == 201
        return resp.json()["id"]

    async def _category(self, client: AsyncClient, name: str) -> str:
        resp = await client.post("/api/v1/categories", json={"name": name})
        assert resp.status_code == 201
        return resp.json()["id"]

    async def _tx(self, client: AsyncClient, account_id: str, desc: str, date: str = "2026-02-01") -> str:
        resp = await client.post("/api/v1/transactions", json={
            "account_id": account_id, "date": date, "description": desc,
            "amount": "12000", "currency": "CLP", "movement_type": "expense",
        })
        assert resp.status_code == 201
        return resp.json()["id"]

    async def test_preview_counts_matches(self, auth_client: AsyncClient) -> None:
        account_id = await self._account(auth_client)
        await self._tx(auth_client, account_id, "UBER TRIP 123")
        await self._tx(auth_client, account_id, "UBER EATS DELIVERY")
        await self._tx(auth_client, account_id, "JUMBO SUPERMERCADO")

        preview = await auth_client.post("/api/v1/category-rules/preview", json={
            "field": "description", "operator": "contains", "pattern": "uber",
        })
        assert preview.status_code == 200
        body = preview.json()
        assert body["count"] == 2
        assert body["uncategorized"] == 2
        assert len(body["samples"]) == 2

    async def test_apply_rule_to_historical(self, auth_client: AsyncClient) -> None:
        account_id = await self._account(auth_client)
        category_id = await self._category(auth_client, "Transporte")
        await self._tx(auth_client, account_id, "UBER TRIP A")
        await self._tx(auth_client, account_id, "UBER TRIP B")
        await self._tx(auth_client, account_id, "PANADERIA")

        rule = await auth_client.post("/api/v1/category-rules", json={
            "target_category_id": category_id, "field": "description",
            "operator": "contains", "pattern": "uber", "priority": 10,
        })
        assert rule.status_code == 201
        rule_id = rule.json()["id"]

        applied = await auth_client.post(f"/api/v1/category-rules/{rule_id}/apply")
        assert applied.status_code == 200
        body = applied.json()
        assert body["matched"] == 2
        assert body["updated"] == 2

        # Re-aplicar no cambia nada (ya están categorizadas con esa categoría).
        again = await auth_client.post(f"/api/v1/category-rules/{rule_id}/apply")
        assert again.json()["updated"] == 0

    async def test_preview_requires_auth(self, client: AsyncClient) -> None:
        resp = await client.post("/api/v1/category-rules/preview", json={
            "field": "description", "operator": "contains", "pattern": "x",
        })
        assert resp.status_code == 401


class TestAutoTagging:
    async def _account(self, client):
        r = await client.post("/api/v1/accounts", json={
            "name": "AT", "account_type": "checking", "currency": "CLP", "balance": "0"})
        return r.json()["id"]

    async def _category(self, client, name):
        r = await client.post("/api/v1/categories", json={"name": name})
        return r.json()["id"]

    async def _tag(self, client, name):
        r = await client.post("/api/v1/tags", json={"name": name})
        return r.json()["id"]

    async def test_rule_applies_tag_to_historical(self, auth_client):
        acc = await self._account(auth_client)
        cat = await self._category(auth_client, "Transporte")
        tag = await self._tag(auth_client, "viajes")
        for i in range(2):
            r = await auth_client.post("/api/v1/transactions", json={
                "account_id": acc, "date": f"2026-02-0{i+1}", "description": f"UBER {i}",
                "amount": "5000", "currency": "CLP", "movement_type": "expense"})
            assert r.status_code == 201
        rule = await auth_client.post("/api/v1/category-rules", json={
            "target_category_id": cat, "target_tag_id": tag, "field": "description",
            "operator": "contains", "pattern": "uber", "priority": 5})
        assert rule.status_code == 201
        assert rule.json()["target_tag_id"] == tag
        applied = await auth_client.post(f"/api/v1/category-rules/{rule.json()['id']}/apply")
        assert applied.status_code == 200
        assert applied.json()["updated"] == 2
        # Verifica que las transacciones quedaron etiquetadas.
        txs = await auth_client.get("/api/v1/transactions")
        payload = txs.json()
        items = payload["items"] if isinstance(payload, dict) else payload
        tagged = [t for t in items if any(tg["id"] == tag for tg in t["tags"])]
        assert len(tagged) == 2

    async def test_rule_rejects_foreign_tag(self, auth_client):
        cat = await self._category(auth_client, "X")
        r = await auth_client.post("/api/v1/category-rules", json={
            "target_category_id": cat, "target_tag_id": "00000000-0000-0000-0000-000000000000",
            "field": "description", "operator": "contains", "pattern": "z"})
        assert r.status_code == 404
