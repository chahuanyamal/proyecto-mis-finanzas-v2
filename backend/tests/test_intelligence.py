from __future__ import annotations

from app.modules.transactions.normalize import normalize_merchant


class TestNormalize:
    def test_strips_bank_noise(self) -> None:
        assert normalize_merchant("COMPRA WEBPAY 003481 UBER") == "Uber"
        assert normalize_merchant("PAGO PAT SPOTIFY") == "Spotify"
        assert normalize_merchant("") == ""

    def test_keeps_meaningful_words(self) -> None:
        out = normalize_merchant("TRANSFERENCIA A JUAN PEREZ")
        assert "Juan" in out and "Perez" in out


class TestAnomaliesHistoryLinkMerge:
    async def _account(self, client, name):
        r = await client.post("/api/v1/accounts", json={
            "name": name, "account_type": "checking", "currency": "CLP", "balance": "0"})
        assert r.status_code == 201
        return r.json()["id"]

    async def _category(self, client, name):
        r = await client.post("/api/v1/categories", json={"name": name})
        assert r.status_code == 201
        return r.json()["id"]

    async def _tx(self, client, account_id, amount, desc, date="2026-02-01", category_id=None, mtype="expense"):
        body = {"account_id": account_id, "date": date, "description": desc,
                "amount": amount, "currency": "CLP", "movement_type": mtype}
        if category_id:
            body["category_id"] = category_id
        r = await client.post("/api/v1/transactions", json=body)
        assert r.status_code == 201
        return r.json()["id"]

    async def test_anomalies_detects_outlier(self, auth_client) -> None:
        acc = await self._account(auth_client, "A")
        cat = await self._category(auth_client, "Supermercado")
        for i, amt in enumerate(["30000", "32000", "31000", "29000"]):
            await self._tx(auth_client, acc, amt, "Jumbo", f"2026-02-0{i+1}", cat)
        await self._tx(auth_client, acc, "150000", "Jumbo grande", "2026-02-09", cat)

        r = await auth_client.get("/api/v1/transactions/anomalies")
        assert r.status_code == 200
        items = r.json()
        assert any(float(a["amount"]) == 150000 for a in items)

    async def test_history_records_changes(self, auth_client) -> None:
        acc = await self._account(auth_client, "B")
        cat = await self._category(auth_client, "Otros")
        tx = await self._tx(auth_client, acc, "5000", "Cafe")
        await auth_client.patch(f"/api/v1/transactions/{tx}", json={"category_id": cat})
        r = await auth_client.get(f"/api/v1/transactions/{tx}/history")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    async def test_link_transfer(self, auth_client) -> None:
        a = await self._account(auth_client, "Origen")
        b = await self._account(auth_client, "Destino")
        t1 = await self._tx(auth_client, a, "80000", "Salida", mtype="expense")
        t2 = await self._tx(auth_client, b, "80000", "Entrada", mtype="income")
        r = await auth_client.post("/api/v1/transactions/link-transfer", json={
            "transaction_id_a": t1, "transaction_id_b": t2})
        assert r.status_code == 200 and r.json()["linked"] is True
        got = await auth_client.get(f"/api/v1/transactions/{t1}")
        assert got.json()["is_internal_transfer"] is True

    async def test_merge_duplicate(self, auth_client) -> None:
        acc = await self._account(auth_client, "C")
        primary = await self._tx(auth_client, acc, "12000", "Compra", "2026-02-01")
        dup = await self._tx(auth_client, acc, "12000", "Compra", "2026-02-01")
        r = await auth_client.post(f"/api/v1/transactions/{primary}/merge", json={"duplicate_id": dup})
        assert r.status_code == 200
        got = await auth_client.get(f"/api/v1/transactions/{dup}")
        assert got.json()["is_duplicate"] is True

    async def test_display_name_in_output(self, auth_client) -> None:
        acc = await self._account(auth_client, "D")
        tx = await self._tx(auth_client, acc, "9990", "COMPRA WEBPAY 003481 UBER")
        got = await auth_client.get(f"/api/v1/transactions/{tx}")
        assert got.json()["display_name"] == "Uber"


class TestRuleSuggestions:
    async def _account(self, client, name):
        r = await client.post("/api/v1/accounts", json={
            "name": name, "account_type": "checking", "currency": "CLP", "balance": "0"})
        return r.json()["id"]

    async def _category(self, client, name):
        r = await client.post("/api/v1/categories", json={"name": name})
        return r.json()["id"]

    async def test_suggests_from_manual_categorization(self, auth_client) -> None:
        acc = await self._account(auth_client, "S")
        cat = await self._category(auth_client, "Transporte")
        for i in range(3):
            r = await auth_client.post("/api/v1/transactions", json={
                "account_id": acc, "date": f"2026-02-0{i+1}", "description": f"COMPRA WEBPAY UBER {i}",
                "amount": "5000", "currency": "CLP", "movement_type": "expense", "category_id": cat})
            assert r.status_code == 201
        r = await auth_client.get("/api/v1/category-rules/suggestions")
        assert r.status_code == 200
        sugg = r.json()
        assert any(s["pattern"] == "uber" and s["match_count"] >= 3 for s in sugg)
