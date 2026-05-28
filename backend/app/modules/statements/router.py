from __future__ import annotations

import datetime
import re
import uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pdfplumber
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.statements.schemas import StatementUploadResponse, UploadedFileOut

router = APIRouter(prefix="/api/v1/statements", tags=["statements"])

_LINE_RE = re.compile(r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(?P<description>.+?)\s+(?P<amount>-?\$?\s?[\d\.,]+)\s*$")


async def _account_or_404(account_id: uuid.UUID, db: AsyncSession, current_user: User) -> Account:
    result = await db.execute(select(Account).where(Account.id == account_id, Account.user_id == current_user.id))
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada")
    return account


def _parse_date(value: str) -> datetime.date | None:
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y"):
        try:
            return datetime.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(value: str) -> Decimal | None:
    cleaned = value.replace("$", "").replace(" ", "").replace(".", "").replace(",", ".")
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _extract_transactions(path: Path) -> list[dict]:
    rows: list[dict] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for line in text.splitlines():
                match = _LINE_RE.search(line.strip())
                if not match:
                    continue
                date = _parse_date(match.group("date"))
                amount = _parse_amount(match.group("amount"))
                if date is None or amount is None:
                    continue
                rows.append({
                    "date": date,
                    "description": match.group("description").strip()[:500],
                    "amount": abs(amount),
                    "movement_type": "income" if amount > 0 else "expense",
                })
    return rows


@router.get("", response_model=list[UploadedFileOut])
async def list_statements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[UploadedFile]:
    result = await db.execute(select(UploadedFile).where(UploadedFile.user_id == current_user.id).order_by(UploadedFile.created_at.desc()))
    return list(result.scalars().all())


@router.post("/upload", response_model=StatementUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_statement(
    account_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StatementUploadResponse:
    account = await _account_or_404(account_id, db, current_user)
    if file.content_type != "application/pdf":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Solo se aceptan PDFs")

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{current_user.id}-{uuid.uuid4()}-{file.filename or 'cartola.pdf'}"
    path = upload_dir / safe_name
    path.write_bytes(await file.read())

    uploaded_file = UploadedFile(
        account_id=account.id,
        user_id=current_user.id,
        filename=file.filename or safe_name,
        bank_detected="fallback",
        status="processing",
    )
    db.add(uploaded_file)
    await db.flush()

    try:
        parsed_rows = _extract_transactions(path)
        for row in parsed_rows:
            db.add(Transaction(uploaded_file_id=uploaded_file.id, account_id=account.id, currency=account.currency, **row))
        uploaded_file.status = "processed"
        if parsed_rows:
            dates = [row["date"] for row in parsed_rows]
            uploaded_file.period_start = min(dates)
            uploaded_file.period_end = max(dates)
        await db.commit()
    except Exception as exc:
        uploaded_file.status = "failed"
        await db.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"No se pudo parsear el PDF: {exc}") from exc

    await db.refresh(uploaded_file)
    return StatementUploadResponse(uploaded_file=UploadedFileOut.model_validate(uploaded_file), imported_transactions=len(parsed_rows))
