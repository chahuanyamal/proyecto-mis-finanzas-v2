from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent


async def log_audit(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    db.add(AuditEvent(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_json=metadata or None,
    ))
