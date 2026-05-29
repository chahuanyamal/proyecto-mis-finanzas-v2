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