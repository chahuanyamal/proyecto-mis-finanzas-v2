from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.account import Account
from app.models.category import Category
from app.models.category_rule import CategoryRule
from app.models.tag import Tag
from app.models.transaction import Transaction
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.categories.service import visible_filter

router = APIRouter(prefix="/api/v1/search", tags=["search"])

Entity = Literal["transaction", "account", "category", "tag", "rule", "statement"]


class SearchHit(BaseModel):
    entity: Entity
    id: str
    title: str
    subtitle: str | None = None
    href: str


class SearchResponse(BaseModel):
    q: str
    hits: list[SearchHit]


@router.get("", response_model=SearchResponse)
async def global_search(
    q: str = Query(min_length=1, max_length=120),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SearchResponse:
    term = q.strip()
    if not term:
        return SearchResponse(q=q, hits=[])
    pattern = f"%{term}%"
    per_entity = max(3, min(8, limit // 2))
    hits: list[SearchHit] = []

    tx_rows = await db.execute(
        select(Transaction, Account.name, Category.name)
        .join(Account, Account.id == Transaction.account_id)
        .outerjoin(Category, Category.id == Transaction.category_id)
        .where(
            Account.user_id == current_user.id,
            Transaction.user_id == current_user.id,
            or_(Transaction.description.ilike(pattern), Transaction.notes.ilike(pattern)),
        )
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .limit(per_entity)
    )
    for tx, account_name, category_name in tx_rows.all():
        hits.append(SearchHit(
            entity="transaction",
            id=str(tx.id),
            title=tx.description,
            subtitle=f"{tx.date.isoformat()} · {account_name} · {category_name or 'Sin categoria'} · {tx.currency} {tx.amount}",
            href=f"/transactions?search={term}",
        ))

    account_rows = await db.execute(
        select(Account)
        .where(Account.user_id == current_user.id, Account.name.ilike(pattern))
        .order_by(Account.name.asc())
        .limit(per_entity)
    )
    for account in account_rows.scalars().all():
        hits.append(SearchHit(
            entity="account",
            id=str(account.id),
            title=account.name,
            subtitle=f"{account.account_type} · {account.currency}",
            href="/accounts",
        ))

    category_rows = await db.execute(
        select(Category)
        .where(visible_filter(current_user.id), Category.name.ilike(pattern))
        .order_by(Category.user_id.is_not(None).desc(), Category.name.asc())
        .limit(per_entity)
    )
    for category in category_rows.scalars().all():
        hits.append(SearchHit(
            entity="category",
            id=str(category.id),
            title=category.name,
            subtitle="Categoria propia" if category.user_id else "Categoria del sistema",
            href="/categories",
        ))

    tag_rows = await db.execute(
        select(Tag)
        .where(Tag.user_id == current_user.id, Tag.name.ilike(pattern))
        .order_by(Tag.name.asc())
        .limit(per_entity)
    )
    for tag in tag_rows.scalars().all():
        hits.append(SearchHit(entity="tag", id=str(tag.id), title=tag.name, subtitle="Etiqueta", href="/tags"))

    rule_rows = await db.execute(
        select(CategoryRule, Category.name)
        .join(Category, Category.id == CategoryRule.target_category_id)
        .where(
            CategoryRule.user_id == current_user.id,
            or_(CategoryRule.pattern.ilike(pattern), Category.name.ilike(pattern)),
        )
        .order_by(CategoryRule.priority.desc(), CategoryRule.created_at.desc())
        .limit(per_entity)
    )
    for rule, category_name in rule_rows.all():
        hits.append(SearchHit(
            entity="rule",
            id=str(rule.id),
            title=rule.pattern,
            subtitle=f"Regla hacia {category_name}",
            href="/rules",
        ))

    statement_rows = await db.execute(
        select(UploadedFile, Account.name)
        .join(Account, Account.id == UploadedFile.account_id)
        .where(
            Account.user_id == current_user.id,
            UploadedFile.user_id == current_user.id,
            or_(UploadedFile.filename.ilike(pattern), UploadedFile.bank_detected.ilike(pattern)),
        )
        .order_by(UploadedFile.created_at.desc())
        .limit(per_entity)
    )
    for statement, account_name in statement_rows.all():
        hits.append(SearchHit(
            entity="statement",
            id=str(statement.id),
            title=statement.filename,
            subtitle=f"{account_name} · {statement.bank_detected or 'Banco no detectado'} · {statement.status}",
            href=f"/statements/{statement.id}",
        ))

    return SearchResponse(q=q, hits=hits[:limit])
