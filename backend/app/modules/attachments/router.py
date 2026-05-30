from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.account import Account
from app.models.attachment import Attachment
from app.models.transaction import Transaction
from app.models.user import User
from app.modules.attachments.schemas import AttachmentOut
from app.modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/v1", tags=["attachments"])

_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED = {
    "application/pdf", "image/png", "image/jpeg", "image/jpg",
    "image/webp", "image/heic", "image/gif",
}


def _base_dir() -> Path:
    d = Path(settings.UPLOAD_DIR) / "attachments"
    d.mkdir(parents=True, exist_ok=True)
    return d


async def _owned_transaction(transaction_id: uuid.UUID, db: AsyncSession, user: User) -> Transaction:
    row = await db.execute(
        select(Transaction).join(Account).where(
            Transaction.id == transaction_id, Account.user_id == user.id, Transaction.user_id == user.id
        )
    )
    tx = row.scalar_one_or_none()
    if tx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transacción no encontrada")
    return tx


async def _owned_attachment(attachment_id: uuid.UUID, db: AsyncSession, user: User) -> Attachment:
    row = await db.execute(
        select(Attachment).where(Attachment.id == attachment_id, Attachment.user_id == user.id)
    )
    att = row.scalar_one_or_none()
    if att is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comprobante no encontrado")
    return att


@router.get("/transactions/{transaction_id}/attachments", response_model=list[AttachmentOut])
async def list_attachments(
    transaction_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Attachment]:
    await _owned_transaction(transaction_id, db, current_user)
    rows = await db.execute(
        select(Attachment).where(Attachment.transaction_id == transaction_id).order_by(Attachment.created_at.desc())
    )
    return list(rows.scalars().all())


@router.post("/transactions/{transaction_id}/attachments", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    transaction_id: uuid.UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Attachment:
    await _owned_transaction(transaction_id, db, current_user)
    content_type = (file.content_type or "application/octet-stream").lower()
    if content_type not in _ALLOWED:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Formato no permitido (PDF o imagen)")
    content = await file.read(_MAX_BYTES + 1)
    if len(content) > _MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Archivo demasiado grande (máx 10MB)")
    att_id = uuid.uuid4()
    suffix = Path(file.filename or "").suffix[:12]
    stored = _base_dir() / f"{current_user.id}_{att_id}{suffix}"
    stored.write_bytes(content)
    att = Attachment(
        id=att_id, user_id=current_user.id, transaction_id=transaction_id,
        filename=(file.filename or "comprobante")[:255], content_type=content_type,
        size=len(content), storage_path=str(stored),
    )
    db.add(att)
    await db.commit()
    await db.refresh(att)
    return att


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = await _owned_attachment(attachment_id, db, current_user)
    path = Path(att.storage_path)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Archivo no disponible")
    return FileResponse(path, media_type=att.content_type, filename=att.filename)


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = await _owned_attachment(attachment_id, db, current_user)
    try:
        Path(att.storage_path).unlink(missing_ok=True)
    except OSError:
        pass
    await db.delete(att)
    await db.commit()
    from fastapi import Response
    return Response(status_code=status.HTTP_204_NO_CONTENT)
