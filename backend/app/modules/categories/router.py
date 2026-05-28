from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.category import Category
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from app.modules.categories.service import ensure_category_visible, visible_filter

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


async def _owned_category_or_404(
    category_id: uuid.UUID, db: AsyncSession, current_user: User
) -> Category:
    """Devuelve la categoría solo si pertenece al usuario. Las categorías del
    sistema (user_id NULL) y las de otros usuarios devuelven 404, evitando que
    el catálogo compartido sea modificable."""
    result = await db.execute(
        select(Category).where(
            Category.id == category_id, Category.user_id == current_user.id
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoría no encontrada")
    return category


async def _validate_parent(
    parent_id: uuid.UUID | None,
    db: AsyncSession,
    current_user: User,
    current_id: uuid.UUID | None = None,
) -> None:
    if parent_id is None:
        return
    if current_id is not None and parent_id == current_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Una categoría no puede ser su propio padre")
    await ensure_category_visible(parent_id, db, current_user.id)


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Category]:
    result = await db.execute(
        select(Category).where(visible_filter(current_user.id)).order_by(Category.name)
    )
    return list(result.scalars().all())


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Category:
    await _validate_parent(body.parent_id, db, current_user)
    category = Category(user_id=current_user.id, **body.model_dump())
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Category:
    category = await _owned_category_or_404(category_id, db, current_user)
    changes = body.model_dump(exclude_unset=True)
    if "parent_id" in changes:
        await _validate_parent(changes["parent_id"], db, current_user, category_id)
    for field, value in changes.items():
        setattr(category, field, value)
    await db.commit()
    await db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    category = await _owned_category_or_404(category_id, db, current_user)
    await db.delete(category)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
