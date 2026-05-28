from __future__ import annotations

import csv
import datetime
import io
import uuid
from decimal import Decimal
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.account import Account
from app.models.category import Category
from app.models.category_rule import CategoryRule
from app.models.tag import Tag
from app.models.transaction import Transaction
from app.models.transaction_split import TransactionSplit
from app.models.transaction_tag import TransactionTag
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.accounts.schemas import AccountOut
from app.modules.categories.schemas import CategoryOut
from app.modules.tags.schemas import TagOut
from app.modules.transactions.schemas import (
    BulkCategoryIn,
    BulkDeleteIn,
    BulkTagsIn,
    CurrencyTotals,
    FlagIn,
    NotesIn,
    SplitIn,
    SplitOut,
    TagsIn,
    TransactionCreate,
    TransactionOut,
    TransactionSummary,
    TransactionUpdate,
)

router = APIRouter(prefix="/api/v1/transactions", tags=["transactions"])

_LOAD_OPTIONS = (
    selectinload(Transaction.account).selectinload(Account.institution),
    selectinload(Transaction.category),
    selectinload(Transaction.tags).selectinload(TransactionTag.tag),
    selectinload(Transaction.splits).selectinload(TransactionSplit.category),
)


def _to_out(tx: Transaction) -> TransactionOut:
    return TransactionOut(
        id=tx.id,
        uploaded_file_id=tx.uploaded_file_id,
        account_id=tx.account_id,
        category_id=tx.category_id,
        date=tx.date,
        description=tx.description,
        amount=tx.amount,
        currency=tx.currency,
        movement_type=tx.movement_type,
        notes=tx.notes,
        is_flagged=tx.is_flagged,
        flag_reason=tx.flag_reason,
        is_internal_transfer=tx.is_internal_transfer,
        is_duplicate=tx.is_duplicate,
        account=AccountOut.model_validate(tx.account) if tx.account else None,
        category=CategoryOut.model_validate(tx.category) if tx.category else None,
        tags=[TagOut.model_validate(tt.tag) for tt in tx.tags if tt.tag is not None],
        splits=[SplitOut.model_validate(split) for split in tx.splits],
    )


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


async def _category_or_404(category_id: uuid.UUID | None, db: AsyncSession) -> None:
    if category_id is None:
        return
    result = await db.execute(select(Category.id).where(Category.id == category_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoría no encontrada")


async def _transaction_or_404(transaction_id: uuid.UUID, db: AsyncSession, current_user: User) -> Transaction:
    result = await db.execute(
        select(Transaction)
        .join(Account)
        .options(*_LOAD_OPTIONS)
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


def _apply_filters(
    query: Select,
    *,
    account_id: uuid.UUID | None,
    category_id: uuid.UUID | None,
    statement_id: uuid.UUID | None,
    start_date: datetime.date | None,
    end_date: datetime.date | None,
    movement_type: str | None,
    currency: str | None,
    search: str | None,
    only_uncategorized: bool,
    only_flagged: bool,
    exclude_internal: bool,
    exclude_duplicates: bool,
) -> Select:
    if account_id is not None:
        query = query.where(Transaction.account_id == account_id)
    if category_id is not None:
        query = query.where(Transaction.category_id == category_id)
    if statement_id is not None:
        query = query.where(Transaction.uploaded_file_id == statement_id)
    if start_date is not None:
        query = query.where(Transaction.date >= start_date)
    if end_date is not None:
        query = query.where(Transaction.date <= end_date)
    if movement_type is not None:
        query = query.where(Transaction.movement_type == movement_type)
    if currency is not None:
        query = query.where(Transaction.currency == currency)
    if search:
        query = query.where(Transaction.description.ilike(f"%{search}%"))
    if only_uncategorized:
        query = query.where(Transaction.category_id.is_(None))
    if only_flagged:
        query = query.where(Transaction.is_flagged.is_(True))
    if exclude_internal:
        query = query.where(Transaction.is_internal_transfer.is_(False))
    if exclude_duplicates:
        query = query.where(Transaction.is_duplicate.is_(False))
    return query


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    statement_id: uuid.UUID | None = None,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    movement_type: str | None = Query(default=None, pattern=r"^(income|expense)$"),
    currency: str | None = Query(default=None, max_length=3),
    search: str | None = Query(default=None, max_length=200),
    only_uncategorized: bool = False,
    only_flagged: bool = False,
    exclude_internal: bool = False,
    exclude_duplicates: bool = False,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TransactionOut]:
    query = select(Transaction).join(Account).options(*_LOAD_OPTIONS).where(Account.user_id == current_user.id)
    query = _apply_filters(
        query,
        account_id=account_id,
        category_id=category_id,
        statement_id=statement_id,
        start_date=start_date,
        end_date=end_date,
        movement_type=movement_type,
        currency=currency,
        search=search,
        only_uncategorized=only_uncategorized,
        only_flagged=only_flagged,
        exclude_internal=exclude_internal,
        exclude_duplicates=exclude_duplicates,
    )
    query = query.order_by(Transaction.date.desc(), Transaction.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    return [_to_out(tx) for tx in result.scalars().all()]


@router.get("/summary", response_model=TransactionSummary)
async def transactions_summary(
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    statement_id: uuid.UUID | None = None,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    movement_type: str | None = Query(default=None, pattern=r"^(income|expense)$"),
    currency: str | None = Query(default=None, max_length=3),
    search: str | None = Query(default=None, max_length=200),
    only_uncategorized: bool = False,
    only_flagged: bool = False,
    exclude_internal: bool = False,
    exclude_duplicates: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionSummary:
    filters = dict(
        account_id=account_id,
        category_id=category_id,
        statement_id=statement_id,
        start_date=start_date,
        end_date=end_date,
        movement_type=movement_type,
        currency=currency,
        search=search,
        only_uncategorized=only_uncategorized,
        only_flagged=only_flagged,
        exclude_internal=exclude_internal,
        exclude_duplicates=exclude_duplicates,
    )
    base = select(
        Transaction.currency,
        Transaction.movement_type,
        func.coalesce(func.sum(Transaction.amount), 0),
        func.count(),
    ).join(Account).where(Account.user_id == current_user.id)
    base = _apply_filters(base, **filters).group_by(Transaction.currency, Transaction.movement_type)
    rows = (await db.execute(base)).all()

    by_currency: dict[str, dict[str, Decimal | int]] = {}
    total_count = 0
    for currency_code, mtype, total, count in rows:
        bucket = by_currency.setdefault(currency_code, {"income": Decimal("0"), "expense": Decimal("0"), "count": 0})
        if mtype == "income":
            bucket["income"] = Decimal(total)
        else:
            bucket["expense"] = Decimal(total)
        bucket["count"] = int(bucket["count"]) + int(count)
        total_count += int(count)

    uncat_query = select(func.count()).select_from(Transaction).join(Account).where(Account.user_id == current_user.id)
    uncat_query = _apply_filters(uncat_query, **{**filters, "only_uncategorized": True})
    uncategorized_count = int((await db.execute(uncat_query)).scalar() or 0)

    return TransactionSummary(
        total_count=total_count,
        uncategorized_count=uncategorized_count,
        by_currency={
            code: CurrencyTotals(income=str(vals["income"]), expense=str(vals["expense"]), count=int(vals["count"]))
            for code, vals in by_currency.items()
        },
    )


@router.get("/by-category")
async def transactions_by_category(
    account_id: uuid.UUID | None = None,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    currency: str | None = Query(default=None, max_length=3),
    exclude_internal: bool = False,
    exclude_duplicates: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Totales por categoría (ingreso/egreso/conteo) en un rango. Usado por Comparar e Insights."""
    base = (
        select(
            Transaction.category_id,
            Category.name,
            Transaction.movement_type,
            func.coalesce(func.sum(Transaction.amount), 0),
            func.count(),
        )
        .join(Account)
        .outerjoin(Category, Category.id == Transaction.category_id)
        .where(Account.user_id == current_user.id)
    )
    base = _apply_filters(
        base,
        account_id=account_id,
        category_id=None,
        statement_id=None,
        start_date=start_date,
        end_date=end_date,
        movement_type=None,
        currency=currency,
        search=None,
        only_uncategorized=False,
        only_flagged=False,
        exclude_internal=exclude_internal,
        exclude_duplicates=exclude_duplicates,
    ).group_by(Transaction.category_id, Category.name, Transaction.movement_type)
    rows = (await db.execute(base)).all()

    agg: dict[str, dict] = {}
    for category_id, name, mtype, total, count in rows:
        key = str(category_id) if category_id is not None else "uncategorized"
        bucket = agg.setdefault(
            key,
            {
                "category_id": str(category_id) if category_id is not None else None,
                "category_name": name or "Sin categoría",
                "income": Decimal("0"),
                "expense": Decimal("0"),
                "count": 0,
            },
        )
        if mtype == "income":
            bucket["income"] = Decimal(total)
        else:
            bucket["expense"] = Decimal(total)
        bucket["count"] += int(count)

    result = [
        {
            "category_id": v["category_id"],
            "category_name": v["category_name"],
            "income": str(v["income"]),
            "expense": str(v["expense"]),
            "count": v["count"],
        }
        for v in agg.values()
    ]
    result.sort(key=lambda r: Decimal(r["expense"]), reverse=True)
    return result


@router.get("/by-month")
async def transactions_by_month(
    months: int = Query(default=12, ge=1, le=36),
    account_id: uuid.UUID | None = None,
    currency: str | None = Query(default=None, max_length=3),
    exclude_internal: bool = False,
    exclude_duplicates: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Serie mensual ingreso/egreso de los últimos N meses. Usado por Insights."""
    today = datetime.date.today()
    start_month = (today.replace(day=1) - datetime.timedelta(days=1)).replace(day=1)
    for _ in range(months - 1):
        start_month = (start_month - datetime.timedelta(days=1)).replace(day=1)

    month_expr = func.to_char(Transaction.date, "YYYY-MM")
    base = (
        select(month_expr, Transaction.movement_type, func.coalesce(func.sum(Transaction.amount), 0))
        .join(Account)
        .where(Account.user_id == current_user.id, Transaction.date >= start_month)
    )
    base = _apply_filters(
        base,
        account_id=account_id,
        category_id=None,
        statement_id=None,
        start_date=None,
        end_date=None,
        movement_type=None,
        currency=currency,
        search=None,
        only_uncategorized=False,
        only_flagged=False,
        exclude_internal=exclude_internal,
        exclude_duplicates=exclude_duplicates,
    ).group_by(month_expr, Transaction.movement_type)
    rows = (await db.execute(base)).all()

    series: dict[str, dict] = {}
    for month, mtype, total in rows:
        bucket = series.setdefault(month, {"month": month, "income": Decimal("0"), "expense": Decimal("0")})
        if mtype == "income":
            bucket["income"] = Decimal(total)
        else:
            bucket["expense"] = Decimal(total)

    return [
        {"month": m["month"], "income": str(m["income"]), "expense": str(m["expense"])}
        for m in sorted(series.values(), key=lambda x: x["month"])
    ]


async def _filtered_rows_for_export(
    db: AsyncSession,
    current_user: User,
    start_date: datetime.date | None,
    end_date: datetime.date | None,
    statement_id: uuid.UUID | None = None,
) -> list[Transaction]:
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
    if statement_id is not None:
        query = query.where(Transaction.uploaded_file_id == statement_id)
    return list((await db.execute(query)).scalars().all())


def _csv_safe(value: str) -> str:
    # Evita inyección de fórmulas al abrir el CSV en Excel/Sheets.
    if value and value[0] in ("=", "+", "-", "@"):
        return "'" + value
    return value


@router.get("/export/csv")
async def export_transactions_csv(
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    statement_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    rows = await _filtered_rows_for_export(db, current_user, start_date, end_date, statement_id)
    buffer = io.StringIO()
    buffer.write("﻿")  # BOM para Excel
    writer = csv.writer(buffer)
    writer.writerow(["Fecha", "Descripción", "Cuenta", "Categoría", "Tipo", "Moneda", "Monto"])
    for tx in rows:
        writer.writerow([
            tx.date.isoformat(),
            _csv_safe(tx.description),
            _csv_safe(tx.account.name if tx.account else ""),
            _csv_safe(tx.category.name if tx.category else ""),
            tx.movement_type,
            tx.currency,
            str(tx.amount),
        ])
    buffer.seek(0)
    filename = f"transacciones_{datetime.date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/excel")
async def export_transactions_excel(
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    statement_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    rows = await _filtered_rows_for_export(db, current_user, start_date, end_date, statement_id)
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


async def _owned_transactions(
    transaction_ids: list[uuid.UUID], db: AsyncSession, current_user: User
) -> list[Transaction]:
    if not transaction_ids:
        return []
    result = await db.execute(
        select(Transaction)
        .join(Account)
        .where(Transaction.id.in_(transaction_ids), Account.user_id == current_user.id)
    )
    return list(result.scalars().all())


@router.patch("/bulk/category")
async def bulk_set_category(
    body: BulkCategoryIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    await _category_or_404(body.category_id, db)
    transactions = await _owned_transactions(body.transaction_ids, db, current_user)
    for tx in transactions:
        tx.category_id = body.category_id
        tx.rule_id = None
    await db.commit()
    return {"updated": len(transactions)}


@router.patch("/bulk/tags")
async def bulk_set_tags(
    body: BulkTagsIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    tag_ids = await _validate_tags(body.tag_ids, db, current_user)
    transactions = await _owned_transactions(body.transaction_ids, db, current_user)
    for tx in transactions:
        await db.execute(
            TransactionTag.__table__.delete().where(TransactionTag.transaction_id == tx.id)
        )
        for tag_id in tag_ids:
            db.add(TransactionTag(transaction_id=tx.id, tag_id=tag_id))
    await db.commit()
    return {"updated": len(transactions)}


@router.delete("/bulk")
async def bulk_delete(
    body: BulkDeleteIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    transactions = await _owned_transactions(body.transaction_ids, db, current_user)
    for tx in transactions:
        await db.delete(tx)
    await db.commit()
    return {"deleted": len(transactions)}


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    body: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    account = await _account_or_404(body.account_id, db, current_user)
    await _category_or_404(body.category_id, db)
    uploaded_file = await _manual_uploaded_file(account, db, current_user)
    transaction = Transaction(uploaded_file_id=uploaded_file.id, user_id=current_user.id, **body.model_dump())
    db.add(transaction)
    await db.flush()
    transaction_id = transaction.id
    await db.commit()
    return _to_out(await _transaction_or_404(transaction_id, db, current_user))


@router.get("/{transaction_id}", response_model=TransactionOut)
async def get_transaction(transaction_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> TransactionOut:
    return _to_out(await _transaction_or_404(transaction_id, db, current_user))


@router.patch("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(
    transaction_id: uuid.UUID,
    body: TransactionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    transaction = await _transaction_or_404(transaction_id, db, current_user)
    changes = body.model_dump(exclude_unset=True)
    if "account_id" in changes and changes["account_id"] is not None:
        await _account_or_404(changes["account_id"], db, current_user)
    if "category_id" in changes:
        await _category_or_404(changes["category_id"], db)
    for field, value in changes.items():
        setattr(transaction, field, value)
    await db.commit()
    return _to_out(await _transaction_or_404(transaction_id, db, current_user))


@router.patch("/{transaction_id}/notes", response_model=TransactionOut)
async def set_notes(
    transaction_id: uuid.UUID,
    body: NotesIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    transaction = await _transaction_or_404(transaction_id, db, current_user)
    transaction.notes = body.notes
    await db.commit()
    return _to_out(await _transaction_or_404(transaction_id, db, current_user))


@router.patch("/{transaction_id}/flag", response_model=TransactionOut)
async def set_flag(
    transaction_id: uuid.UUID,
    body: FlagIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    transaction = await _transaction_or_404(transaction_id, db, current_user)
    transaction.is_flagged = body.is_flagged
    transaction.flag_reason = body.reason if body.is_flagged else None
    await db.commit()
    return _to_out(await _transaction_or_404(transaction_id, db, current_user))


async def _validate_tags(tag_ids: list[uuid.UUID], db: AsyncSession, current_user: User) -> list[uuid.UUID]:
    unique_ids = list(dict.fromkeys(tag_ids))
    if not unique_ids:
        return []
    result = await db.execute(
        select(Tag.id).where(Tag.id.in_(unique_ids), Tag.user_id == current_user.id)
    )
    found = {row[0] for row in result.all()}
    missing = set(unique_ids) - found
    if missing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Una o más etiquetas no existen")
    return unique_ids


@router.patch("/{transaction_id}/tags", response_model=TransactionOut)
async def set_tags(
    transaction_id: uuid.UUID,
    body: TagsIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    transaction = await _transaction_or_404(transaction_id, db, current_user)
    tag_ids = await _validate_tags(body.tag_ids, db, current_user)
    await db.execute(
        TransactionTag.__table__.delete().where(TransactionTag.transaction_id == transaction.id)
    )
    for tag_id in tag_ids:
        db.add(TransactionTag(transaction_id=transaction.id, tag_id=tag_id))
    await db.commit()
    return _to_out(await _transaction_or_404(transaction_id, db, current_user))


@router.get("/{transaction_id}/splits", response_model=list[SplitOut])
async def get_splits(
    transaction_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SplitOut]:
    transaction = await _transaction_or_404(transaction_id, db, current_user)
    return [SplitOut.model_validate(split) for split in transaction.splits]


@router.post("/{transaction_id}/split", response_model=TransactionOut)
async def set_splits(
    transaction_id: uuid.UUID,
    body: list[SplitIn],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    transaction = await _transaction_or_404(transaction_id, db, current_user)
    if not body:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Debes enviar al menos un reparto")
    total = sum(part.amount for part in body)
    if total > Decimal(transaction.amount):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La suma de los repartos supera el monto de la transacción")
    for part in body:
        await _category_or_404(part.category_id, db)
    await db.execute(
        TransactionSplit.__table__.delete().where(TransactionSplit.transaction_id == transaction.id)
    )
    for part in body:
        db.add(TransactionSplit(transaction_id=transaction.id, category_id=part.category_id, amount=part.amount, notes=part.notes))
    await db.commit()
    return _to_out(await _transaction_or_404(transaction_id, db, current_user))


@router.delete("/{transaction_id}/splits", response_model=TransactionOut)
async def clear_splits(
    transaction_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    transaction = await _transaction_or_404(transaction_id, db, current_user)
    await db.execute(
        TransactionSplit.__table__.delete().where(TransactionSplit.transaction_id == transaction.id)
    )
    await db.commit()
    return _to_out(await _transaction_or_404(transaction_id, db, current_user))


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(transaction_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    transaction = await _transaction_or_404(transaction_id, db, current_user)
    await db.delete(transaction)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
