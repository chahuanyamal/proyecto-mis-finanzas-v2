from __future__ import annotations

import datetime
import re
import uuid
from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.recurring import RecurringExpense
from app.models.transaction import Transaction
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.categories.service import ensure_category_visible
from app.modules.recurring.schemas import (
    RecurringCreate,
    RecurringDetectItem,
    RecurringDetectResult,
    RecurringOut,
    RecurringUpdate,
    UpcomingRecurring,
)

router = APIRouter(prefix="/api/v1/recurring", tags=["recurring"])


def _normalize_description(value: str) -> str:
    clean = re.sub(r"\b\d{2,}\b", "", value.lower())
    clean = re.sub(r"[^a-záéíóúñü0-9\s.-]", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return " ".join(clean.split(" ")[:4]) or value[:80]


def _add_period(value: datetime.date, frequency: str) -> datetime.date:
    if frequency == "weekly":
        return value + datetime.timedelta(days=7)
    if frequency == "yearly":
        try:
            return value.replace(year=value.year + 1)
        except ValueError:
            return value.replace(year=value.year + 1, day=28)
    month = value.month
    year = value.year + (month // 12)
    next_month = month % 12 + 1
    day = min(value.day, 28)
    return datetime.date(year, next_month, day)


def _guess_frequency(dates: list[datetime.date]) -> str | None:
    if len(dates) < 2:
        return None
    gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
    avg = sum(gaps) / len(gaps)
    if 5 <= avg <= 9:
        return "weekly"
    if 24 <= avg <= 38:
        return "monthly"
    if 330 <= avg <= 400:
        return "yearly"
    return None


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
    await ensure_category_visible(body.category_id, db, current_user.id)
    item = RecurringExpense(user_id=current_user.id, **body.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def _collect_candidates(db: AsyncSession, current_user: User) -> list[RecurringDetectItem]:
    """Detecta patrones recurrentes sin registrarlos (preview)."""
    result = await db.execute(
        select(Transaction)
        .where(
            Transaction.user_id == current_user.id,
            Transaction.is_internal_transfer.is_(False),
            Transaction.is_duplicate.is_(False),
        )
        .order_by(Transaction.date.asc())
    )
    grouped: dict[tuple[str, str, str, str], list[Transaction]] = defaultdict(list)
    for tx in result.scalars().all():
        amount = Decimal(tx.amount or 0).quantize(Decimal("1"))
        key = (_normalize_description(tx.description), str(amount), tx.currency, tx.movement_type)
        grouped[key].append(tx)

    existing = await db.execute(select(RecurringExpense).where(RecurringExpense.user_id == current_user.id))
    existing_keys = {
        (_normalize_description(item.name), str(Decimal(item.amount or 0).quantize(Decimal("1"))), item.currency, item.movement_type)
        for item in existing.scalars().all()
    }

    candidates: list[RecurringDetectItem] = []
    for (name, amount, currency, movement_type), rows in grouped.items():
        if len(rows) < 3 or (name, amount, currency, movement_type) in existing_keys:
            continue
        dates = [tx.date for tx in rows]
        frequency = _guess_frequency(dates)
        if frequency is None:
            continue
        candidates.append(RecurringDetectItem(
            name=name.title(),
            amount=Decimal(amount),
            currency=currency,
            movement_type=movement_type,
            frequency=frequency,
            next_date=_add_period(max(dates), frequency),
            occurrences=len(rows),
        ))
    candidates.sort(key=lambda c: c.occurrences, reverse=True)
    return candidates


@router.get("/detect/candidates", response_model=RecurringDetectResult)
async def detect_candidates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecurringDetectResult:
    """Patrones recurrentes detectados SIN registrarlos, para confirmar uno a uno."""
    candidates = await _collect_candidates(db, current_user)
    return RecurringDetectResult(detected=len(candidates), created=0, items=candidates)


@router.post("/detect", response_model=RecurringDetectResult)
async def detect_recurring(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecurringDetectResult:
    candidates = await _collect_candidates(db, current_user)
    created = 0
    for item in candidates:
        db.add(RecurringExpense(
            user_id=current_user.id,
            name=item.name,
            amount=item.amount,
            currency=item.currency,
            frequency=item.frequency,
            movement_type=item.movement_type,
            next_date=item.next_date,
            active=True,
        ))
        created += 1
    if created:
        await db.commit()
    return RecurringDetectResult(detected=len(candidates), created=created, items=candidates)


@router.get("/upcoming", response_model=list[UpcomingRecurring])
async def upcoming_recurring(
    days: int = Query(default=45, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[UpcomingRecurring]:
    today = datetime.date.today()
    end = today + datetime.timedelta(days=days)
    result = await db.execute(
        select(RecurringExpense)
        .where(RecurringExpense.user_id == current_user.id, RecurringExpense.active.is_(True), RecurringExpense.next_date.is_not(None))
        .order_by(RecurringExpense.next_date.asc())
    )
    upcoming: list[UpcomingRecurring] = []
    for item in result.scalars().all():
        due = item.next_date
        if due is None:
            continue
        while due < today:
            due = _add_period(due, item.frequency)
        if due <= end:
            upcoming.append(UpcomingRecurring(
                id=item.id,
                name=item.name,
                amount=item.amount,
                currency=item.currency,
                movement_type=item.movement_type,
                frequency=item.frequency,
                due_date=due,
                days_until=(due - today).days,
            ))
    return sorted(upcoming, key=lambda item: item.due_date)


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
        await ensure_category_visible(changes["category_id"], db, current_user.id)
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
