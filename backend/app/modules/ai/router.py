"""Router para sugerencias de categorización con IA (simulada / basada en reglas)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.modules.ai.service import AiCategorizationService
from app.modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


@router.get("/categorize/suggestions")
async def get_categorization_suggestions(
    top_n: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Retorna sugerencias de categoría para transacciones sin categorizar.
    Usa matching por palabras clave y reglas existentes para sugerir categorías.
    """
    service = AiCategorizationService(db, current_user)
    suggestions = await service.suggest_categories(top_n=top_n)
    return {
        "count": len(suggestions),
        "suggestions": suggestions,
    }


@router.post("/categorize/apply")
async def apply_categorization(
    transaction_id: str,
    category_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Aplica una sugerencia de categorización a una transacción."""
    service = AiCategorizationService(db, current_user)
    ok = await service.apply_suggestion(transaction_id, category_id)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transacción no encontrada")
    return {"ok": True, "transaction_id": transaction_id, "category_id": category_id}


@router.post("/categorize/apply-bulk")
async def apply_bulk_categorization(
    suggestions: list[dict],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Aplica múltiples sugerencias de categorización de una sola vez."""
    service = AiCategorizationService(db, current_user)
    result = await service.apply_bulk(suggestions)
    return result

# ─────────────────────────────────────────────────────────────────────────────
# Asistente conversacional configurable (LLM OpenAI-compatible).
# ─────────────────────────────────────────────────────────────────────────────
import httpx  # noqa: E402

from app.modules.ai import service as ai_service  # noqa: E402
from app.modules.ai.schemas import (  # noqa: E402
    AiConfigOut,
    AiConfigUpdate,
    AiTestResult,
    AskRequest,
    AskResponse,
)

_SYSTEM = (
    "Eres un asistente financiero personal en español. Respondes de forma breve, "
    "concreta y útil usando ÚNICAMENTE los datos del contexto entregado. Si la "
    "pregunta no se puede responder con esos datos, dilo claramente. No inventes cifras."
)


def _ai_out(cfg: dict) -> AiConfigOut:
    return AiConfigOut(
        provider=cfg.get("provider", "ollama"),
        base_url=cfg.get("base_url", ""),
        model=cfg.get("model", ""),
        has_token=bool(cfg.get("token")),
        enabled=ai_service.is_ai_enabled(cfg),
    )


@router.get("/config", response_model=AiConfigOut)
async def get_ai_config(current_user: User = Depends(get_current_user)) -> AiConfigOut:
    return _ai_out(ai_service.get_ai_config(current_user))


@router.put("/config", response_model=AiConfigOut)
async def update_ai_config(
    body: AiConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AiConfigOut:
    cfg = ai_service.get_ai_config(current_user)
    cfg["provider"], cfg["base_url"], cfg["model"] = body.provider, body.base_url, body.model
    if body.token is not None:
        cfg["token"] = body.token
    prefs = dict(current_user.preferences or {})
    prefs["ai"] = cfg
    current_user.preferences = prefs
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return _ai_out(ai_service.get_ai_config(current_user))


@router.post("/test", response_model=AiTestResult)
async def test_ai(current_user: User = Depends(get_current_user)) -> AiTestResult:
    cfg = ai_service.get_ai_config(current_user)
    if not ai_service.is_ai_enabled(cfg):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Configura proveedor, endpoint y modelo primero")
    try:
        answer = await ai_service.call_llm(cfg, "Responde solo: OK", "ping", timeout=15.0)
        return AiTestResult(ok=True, detail=f"Conexión exitosa: {answer[:80]}", model=cfg["model"])
    except httpx.HTTPStatusError as exc:
        return AiTestResult(ok=False, detail=f"HTTP {exc.response.status_code}", model=cfg["model"])
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        return AiTestResult(ok=False, detail=f"Error de conexión: {exc}", model=cfg.get("model"))


@router.post("/ask", response_model=AskResponse)
async def ask_ai(
    body: AskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AskResponse:
    cfg = ai_service.get_ai_config(current_user)
    if not ai_service.is_ai_enabled(cfg):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El asistente IA no está configurado. Ve a Ajustes → Inteligencia Artificial.")
    context, used = await ai_service.build_finance_context(db, current_user, body.currency)
    try:
        answer = await ai_service.call_llm(cfg, f"{_SYSTEM}\n\n--- CONTEXTO ---\n{context}", body.question)
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"No se pudo contactar al proveedor IA: {exc}") from exc
    return AskResponse(answer=answer, model=cfg["model"], context_used=used)
