from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.settings.schemas import SettingsOut, SettingsUpdate

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
async def get_settings(current_user: User = Depends(get_current_user)) -> SettingsOut:
    return SettingsOut(
        email=current_user.email,
        full_name=current_user.full_name,
        preferences=current_user.preferences or {},
    )


@router.patch("", response_model=SettingsOut)
async def update_settings(
    body: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SettingsOut:
    if body.full_name is not None:
        current_user.full_name = body.full_name
    if body.preferences is not None:
        merged = dict(current_user.preferences or {})
        merged.update(body.preferences)
        current_user.preferences = merged
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return SettingsOut(
        email=current_user.email,
        full_name=current_user.full_name,
        preferences=current_user.preferences or {},
    )
