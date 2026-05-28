from __future__ import annotations

import datetime
import uuid
from decimal import Decimal
from pathlib import Path

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
from app.modules.statements.parser import StatementParseError, parse_statement_pdf
from app.modules.statements.schemas import (
    PreviewRowUpdate,
    PreviewSummary,
    StatementConfirmResponse,
    StatementPreviewOut,
    StatementUploadResponse,
    UploadedFileOut,
)

router = APIRouter(prefix="/api/v1/statements", tags=["statements"])


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


def _store_upload(current_user: User, file: UploadFile) -> Path:
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{current_user.id}-{uuid.uuid4()}-{file.filename or 'cartola.pdf'}"
    return upload_dir / safe_name


def _build_summary(rows: list[dict]) -> PreviewSummary:
    income = Decimal("0")
    expenses = Decimal("0")
    dates: list[datetime.date] = []
    for row in rows:
        amt = Decimal(str(row.get("amount", "0")))
        if row.get("movement_type") == "income":
            income += amt
        else:
            expenses += amt
        try:
            dates.append(datetime.date.fromisoformat(row["date"]))
        except (ValueError, KeyError):
            pass
    return PreviewSummary(
        total_rows=len(rows),
        total_income=str(income),
        total_expenses=str(expenses),
        date_start=min(dates).isoformat() if dates else None,
        date_end=max(dates).isoformat() if dates else None,
    )


async def _detect_duplicates(preview: StatementPreview, db: AsyncSession, current_user: User) -> list[str]:
    if not preview.rows:
        return []
    existing = await db.execute(
        select(Transaction.date, Transaction.description, Transaction.amount)
        .where(Transaction.user_id == current_user.id)
    )
    existing_set = {(r.date, r.description.strip().lower(), r.amount) for r in existing.all()}
    duplicates: list[str] = []
    for idx, row in enumerate(preview.rows):
        key = (
            datetime.date.fromisoformat(row["date"]),
            row["description"].strip().lower(),
            Decimal(str(row["amount"])),
        )
        if key in existing_set:
            duplicates.append(f"Fila {idx + 1}: {row['date']} - {row['description'][:60]} - {row['amount']}")
    return duplicates


def _preview_to_out(preview: StatementPreview) -> StatementPreviewOut:
    out = StatementPreviewOut.model_validate(preview)
    out.summary = _build_summary(preview.rows or [])
    return out


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
            user_id=preview.user_id,
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
async def list_previews(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[StatementPreviewOut]:
    result = await db.execute(select(StatementPreview).where(StatementPreview.user_id == current_user.id).order_by(StatementPreview.created_at.desc()))
    return [_preview_to_out(p) for p in result.scalars().all()]


@router.post("/preview", response_model=StatementPreviewOut, status_code=status.HTTP_201_CREATED)
async def create_preview(account_id: uuid.UUID, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> StatementPreviewOut:
    await _account_or_404(account_id, db, current_user)
    if file.content_type != "application/pdf":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Solo se aceptan PDFs")
    path = _store_upload(current_user, file)
    path.write_bytes(await file.read())
    try:
        parsed = parse_statement_pdf(path)
    except StatementParseError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"No se pudo parsear el PDF: {exc}") from exc
    preview = StatementPreview(account_id=account_id, user_id=current_user.id, filename=file.filename or path.name, stored_filename=str(path), bank_detected=parsed["bank_detected"], status="ready", rows=parsed["rows"])
    db.add(preview)
    await db.commit()
    await db.refresh(preview)
    return _preview_to_out(preview)


@router.get("/previews/{preview_id}", response_model=StatementPreviewOut)
async def get_preview(preview_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> StatementPreviewOut:
    preview = await _preview_or_404(preview_id, db, current_user)
    return _preview_to_out(preview)


@router.patch("/previews/{preview_id}/rows")
async def update_preview_rows(preview_id: uuid.UUID, body: PreviewRowUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> StatementPreviewOut:
    preview = await _preview_or_404(preview_id, db, current_user)
    preview.rows = [row.model_dump() for row in body.rows]
    await db.commit()
    await db.refresh(preview)
    return _preview_to_out(preview)


@router.delete("/previews/{preview_id}/rows/{idx}")
async def delete_preview_row(preview_id: uuid.UUID, idx: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> StatementPreviewOut:
    preview = await _preview_or_404(preview_id, db, current_user)
    rows = list(preview.rows or [])
    if idx < 0 or idx >= len(rows):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Índice fuera de rango: {idx} (total {len(rows)} filas)")
    del rows[idx]
    preview.rows = rows
    await db.commit()
    await db.refresh(preview)
    return _preview_to_out(preview)


@router.get("/previews/{preview_id}/duplicates")
async def check_duplicates(preview_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict[str, list[str]]:
    preview = await _preview_or_404(preview_id, db, current_user)
    duplicates = await _detect_duplicates(preview, db, current_user)
    return {"duplicates": duplicates}


@router.post("/previews/{preview_id}/confirm", response_model=StatementConfirmResponse)
async def confirm_preview(preview_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> StatementConfirmResponse:
    preview = await _preview_or_404(preview_id, db, current_user)
    account = await _account_or_404(preview.account_id, db, current_user)
    duplicates = await _detect_duplicates(preview, db, current_user)
    uploaded_file, count = await _create_uploaded_file_from_rows(preview, account, db)
    await db.delete(preview)
    await db.commit()
    await db.refresh(uploaded_file)
    return StatementConfirmResponse(uploaded_file=UploadedFileOut.model_validate(uploaded_file), imported_transactions=count, possible_duplicates=duplicates)


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
    rows = []
    if path:
        parsed = parse_statement_pdf(path)
        rows = parsed["rows"]
        uploaded_file.bank_detected = parsed["bank_detected"]
    for row in rows:
        db.add(Transaction(uploaded_file_id=uploaded_file.id, account_id=account.id, user_id=current_user.id, currency=account.currency, date=datetime.date.fromisoformat(row["date"]), description=row["description"], amount=Decimal(str(row["amount"])), movement_type=row["movement_type"]))
    if rows:
        dates = [datetime.date.fromisoformat(row["date"]) for row in rows]
        uploaded_file.period_start = min(dates)
        uploaded_file.period_end = max(dates)
    await db.commit()
    await db.refresh(uploaded_file)
    return StatementConfirmResponse(uploaded_file=UploadedFileOut.model_validate(uploaded_file), imported_transactions=len(rows))


@router.post("/upload", response_model=StatementUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_statement(account_id: uuid.UUID, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> StatementUploadResponse:
    preview = await create_preview(account_id, file, db, current_user)
    response = await confirm_preview(preview.id, db, current_user)
    return StatementUploadResponse(uploaded_file=response.uploaded_file, imported_transactions=response.imported_transactions)
