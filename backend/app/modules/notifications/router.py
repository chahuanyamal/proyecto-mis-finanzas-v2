from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.notifications.schemas import NotificationCount, NotificationOut

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    limit: int = 50,
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Notification]:
    query = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/count", response_model=NotificationCount)
async def count_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationCount:
    total_q = select(func.count(Notification.id)).where(Notification.user_id == current_user.id)
    unread_q = select(func.count(Notification.id)).where(Notification.user_id == current_user.id, Notification.read_at.is_(None))
    total = (await db.execute(total_q)).scalar_one()
    unread = (await db.execute(unread_q)).scalar_one()
    return NotificationCount(total=total, unread=unread)


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Notification | None:
    result = await db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == current_user.id)
        .values(read_at=func.now())
        .returning(Notification)
    )
    await db.commit()
    notification = result.scalar_one_or_none()
    return notification


@router.post("/read-all", response_model=NotificationCount)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationCount:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .values(read_at=func.now())
    )
    await db.commit()
    return NotificationCount(total=0, unread=0)
