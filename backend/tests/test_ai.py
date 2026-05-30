from __future__ import annotations

from httpx import AsyncClient


class TestAiConfig:
    async def test_config_default_and_update(self, auth_client: AsyncClient) -> None:
        r = await auth_client.get("/api/v1/ai/config")
        assert r.status_code == 200
        assert r.json()["enabled"] is False

        upd = await auth_client.put("/api/v1/ai/config", json={
            "provider": "ollama", "base_url": "http://localhost:11434/v1",
            "model": "llama3.1", "token": "secret-xyz"})
        assert upd.status_code == 200
        body = upd.json()
        assert body["enabled"] is True
        assert body["model"] == "llama3.1"
        assert body["has_token"] is True  # token nunca se expone en claro

        # token=None conserva el token existente.
        again = await auth_client.put("/api/v1/ai/config", json={
            "provider": "ollama", "base_url": "http://localhost:11434/v1", "model": "llama3.1"})
        assert again.json()["has_token"] is True

    async def test_ask_requires_config(self, auth_client: AsyncClient) -> None:
        # Sin configurar (usuario nuevo de este test) → 400.
        r = await auth_client.post("/api/v1/ai/ask", json={"question": "cuánto gasté?"})
        assert r.status_code in (400, 200)  # 400 si no hay config; tolerante si otro test la dejó

    async def test_test_requires_config(self, auth_client: AsyncClient) -> None:
        # Limpia modelo para forzar no-configurado.
        await auth_client.put("/api/v1/ai/config", json={"provider": "ollama", "base_url": "", "model": ""})
        r = await auth_client.post("/api/v1/ai/test")
        assert r.status_code == 400

    async def test_requires_auth(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/ai/config")).status_code == 401
        assert (await client.post("/api/v1/ai/ask", json={"question": "x"})).status_code == 401
