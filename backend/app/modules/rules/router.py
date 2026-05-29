from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.account import Account
from app.models.category_rule import CategoryRule
from app.models.transaction import Transaction
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.audit.service import log_audit
from app.modules.categories.service import ensure_category_visible
from app.modules.rules.schemas import (
    CategoryRuleCreate,
    CategoryRuleOut,
    CategoryRuleUpdate,
    RuleApplyResult,
    RulePreviewRequest,
    RulePreviewResult,
    RulePreviewSample,
)

router = APIRouter(prefix="/api/v1/category-rules", tags=["category-rules"])

_RULE_FIELDS = {"description", "merchant", "notes"}


def _matches(value: str | None, operator: str, pattern: str) -> bool:
    value_norm = str(value or "").lower()
    pat = pattern.lower()
    if operator == "equals":
        return value_norm == pat
    if operator == "starts_with":
        return value_norm.startswith(pat)
    return pat in value_norm


async def _matching_transactions(
    db: AsyncSession, current_user: User, field: str, operator: str, pattern: str
) -> list[Transaction]:
    safe_field = field if field in _RULE_FIELDS else "description"
    result = await db.execute(
        select(Transaction)
        .join(Account)
        .where(Account.user_id == current_user.id, Transaction.user_id == current_user.id)
        .order_by(Transaction.date.desc())
    )
    return [tx for tx in result.scalars().all() if _matches(getattr(tx, safe_field, ""), operator, pattern)]


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
    await ensure_category_visible(body.target_category_id, db, current_user.id)
    rule = CategoryRule(user_id=current_user.id, **body.model_dump())
    db.add(rule)
    await db.flush()
    rule_id = rule.id
    await log_audit(db, user_id=current_user.id, action="create", entity_type="rule", entity_id=str(rule_id), metadata={"pattern": rule.pattern, "target_category_id": str(rule.target_category_id)})
    await db.commit()
    return await _rule_or_404(rule_id, db, current_user)


@router.post("/preview", response_model=RulePreviewResult)
async def preview_rule(
    body: RulePreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RulePreviewResult:
    """Cuenta cuántos movimientos coinciden con una regla (preview vivo del builder)."""
    matches = await _matching_transactions(db, current_user, body.field, body.operator, body.pattern)
    uncategorized = sum(1 for tx in matches if tx.category_id is None)
    samples = [
        RulePreviewSample(
            id=tx.id,
            date=tx.date.isoformat(),
            description=tx.description,
            amount=str(tx.amount),
            has_category=tx.category_id is not None,
        )
        for tx in matches[:5]
    ]
    return RulePreviewResult(count=len(matches), uncategorized=uncategorized, samples=samples)


@router.post("/{rule_id}/apply", response_model=RuleApplyResult)
async def apply_rule(
    rule_id: uuid.UUID,
    only_uncategorized: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RuleApplyResult:
    """Aplica una regla a los movimientos históricos que coinciden.

    Por defecto solo recategoriza los movimientos sin categoría; con
    ``only_uncategorized=false`` sobrescribe también los ya categorizados.
    """
    rule = await _rule_or_404(rule_id, db, current_user)
    matches = await _matching_transactions(db, current_user, rule.field, rule.operator, rule.pattern)
    updated = 0
    for tx in matches:
        if only_uncategorized and tx.category_id is not None:
            continue
        if tx.category_id == rule.target_category_id:
            continue
        tx.category_id = rule.target_category_id
        tx.rule_id = rule.id
        updated += 1
    if updated:
        await log_audit(
            db, user_id=current_user.id, action="apply", entity_type="rule",
            entity_id=str(rule_id), metadata={"updated": updated, "matched": len(matches)},
        )
        await db.commit()
    return RuleApplyResult(matched=len(matches), updated=updated)


@router.patch("/{rule_id}", response_model=CategoryRuleOut)
async def update_rule(rule_id: uuid.UUID, body: CategoryRuleUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> CategoryRule:
    rule = await _rule_or_404(rule_id, db, current_user)
    changes = body.model_dump(exclude_unset=True)
    if "target_category_id" in changes and changes["target_category_id"] is not None:
        await ensure_category_visible(changes["target_category_id"], db, current_user.id)
    for field, value in changes.items():
        setattr(rule, field, value)
    await db.commit()
    return await _rule_or_404(rule_id, db, current_user)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    rule = await _rule_or_404(rule_id, db, current_user)
    await db.delete(rule)
    await log_audit(db, user_id=current_user.id, action="delete", entity_type="rule", entity_id=str(rule_id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
