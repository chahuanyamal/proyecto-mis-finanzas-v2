from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.category import Category
from app.models.recurring import RecurringExpense
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.recurring.schemas import RecurringCreate, RecurringOut, RecurringUpdate

router = APIRouter(prefix="/api/v1/recurring", tags=["recurring"])


async def _category_or_404(category_id: uuid.UUID | None, db: AsyncSession) -> None:
    if category_id is None:
        return
    result = await db.execute(select(Category.id).where(Category.id == category_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoría no encontrada")


async def _item_or_404(item_id: uuid.UUID, db: AsyncSession, current_user: User) -> RecurringExpense:
    result = await db.execute(
        select(RecurringExpense).where(
            RecurringExpense.id == item_id, RecurringExpense.user_id == current_user.id
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recurrente no encontrado")
    return item


@router.get("", response_model=list[RecurringOut])
async def list_recurring(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[RecurringExpense]:
    result = await db.execute(
        select(RecurringExpense)
        .where(RecurringExpense.user_id == current_user.id)
        .order_by(RecurringExpense.next_date.asc().nulls_last(), RecurringExpense.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=RecurringOut, status_code=status.HTTP_201_CREATED)
async def create_recurring(
    body: RecurringCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecurringExpense:
    await _category_or_404(body.category_id, db)
    item = RecurringExpense(user_id=current_user.id, **body.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=RecurringOut)
async def update_recurring(
    item_id: uuid.UUID,
    body: RecurringUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecurringExpense:
    item = await _item_or_404(item_id, db, current_user)
    changes = body.model_dump(exclude_unset=True)
    if "category_id" in changes:
        await _category_or_404(changes["category_id"], db)
    for field, value in changes.items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    item = await _item_or_404(item_id, db, current_user)
    await db.delete(item)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
