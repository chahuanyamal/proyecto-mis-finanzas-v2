from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.category import Category
from app.models.category_rule import CategoryRule
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.rules.schemas import CategoryRuleCreate, CategoryRuleOut, CategoryRuleUpdate

router = APIRouter(prefix="/api/v1/category-rules", tags=["category-rules"])


async def _category_or_404(category_id: uuid.UUID, db: AsyncSession) -> None:
    result = await db.execute(select(Category.id).where(Category.id == category_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoría no encontrada")


async def _rule_or_404(rule_id: uuid.UUID, db: AsyncSession, current_user: User) -> CategoryRule:
    result = await db.execute(
        select(CategoryRule)
        .options(selectinload(CategoryRule.target_category))
        .where(CategoryRule.id == rule_id, CategoryRule.user_id == current_user.id)
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Regla no encontrada")
    return rule


@router.get("", response_model=list[CategoryRuleOut])
async def list_rules(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[CategoryRule]:
    result = await db.execute(
        select(CategoryRule)
        .options(selectinload(CategoryRule.target_category))
        .where(CategoryRule.user_id == current_user.id)
        .order_by(CategoryRule.priority.desc(), CategoryRule.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=CategoryRuleOut, status_code=status.HTTP_201_CREATED)
async def create_rule(body: CategoryRuleCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> CategoryRule:
    await _category_or_404(body.target_category_id, db)
    rule = CategoryRule(user_id=current_user.id, **body.model_dump())
    db.add(rule)
    await db.flush()
    rule_id = rule.id
    await db.commit()
    return await _rule_or_404(rule_id, db, current_user)


@router.patch("/{rule_id}", response_model=CategoryRuleOut)
async def update_rule(rule_id: uuid.UUID, body: CategoryRuleUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> CategoryRule:
    rule = await _rule_or_404(rule_id, db, current_user)
    changes = body.model_dump(exclude_unset=True)
    if "target_category_id" in changes and changes["target_category_id"] is not None:
        await _category_or_404(changes["target_category_id"], db)
    for field, value in changes.items():
        setattr(rule, field, value)
    await db.commit()
    return await _rule_or_404(rule_id, db, current_user)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    rule = await _rule_or_404(rule_id, db, current_user)
    await db.delete(rule)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
