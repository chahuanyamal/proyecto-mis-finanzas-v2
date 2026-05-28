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

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


async def _category_or_404(category_id: uuid.UUID, db: AsyncSession) -> Category:
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoría no encontrada")
    return category


async def _validate_parent(parent_id: uuid.UUID | None, db: AsyncSession, current_id: uuid.UUID | None = None) -> None:
    if parent_id is None:
        return
    if current_id is not None and parent_id == current_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Una categoría no puede ser su propio padre")
    await _category_or_404(parent_id, db)


@router.get("", response_model=list[CategoryOut])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[Category]:
    result = await db.execute(select(Category).order_by(Category.name))
    return list(result.scalars().all())


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> Category:
    await _validate_parent(body.parent_id, db)
    category = Category(**body.model_dump())
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> Category:
    category = await _category_or_404(category_id, db)
    changes = body.model_dump(exclude_unset=True)
    if "parent_id" in changes:
        await _validate_parent(changes["parent_id"], db, category_id)
    for field, value in changes.items():
        setattr(category, field, value)
    await db.commit()
    await db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> Response:
    category = await _category_or_404(category_id, db)
    await db.delete(category)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
