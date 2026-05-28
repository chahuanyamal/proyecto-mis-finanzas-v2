from __future__ import annotations

import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.account import Account
from app.models.budget import Budget
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


def _month_range(month: str) -> tuple[datetime.date, datetime.date]:
    year, month_number = map(int, month.split("-"))
    start = datetime.date(year, month_number, 1)
    if month_number == 12:
        end = datetime.date(year + 1, 1, 1)
    else:
        end = datetime.date(year, month_number + 1, 1)
    return start, end


def _money(value: Decimal | None) -> str:
    return str(value or Decimal("0"))


@router.get("/monthly")
async def monthly_dashboard(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    start, end = _month_range(month)
    totals = await db.execute(
        select(Transaction.movement_type, func.coalesce(func.sum(Transaction.amount), 0))
        .join(Account)
        .where(Account.user_id == current_user.id, Transaction.date >= start, Transaction.date < end)
        .group_by(Transaction.movement_type)
    )
    by_type = {row[0]: Decimal(row[1]) for row in totals.all()}
    income = by_type.get("income", Decimal("0"))
    expenses = by_type.get("expense", Decimal("0"))

    category_rows = await db.execute(
        select(Category.id, Category.name, func.coalesce(func.sum(Transaction.amount), 0))
        .join(Transaction, Transaction.category_id == Category.id)
        .join(Account, Account.id == Transaction.account_id)
        .where(
            Account.user_id == current_user.id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.movement_type == "expense",
        )
        .group_by(Category.id, Category.name)
        .order_by(func.sum(Transaction.amount).desc())
    )
    category_expenses = [
        {"category_id": str(category_id), "category_name": name, "amount": _money(amount)}
        for category_id, name, amount in category_rows.all()
    ]

    spent_by_category = (
        select(Transaction.category_id, func.coalesce(func.sum(Transaction.amount), 0).label("spent"))
        .join(Account)
        .where(
            Account.user_id == current_user.id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.movement_type == "expense",
            Transaction.category_id.is_not(None),
        )
        .group_by(Transaction.category_id)
        .subquery()
    )

    budget_rows = await db.execute(
        select(Budget, Category.name, func.coalesce(spent_by_category.c.spent, 0))
        .join(Category, Category.id == Budget.category_id)
        .outerjoin(spent_by_category, spent_by_category.c.category_id == Budget.category_id)
        .where(Budget.user_id == current_user.id, Budget.month == month)
    )
    budgets = []
    for budget, category_name, spent in budget_rows.all():
        percent = int((Decimal(spent or 0) / budget.amount) * 100) if budget.amount else 0
        budgets.append({
            "id": str(budget.id),
            "category_id": str(budget.category_id),
            "category_name": category_name,
            "amount": _money(budget.amount),
            "spent": _money(spent),
            "percent": percent,
            "status": "exceeded" if percent >= 100 else "warning" if percent >= budget.alert_at_percent else "ok",
        })

    return {
        "month": month,
        "income": _money(income),
        "expenses": _money(expenses),
        "balance": _money(income - expenses),
        "savings_rate": str(round(((income - expenses) / income) * 100, 2)) if income else "0",
        "category_expenses": category_expenses,
        "budgets": budgets,
    }
