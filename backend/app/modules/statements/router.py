from __future__ import annotations

import datetime
import re
import uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pdfplumber
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.account import Account
from app.models.statement_preview import StatementPreview
from app.models.transaction import Transaction
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.statements.schemas import StatementConfirmResponse, StatementPreviewOut, StatementUploadResponse, UploadedFileOut

router = APIRouter(prefix="/api/v1/statements", tags=["statements"])
_LINE_RE = re.compile(r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(?P<description>.+?)\s+(?P<amount>-?\$?\s?[\d\.,]+)\s*$")


async def _account_or_404(account_id: uuid.UUID, db: AsyncSession, current_user: User) -> Account:
    result = await db.execute(select(Account).where(Account.id == account_id, Account.user_id == current_user.id))
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada")
    return account


async def _preview_or_404(preview_id: uuid.UUID, db: AsyncSession, current_user: User) -> StatementPreview:
    result = await db.execute(select(StatementPreview).where(StatementPreview.id == preview_id, StatementPreview.user_id == current_user.id))
    preview = result.scalar_one_or_none()
    if preview is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Preview no encontrado")
    return preview


async def _uploaded_file_or_404(uploaded_file_id: uuid.UUID, db: AsyncSession, current_user: User) -> UploadedFile:
    result = await db.execute(select(UploadedFile).where(UploadedFile.id == uploaded_file_id, UploadedFile.user_id == current_user.id))
    uploaded_file = result.scalar_one_or_none()
    if uploaded_file is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cartola no encontrada")
    return uploaded_file


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
            for line in (page.extract_text() or "").splitlines():
                match = _LINE_RE.search(line.strip())
                if not match:
                    continue
                date = _parse_date(match.group("date"))
                amount = _parse_amount(match.group("amount"))
                if date is None or amount is None:
                    continue
                rows.append({
                    "date": date.isoformat(),
                    "description": match.group("description").strip()[:500],
                    "amount": str(abs(amount)),
                    "movement_type": "income" if amount > 0 else "expense",
                })
    return rows


def _store_upload(current_user: User, file: UploadFile) -> Path:
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{current_user.id}-{uuid.uuid4()}-{file.filename or 'cartola.pdf'}"
    return upload_dir / safe_name


async def _create_uploaded_file_from_rows(preview: StatementPreview, account: Account, db: AsyncSession) -> tuple[UploadedFile, int]:
    uploaded_file = UploadedFile(
        account_id=preview.account_id,
        user_id=preview.user_id,
        filename=preview.filename,
        bank_detected=preview.bank_detected or "fallback",
        status="processed",
    )
    db.add(uploaded_file)
    await db.flush()
    rows = preview.rows or []
    for row in rows:
        db.add(Transaction(
            uploaded_file_id=uploaded_file.id,
            account_id=preview.account_id,
            currency=account.currency,
            date=datetime.date.fromisoformat(row["date"]),
            description=row["description"],
            amount=Decimal(str(row["amount"])),
            movement_type=row["movement_type"],
        ))
    if rows:
        dates = [datetime.date.fromisoformat(row["date"]) for row in rows]
        uploaded_file.period_start = min(dates)
        uploaded_file.period_end = max(dates)
    return uploaded_file, len(rows)


@router.get("", response_model=list[UploadedFileOut])
async def list_statements(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[UploadedFile]:
    result = await db.execute(select(UploadedFile).where(UploadedFile.user_id == current_user.id).order_by(UploadedFile.created_at.desc()))
    return list(result.scalars().all())


@router.get("/previews", response_model=list[StatementPreviewOut])
async def list_previews(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[StatementPreview]:
    result = await db.execute(select(StatementPreview).where(StatementPreview.user_id == current_user.id).order_by(StatementPreview.created_at.desc()))
    return list(result.scalars().all())


@router.post("/preview", response_model=StatementPreviewOut, status_code=status.HTTP_201_CREATED)
async def create_preview(account_id: uuid.UUID, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> StatementPreview:
    await _account_or_404(account_id, db, current_user)
    if file.content_type != "application/pdf":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Solo se aceptan PDFs")
    path = _store_upload(current_user, file)
    path.write_bytes(await file.read())
    rows = _extract_transactions(path)
    preview = StatementPreview(account_id=account_id, user_id=current_user.id, filename=file.filename or path.name, stored_filename=str(path), bank_detected="fallback", status="ready", rows=rows)
    db.add(preview)
    await db.commit()
    await db.refresh(preview)
    return preview


@router.get("/previews/{preview_id}", response_model=StatementPreviewOut)
async def get_preview(preview_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> StatementPreview:
    return await _preview_or_404(preview_id, db, current_user)


@router.post("/previews/{preview_id}/confirm", response_model=StatementConfirmResponse)
async def confirm_preview(preview_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> StatementConfirmResponse:
    preview = await _preview_or_404(preview_id, db, current_user)
    account = await _account_or_404(preview.account_id, db, current_user)
    uploaded_file, count = await _create_uploaded_file_from_rows(preview, account, db)
    await db.delete(preview)
    await db.commit()
    await db.refresh(uploaded_file)
    return StatementConfirmResponse(uploaded_file=UploadedFileOut.model_validate(uploaded_file), imported_transactions=count)


@router.post("/previews/{preview_id}/cancel")
async def cancel_preview(preview_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict[str, bool]:
    preview = await _preview_or_404(preview_id, db, current_user)
    await db.delete(preview)
    await db.commit()
    return {"ok": True}


@router.get("/history/{uploaded_file_id}")
async def statement_detail(uploaded_file_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    uploaded_file = await _uploaded_file_or_404(uploaded_file_id, db, current_user)
    result = await db.execute(select(Transaction).where(Transaction.uploaded_file_id == uploaded_file.id).order_by(Transaction.date))
    transactions = result.scalars().all()
    return {"uploaded_file": UploadedFileOut.model_validate(uploaded_file), "transactions": [{"id": str(tx.id), "date": tx.date.isoformat(), "description": tx.description, "amount": str(tx.amount), "movement_type": tx.movement_type} for tx in transactions]}


@router.post("/history/{uploaded_file_id}/reprocess", response_model=StatementConfirmResponse)
async def reprocess_statement(uploaded_file_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> StatementConfirmResponse:
    uploaded_file = await _uploaded_file_or_404(uploaded_file_id, db, current_user)
    account = await _account_or_404(uploaded_file.account_id, db, current_user)
    await db.execute(delete(Transaction).where(Transaction.uploaded_file_id == uploaded_file.id))
    path = next(Path(settings.UPLOAD_DIR).glob(f"{current_user.id}-*-{uploaded_file.filename}"), None)
    rows = _extract_transactions(path) if path else []
    for row in rows:
        db.add(Transaction(uploaded_file_id=uploaded_file.id, account_id=account.id, currency=account.currency, date=datetime.date.fromisoformat(row["date"]), description=row["description"], amount=Decimal(str(row["amount"])), movement_type=row["movement_type"]))
    await db.commit()
    await db.refresh(uploaded_file)
    return StatementConfirmResponse(uploaded_file=UploadedFileOut.model_validate(uploaded_file), imported_transactions=len(rows))


@router.post("/upload", response_model=StatementUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_statement(account_id: uuid.UUID, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> StatementUploadResponse:
    preview = await create_preview(account_id, file, db, current_user)
    response = await confirm_preview(preview.id, db, current_user)
    return StatementUploadResponse(uploaded_file=response.uploaded_file, imported_transactions=response.imported_transactions)
