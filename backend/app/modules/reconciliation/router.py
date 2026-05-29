from __future__ import annotations

import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/v1/reconciliation", tags=["reconciliation"])


class ReconciliationAccount(BaseModel):
    account_id: str
    account_name: str
    currency: str
    account_balance: str
    movement_balance: str
    difference: str
    status: str
    transaction_count: int
    reconciliation_basis: str
    statement_count: int = 0


class ReconciliationSummary(BaseModel):
    currency: str | None
    start_date: datetime.date | None
    end_date: datetime.date | None
    accounts: list[ReconciliationAccount]
    ok_count: int
    warning_count: int


@router.get("/summary", response_model=ReconciliationSummary)
async def reconciliation_summary(
    currency: str | None = Query(default=None, max_length=3),
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    tolerance: Decimal = Query(default=Decimal("1"), ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReconciliationSummary:
    query = select(Account).where(Account.user_id == current_user.id).order_by(Account.name)
    if currency:
        query = query.where(Account.currency == currency)
    accounts = list((await db.execute(query)).scalars().all())
    items: list[ReconciliationAccount] = []
    for account in accounts:
        tx_query = (
            select(Transaction.movement_type, func.coalesce(func.sum(Transaction.amount), 0), func.count(Transaction.id))
            .where(
                Transaction.user_id == current_user.id,
                Transaction.account_id == account.id,
                Transaction.is_internal_transfer.is_(False),
                Transaction.is_duplicate.is_(False),
            )
            .group_by(Transaction.movement_type)
        )
        if start_date:
            tx_query = tx_query.where(Transaction.date >= start_date)
        if end_date:
            tx_query = tx_query.where(Transaction.date <= end_date)
        rows = await db.execute(tx_query)
        income = Decimal("0")
        expense = Decimal("0")
        count = 0
        for movement_type, amount, row_count in rows.all():
            if movement_type == "income":
                income = Decimal(amount)
            else:
                expense = Decimal(amount)
            count += int(row_count)
        movement_balance = income - expense
        account_balance = Decimal(account.balance or 0)
        statement_difference, statement_count = await _statement_difference(account, start_date, end_date, db, current_user)
        reconciliation_basis = "statement" if statement_count else "account"
        difference = statement_difference if statement_count else account_balance - movement_balance
        status = "ok" if abs(difference) <= tolerance else "warning"
        items.append(ReconciliationAccount(
            account_id=str(account.id),
            account_name=account.name,
            currency=account.currency,
            account_balance=str(account_balance),
            movement_balance=str(movement_balance),
            difference=str(difference),
            status=status,
            transaction_count=count,
            reconciliation_basis=reconciliation_basis,
            statement_count=statement_count,
        ))
    return ReconciliationSummary(
        currency=currency,
        start_date=start_date,
        end_date=end_date,
        accounts=items,
        ok_count=sum(1 for item in items if item.status == "ok"),
        warning_count=sum(1 for item in items if item.status != "ok"),
    )


async def _statement_difference(
    account: Account,
    start_date: datetime.date | None,
    end_date: datetime.date | None,
    db: AsyncSession,
    current_user: User,
) -> tuple[Decimal, int]:
    query = select(UploadedFile).where(
        UploadedFile.user_id == current_user.id,
        UploadedFile.account_id == account.id,
        UploadedFile.opening_balance.is_not(None),
        UploadedFile.closing_balance.is_not(None),
    )
    if start_date:
        query = query.where((UploadedFile.period_end.is_(None)) | (UploadedFile.period_end >= start_date))
    if end_date:
        query = query.where((UploadedFile.period_start.is_(None)) | (UploadedFile.period_start <= end_date))
    statements = list((await db.execute(query)).scalars().all())
    total_difference = Decimal("0")
    used = 0
    for statement in statements:
        rows = await db.execute(
            select(Transaction.movement_type, func.coalesce(func.sum(Transaction.amount), 0))
            .where(
                Transaction.user_id == current_user.id,
                Transaction.account_id == account.id,
                Transaction.uploaded_file_id == statement.id,
                Transaction.is_internal_transfer.is_(False),
                Transaction.is_duplicate.is_(False),
            )
            .group_by(Transaction.movement_type)
        )
        income = Decimal("0")
        expense = Decimal("0")
        for movement_type, amount in rows.all():
            if movement_type == "income":
                income = Decimal(amount)
            else:
                expense = Decimal(amount)
        expected_closing = Decimal(statement.opening_balance or 0) + income - expense
        total_difference += Decimal(statement.closing_balance or 0) - expected_closing
        used += 1
    return total_difference, used


@router.get("/alerts", response_model=list[ReconciliationAccount])
async def reconciliation_alerts(
    currency: str | None = Query(default=None, max_length=3),
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    tolerance: Decimal = Query(default=Decimal("1"), ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ReconciliationAccount]:
    summary = await reconciliation_summary(currency=currency, start_date=start_date, end_date=end_date, tolerance=tolerance, db=db, current_user=current_user)
    return [item for item in summary.accounts if item.status != "ok"]
