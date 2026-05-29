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
        difference = account_balance - movement_balance
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
        ))
    return ReconciliationSummary(
        currency=currency,
        start_date=start_date,
        end_date=end_date,
        accounts=items,
        ok_count=sum(1 for item in items if item.status == "ok"),
        warning_count=sum(1 for item in items if item.status != "ok"),
    )


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
