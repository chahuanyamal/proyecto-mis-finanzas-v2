from __future__ import annotations

import datetime
import csv
import io
import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_serializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.audit import AuditEvent
from app.models.user import User
from app.modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


class AuditEventOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    action: str
    entity_type: str
    entity_id: str | None
    metadata_json: dict | None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}

    @field_serializer("id", "user_id")
    def serialize_uuid(self, value: uuid.UUID) -> str:
        return str(value)


@router.get("", response_model=list[AuditEventOut])
async def list_audit_events(
    entity_type: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AuditEvent]:
    query = select(AuditEvent).where(AuditEvent.user_id == current_user.id)
    if entity_type:
        query = query.where(AuditEvent.entity_type == entity_type)
    result = await db.execute(query.order_by(AuditEvent.created_at.desc()).limit(limit))
    return list(result.scalars().all())


@router.get("/export.csv")
async def export_audit_events(
    entity_type: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=1000, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    rows = await list_audit_events(entity_type=entity_type, limit=limit, db=db, current_user=current_user)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["created_at", "action", "entity_type", "entity_id", "metadata"])
    for row in rows:
        writer.writerow([row.created_at.isoformat(), row.action, row.entity_type, row.entity_id or "", row.metadata_json or {}])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=audit.csv"})
