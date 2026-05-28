from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.tag import Tag
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.tags.schemas import TagCreate, TagOut, TagUpdate

router = APIRouter(prefix="/api/v1/tags", tags=["tags"])


async def _tag_or_404(tag_id: uuid.UUID, db: AsyncSession, current_user: User) -> Tag:
    result = await db.execute(select(Tag).where(Tag.id == tag_id, Tag.user_id == current_user.id))
    tag = result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag no encontrado")
    return tag


@router.get("", response_model=list[TagOut])
async def list_tags(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[Tag]:
    result = await db.execute(select(Tag).where(Tag.user_id == current_user.id).order_by(Tag.name))
    return list(result.scalars().all())


@router.post("", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(body: TagCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Tag:
    tag = Tag(user_id=current_user.id, **body.model_dump())
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.patch("/{tag_id}", response_model=TagOut)
async def update_tag(tag_id: uuid.UUID, body: TagUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Tag:
    tag = await _tag_or_404(tag_id, db, current_user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tag, field, value)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(tag_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    tag = await _tag_or_404(tag_id, db, current_user)
    await db.delete(tag)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
