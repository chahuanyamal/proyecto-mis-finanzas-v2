"""Router para importar archivos OFX/QFX (Open Financial Exchange)."""
from __future__ import annotations

import datetime
import uuid
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.audit.service import log_audit
from app.modules.parsers.ofx import parse_ofx

router = APIRouter(prefix="/api/v1/ofx", tags=["ofx"])

_OFX_CONTENT_TYPES = {
    "application/x-ofx",
    "application/x-ofx+xml",
    "text/x-ofx",
    "text/xml",
    "application/xml",
    "text/plain",
}


def _store_ofx(current_user: User, file: UploadFile) -> Path:
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{current_user.id}-{uuid.uuid4()}-{file.filename or 'import.ofx'}"
    return upload_dir / safe_name


async def _account_or_404(account_id: uuid.UUID, db: AsyncSession, current_user: User) -> Account:
    from sqlalchemy import select
    result = await db.execute(select(Account).where(Account.id == account_id, Account.user_id == current_user.id))
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada")
    return account


@router.post("/preview")
async def ofx_preview(
    account_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Parsea un archivo OFX y retorna los movimientos para preview antes de confirmar."""
    account = await _account_or_404(account_id, db, current_user)
    content_type = file.content_type or ""
    if content_type not in _OFX_CONTENT_TYPES and not file.filename.lower().endswith((".ofx", ".qfx")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Solo se aceptan archivos .ofx o .qfx")

    path = _store_ofx(current_user, file)
    path.write_bytes(await file.read())

    try:
        content = path.read_bytes()
        result = parse_ofx(content)
    except Exception as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"No se pudo parsear el archivo OFX: {exc}") from exc

    if not result.transactions:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "El archivo no contiene transacciones reconocibles")

    rows = [
        {
            "date": tx["date"].isoformat(),
            "description": tx["description"],
            "amount": str(tx["amount"]),
            "movement_type": tx["movement_type"],
        }
        for tx in result.transactions
    ]

    income = sum(Decimal(str(tx["amount"])) for tx in result.transactions if tx["movement_type"] == "income")
    expenses = sum(Decimal(str(tx["amount"])) for tx in result.transactions if tx["movement_type"] == "expense")

    return {
        "account_id": str(account_id),
        "account_type": result.account_type,
        "bank_detected": result.bank_detected,
        "currency": result.currency,
        "period_start": result.period_start.isoformat() if result.period_start else None,
        "period_end": result.period_end.isoformat() if result.period_end else None,
        "opening_balance": str(result.opening_balance) if result.opening_balance else None,
        "closing_balance": str(result.closing_balance) if result.closing_balance else None,
        "row_count": len(rows),
        "total_income": str(income),
        "total_expenses": str(expenses),
        "rows": rows,
    }


@router.post("/confirm")
async def ofx_confirm(
    account_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Parsea e importa un archivo OFX directamente (sin preview)."""
    account = await _account_or_404(account_id, db, current_user)
    content_type = file.content_type or ""
    if content_type not in _OFX_CONTENT_TYPES and not file.filename.lower().endswith((".ofx", ".qfx")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Solo se aceptan archivos .ofx o .qfx")

    path = _store_ofx(current_user, file)
    path.write_bytes(await file.read())

    try:
        content = path.read_bytes()
        result = parse_ofx(content)
    except Exception as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"No se pudo parsear el archivo OFX: {exc}") from exc

    if not result.transactions:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "El archivo no contiene transacciones reconocibles")

    uploaded_file = UploadedFile(
        account_id=account_id,
        user_id=current_user.id,
        filename=file.filename or "ofx-import.ofx",
        bank_detected=result.bank_detected,
        opening_balance=result.opening_balance,
        closing_balance=result.closing_balance,
        status="processed",
    )
    db.add(uploaded_file)
    await db.flush()

    imported = 0
    for tx in result.transactions:
        db.add(Transaction(
            uploaded_file_id=uploaded_file.id,
            account_id=account_id,
            user_id=current_user.id,
            currency=account.currency,
            date=tx["date"],
            description=tx["description"],
            amount=Decimal(str(tx["amount"])),
            movement_type=tx["movement_type"],
        ))
        imported += 1

    if result.period_start and result.period_end:
        uploaded_file.period_start = result.period_start
        uploaded_file.period_end = result.period_end

    await log_audit(
        db,
        user_id=current_user.id,
        action="import_ofx",
        entity_type="statement",
        entity_id=str(uploaded_file.id),
        metadata={"filename": file.filename, "transactions": imported, "bank": result.bank_detected},
    )
    await db.commit()

    return {
        "uploaded_file_id": str(uploaded_file.id),
        "imported_transactions": imported,
        "bank_detected": result.bank_detected,
        "period_start": result.period_start.isoformat() if result.period_start else None,
        "period_end": result.period_end.isoformat() if result.period_end else None,
    }