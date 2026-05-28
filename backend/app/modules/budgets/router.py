from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.budget import Budget
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.budgets.schemas import BudgetCreate, BudgetOut, BudgetUpdate
from app.modules.categories.service import ensure_category_visible

router = APIRouter(prefix="/api/v1/budgets", tags=["budgets"])


async def _budget_or_404(budget_id: uuid.UUID, db: AsyncSession, current_user: User) -> Budget:
    result = await db.execute(
        select(Budget)
        .options(selectinload(Budget.category))
        .where(Budget.id == budget_id, Budget.user_id == current_user.id)
    )
    budget = result.scalar_one_or_none()
    if budget is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Presupuesto no encontrado")
    return budget


@router.get("", response_model=list[BudgetOut])
async def list_budgets(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Budget]:
    query = (
        select(Budget)
        .options(selectinload(Budget.category))
        .where(Budget.user_id == current_user.id)
        .order_by(Budget.month.desc())
    )
    if month:
        query = query.where(Budget.month == month)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
async def create_budget(
    body: BudgetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Budget:
    await ensure_category_visible(body.category_id, db, current_user.id)
    existing = await db.execute(
        select(Budget.id).where(
            Budget.user_id == current_user.id,
            Budget.category_id == body.category_id,
            Budget.month == body.month,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe presupuesto para esa categoría y mes")
    budget = Budget(user_id=current_user.id, **body.model_dump())
    db.add(budget)
    await db.flush()
    budget_id = budget.id
    await db.commit()
    return await _budget_or_404(budget_id, db, current_user)


@router.get("/{budget_id}", response_model=BudgetOut)
async def get_budget(
    budget_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Budget:
    return await _budget_or_404(budget_id, db, current_user)


@router.patch("/{budget_id}", response_model=BudgetOut)
async def update_budget(
    budget_id: uuid.UUID,
    body: BudgetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Budget:
    budget = await _budget_or_404(budget_id, db, current_user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(budget, field, value)
    await db.commit()
    return await _budget_or_404(budget_id, db, current_user)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(
    budget_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    budget = await _budget_or_404(budget_id, db, current_user)
    await db.delete(budget)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
