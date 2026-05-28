from __future__ import annotations

import datetime
import uuid
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.account import Account
from app.models.category_rule import CategoryRule
from app.models.transaction import Transaction
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.categories.service import ensure_category_visible
from app.modules.transactions.schemas import TransactionCreate, TransactionOut, TransactionUpdate

router = APIRouter(prefix="/api/v1/transactions", tags=["transactions"])


def _matches_rule(transaction: Transaction, rule: CategoryRule) -> bool:
    value = getattr(transaction, rule.field, "") or ""
    value_norm = str(value).lower()
    pattern = rule.pattern.lower()
    if rule.operator == "equals":
        return value_norm == pattern
    if rule.operator == "starts_with":
        return value_norm.startswith(pattern)
    return pattern in value_norm


async def _account_or_404(account_id: uuid.UUID, db: AsyncSession, current_user: User) -> Account:
    result = await db.execute(select(Account).where(Account.id == account_id, Account.user_id == current_user.id))
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada")
    return account


async def _transaction_or_404(transaction_id: uuid.UUID, db: AsyncSession, current_user: User) -> Transaction:
    result = await db.execute(
        select(Transaction)
        .join(Account)
        .options(
            selectinload(Transaction.account).selectinload(Account.institution),
            selectinload(Transaction.category),
        )
        .where(Transaction.id == transaction_id, Account.user_id == current_user.id)
    )
    transaction = result.scalar_one_or_none()
    if transaction is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transacción no encontrada")
    return transaction


async def _manual_uploaded_file(account: Account, db: AsyncSession, current_user: User) -> UploadedFile:
    uploaded_file = UploadedFile(
        account_id=account.id,
        user_id=current_user.id,
        filename="manual-entry",
        bank_detected="manual",
        status="processed",
    )
    db.add(uploaded_file)
    await db.flush()
    return uploaded_file


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    search: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Transaction]:
    query = (
        select(Transaction)
        .join(Account)
        .options(
            selectinload(Transaction.account).selectinload(Account.institution),
            selectinload(Transaction.category),
        )
        .where(Account.user_id == current_user.id)
    )
    if account_id is not None:
        query = query.where(Transaction.account_id == account_id)
    if category_id is not None:
        query = query.where(Transaction.category_id == category_id)
    if start_date is not None:
        query = query.where(Transaction.date >= start_date)
    if end_date is not None:
        query = query.where(Transaction.date <= end_date)
    if search:
        query = query.where(Transaction.description.ilike(f"%{search}%"))
    query = query.order_by(Transaction.date.desc(), Transaction.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/export/excel")
async def export_transactions_excel(
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    query = (
        select(Transaction)
        .join(Account)
        .options(selectinload(Transaction.account), selectinload(Transaction.category))
        .where(Account.user_id == current_user.id)
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
    )
    if start_date is not None:
        query = query.where(Transaction.date >= start_date)
    if end_date is not None:
        query = query.where(Transaction.date <= end_date)
    result = await db.execute(query)
    rows = list(result.scalars().all())

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Transacciones"
    sheet.append(["Fecha", "Descripción", "Cuenta", "Categoría", "Tipo", "Moneda", "Monto"])
    for transaction in rows:
        sheet.append([
            transaction.date.isoformat(),
            transaction.description,
            transaction.account.name if transaction.account else "",
            transaction.category.name if transaction.category else "",
            transaction.movement_type,
            transaction.currency,
            float(transaction.amount),
        ])

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=transacciones.xlsx"},
    )


@router.post("/auto-categorize")
async def auto_categorize_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    rules_result = await db.execute(
        select(CategoryRule)
        .where(CategoryRule.user_id == current_user.id)
        .order_by(CategoryRule.priority.desc(), CategoryRule.created_at.asc())
    )
    rules = list(rules_result.scalars().all())
    if not rules:
        return {"updated": 0}

    tx_result = await db.execute(
        select(Transaction)
        .join(Account)
        .where(Account.user_id == current_user.id, Transaction.category_id.is_(None))
    )
    updated = 0
    for transaction in tx_result.scalars().all():
        for rule in rules:
            if _matches_rule(transaction, rule):
                transaction.category_id = rule.target_category_id
                transaction.rule_id = rule.id
                updated += 1
                break
    await db.commit()
    return {"updated": updated}


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    body: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Transaction:
    account = await _account_or_404(body.account_id, db, current_user)
    await ensure_category_visible(body.category_id, db, current_user.id)
    uploaded_file = await _manual_uploaded_file(account, db, current_user)
    transaction = Transaction(uploaded_file_id=uploaded_file.id, user_id=current_user.id, **body.model_dump())
    db.add(transaction)
    await db.flush()
    transaction_id = transaction.id
    await db.commit()
    return await _transaction_or_404(transaction_id, db, current_user)


@router.get("/{transaction_id}", response_model=TransactionOut)
async def get_transaction(transaction_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Transaction:
    return await _transaction_or_404(transaction_id, db, current_user)


@router.patch("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(
    transaction_id: uuid.UUID,
    body: TransactionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Transaction:
    transaction = await _transaction_or_404(transaction_id, db, current_user)
    changes = body.model_dump(exclude_unset=True)
    if "account_id" in changes and changes["account_id"] is not None:
        await _account_or_404(changes["account_id"], db, current_user)
    if "category_id" in changes:
        await ensure_category_visible(changes["category_id"], db, current_user.id)
    for field, value in changes.items():
        setattr(transaction, field, value)
    await db.commit()
    return await _transaction_or_404(transaction_id, db, current_user)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(transaction_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    transaction = await _transaction_or_404(transaction_id, db, current_user)
    await db.delete(transaction)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
