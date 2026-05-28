from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category


def visible_filter(user_id: uuid.UUID) -> ColumnElement[bool]:
    """Categorías visibles para un usuario: las del sistema (user_id NULL)
    más las propias."""
    return or_(Category.user_id.is_(None), Category.user_id == user_id)


async def ensure_category_visible(
    category_id: uuid.UUID | None, db: AsyncSession, user_id: uuid.UUID
) -> None:
    """Valida que una categoría referenciada exista y sea visible para el
    usuario (del sistema o propia). No-op si category_id es None."""
    if category_id is None:
        return
    result = await db.execute(
        select(Category.id).where(Category.id == category_id, visible_filter(user_id))
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoría no encontrada")
