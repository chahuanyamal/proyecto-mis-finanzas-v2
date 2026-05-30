from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cached
from app.core.database import get_db
from app.models.account import Account
from app.models.budget import Budget
from app.models.category import Category
from app.models.notification import Notification
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


def _percent(numerator: Decimal, denominator: Decimal) -> str:
    return str(round((numerator / denominator) * 100, 2)) if denominator else "0"


def _period_range(period: Literal["mtd", "30d", "ytd", "12m"], today: datetime.date | None = None) -> tuple[datetime.date, datetime.date]:
    current = today or datetime.date.today()
    if period == "30d":
        return current - datetime.timedelta(days=29), current + datetime.timedelta(days=1)
    if period == "ytd":
        return datetime.date(current.year, 1, 1), current + datetime.timedelta(days=1)
    if period == "12m":
        return _add_months(datetime.date(current.year, current.month, 1), -11), current + datetime.timedelta(days=1)
    return datetime.date(current.year, current.month, 1), current + datetime.timedelta(days=1)


def _previous_range(start: datetime.date, end: datetime.date) -> tuple[datetime.date, datetime.date]:
    days = (end - start).days
    previous_end = start
    return previous_end - datetime.timedelta(days=days), previous_end


def _add_months(value: datetime.date, months: int) -> datetime.date:
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    return datetime.date(year, month, 1)


async def _totals_for_range(db: AsyncSession, current_user: User, start: datetime.date, end: datetime.date, currency: str | None) -> dict[str, Decimal]:
    query = (
        select(Transaction.movement_type, func.coalesce(func.sum(Transaction.amount), 0))
        .join(Account)
        .where(
            Account.user_id == current_user.id,
            Transaction.user_id == current_user.id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.is_internal_transfer.is_(False),
            Transaction.is_duplicate.is_(False),
        )
        .group_by(Transaction.movement_type)
    )
    if currency:
        query = query.where(Transaction.currency == currency)
    rows = await db.execute(query)
    by_type = {row[0]: Decimal(row[1]) for row in rows.all()}
    income = by_type.get("income", Decimal("0"))
    expenses = by_type.get("expense", Decimal("0"))
    return {"income": income, "expenses": expenses, "net": income - expenses}


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
        .where(
            Account.user_id == current_user.id,
            Transaction.user_id == current_user.id,
            Transaction.date >= start,
            Transaction.date < end,
        )
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
            Transaction.user_id == current_user.id,
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
            Transaction.user_id == current_user.id,
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
        if percent >= budget.alert_at_percent:
            existing = await db.execute(
                select(Notification.id).where(
                    Notification.user_id == current_user.id,
                    Notification.type == "budget_alert",
                    func.coalesce(Notification.data["budget_id"].as_string(), "") == str(budget.id),
                    Notification.created_at >= func.now() - datetime.timedelta(days=1),
                )
            )
            if existing.scalar_one_or_none() is None:
                db.add(Notification(
                    user_id=current_user.id,
                    type="budget_alert",
                    title=f"Presupuesto de {category_name} al {percent}%",
                    body=f"Has gastado ${spent} de ${budget.amount} en {category_name} ({percent}%).",
                    data={"budget_id": str(budget.id), "month": month, "percent": percent},
                ))

    await db.flush()

    return {
        "month": month,
        "income": _money(income),
        "expenses": _money(expenses),
        "balance": _money(income - expenses),
        "savings_rate": str(round(((income - expenses) / income) * 100, 2)) if income else "0",
        "category_expenses": category_expenses,
        "budgets": budgets,
    }


@router.get("/summary")
@cached(ttl_seconds=120)
async def dashboard_summary(
    period: Literal["mtd", "30d", "ytd", "12m"] = "mtd",
    currency: str | None = Query(default=None, max_length=3),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    start, end = _period_range(period)
    previous_start, previous_end = _previous_range(start, end)
    totals = await _totals_for_range(db, current_user, start, end, currency)
    previous_totals = await _totals_for_range(db, current_user, previous_start, previous_end, currency)

    category_query = (
        select(
            Category.id,
            Category.name,
            Category.color,
            func.coalesce(func.sum(Transaction.amount), 0),
            func.count(Transaction.id),
        )
        .join(Transaction, Transaction.category_id == Category.id)
        .join(Account, Account.id == Transaction.account_id)
        .where(
            Account.user_id == current_user.id,
            Transaction.user_id == current_user.id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.movement_type == "expense",
            Transaction.is_internal_transfer.is_(False),
            Transaction.is_duplicate.is_(False),
        )
        .group_by(Category.id, Category.name, Category.color)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(8)
    )
    if currency:
        category_query = category_query.where(Transaction.currency == currency)
    category_rows = await db.execute(category_query)

    recent_query = (
        select(Transaction, Account.name, Category.name, Category.color)
        .join(Account, Account.id == Transaction.account_id)
        .outerjoin(Category, Category.id == Transaction.category_id)
        .where(
            Account.user_id == current_user.id,
            Transaction.user_id == current_user.id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.is_internal_transfer.is_(False),
            Transaction.is_duplicate.is_(False),
        )
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .limit(8)
    )
    if currency:
        recent_query = recent_query.where(Transaction.currency == currency)
    recent_rows = await db.execute(recent_query)

    uncategorized_query = (
        select(func.count(Transaction.id))
        .join(Account)
        .where(
            Account.user_id == current_user.id,
            Transaction.user_id == current_user.id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.category_id.is_(None),
            Transaction.is_internal_transfer.is_(False),
            Transaction.is_duplicate.is_(False),
        )
    )
    if currency:
        uncategorized_query = uncategorized_query.where(Transaction.currency == currency)
    uncategorized_count = (await db.execute(uncategorized_query)).scalar_one()

    def change(current: Decimal, previous: Decimal) -> str | None:
        if previous == 0:
            return None
        return _percent(current - previous, previous.copy_abs())

    return {
        "period": period,
        "date_from": start.isoformat(),
        "date_to": (end - datetime.timedelta(days=1)).isoformat(),
        "currency": currency,
        "income": _money(totals["income"]),
        "expenses": _money(totals["expenses"]),
        "net": _money(totals["net"]),
        "savings_rate": _percent(totals["net"], totals["income"]),
        "income_change": change(totals["income"], previous_totals["income"]),
        "expenses_change": change(totals["expenses"], previous_totals["expenses"]),
        "net_change": change(totals["net"], previous_totals["net"]),
        "uncategorized_count": int(uncategorized_count or 0),
        "category_expenses": [
            {
                "category_id": str(category_id),
                "category_name": name,
                "category_color": color,
                "amount": _money(amount),
                "count": int(count),
            }
            for category_id, name, color, amount, count in category_rows.all()
        ],
        "recent_transactions": [
            {
                "id": str(tx.id),
                "date": tx.date.isoformat(),
                "description": tx.description,
                "amount": _money(tx.amount),
                "currency": tx.currency,
                "movement_type": tx.movement_type,
                "account_name": account_name,
                "category_name": category_name,
                "category_color": category_color,
            }
            for tx, account_name, category_name, category_color in recent_rows.all()
        ],
    }


@router.get("/trends")
@cached(ttl_seconds=300)
async def dashboard_trends(
    months: int = Query(default=12, ge=1, le=24),
    currency: str | None = Query(default=None, max_length=3),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    current_month = datetime.date.today().replace(day=1)
    first_month = _add_months(current_month, -(months - 1))
    trends = []
    for index in range(months):
        start = _add_months(first_month, index)
        end = _add_months(start, 1)
        totals = await _totals_for_range(db, current_user, start, end, currency)
        trends.append({
            "month": start.strftime("%Y-%m"),
            "income": _money(totals["income"]),
            "expenses": _money(totals["expenses"]),
            "net": _money(totals["net"]),
        })
    return {"months": months, "currency": currency, "trends": trends}


def _advance(value: datetime.date, frequency: str) -> datetime.date:
    if frequency == "weekly":
        return value + datetime.timedelta(days=7)
    if frequency == "yearly":
        try:
            return value.replace(year=value.year + 1)
        except ValueError:
            return value.replace(year=value.year + 1, day=28)
    month = value.month
    year = value.year + (month // 12)
    nxt = month % 12 + 1
    return datetime.date(year, nxt, min(value.day, 28))


@router.get("/forecast")
async def cashflow_forecast(
    days: int = Query(default=90, ge=7, le=365),
    currency: str = Query(default="CLP", max_length=3),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Proyecta el saldo futuro combinando saldo actual + recurrentes + tendencia.

    - Saldo inicial: suma de saldos de cuentas en la moneda dada.
    - Tendencia: neto diario promedio de los últimos 90 días.
    - Eventos: recurrentes activos proyectados en su fecha (ingreso +, gasto −).
    """
    from app.models.recurring import RecurringExpense

    today = datetime.date.today()
    horizon = today + datetime.timedelta(days=days)

    # Saldo inicial (cuentas de la moneda).
    bal_rows = await db.execute(
        select(func.coalesce(func.sum(Account.balance), 0)).where(
            Account.user_id == current_user.id, Account.currency == currency
        )
    )
    start_balance = Decimal(bal_rows.scalar() or 0)

    # Tendencia: neto diario promedio últimos 90 días.
    window_start = today - datetime.timedelta(days=90)
    totals = await _totals_for_range(db, current_user, window_start, today + datetime.timedelta(days=1), currency)
    daily_net = totals["net"] / Decimal(90)

    # Eventos recurrentes proyectados en el horizonte.
    rec_rows = await db.execute(
        select(RecurringExpense).where(
            RecurringExpense.user_id == current_user.id,
            RecurringExpense.active.is_(True),
            RecurringExpense.currency == currency,
            RecurringExpense.next_date.is_not(None),
        )
    )
    deltas: dict[datetime.date, Decimal] = {}
    for rec in rec_rows.scalars().all():
        due = rec.next_date
        sign = Decimal(1) if rec.movement_type == "income" else Decimal(-1)
        guard = 0
        while due is not None and due <= horizon and guard < 400:
            if due >= today:
                deltas[due] = deltas.get(due, Decimal(0)) + sign * Decimal(rec.amount or 0)
            due = _advance(due, rec.frequency)
            guard += 1

    points = []
    balance = start_balance
    lowest = start_balance
    lowest_date = today
    for offset in range(days + 1):
        day = today + datetime.timedelta(days=offset)
        if offset > 0:
            balance += daily_net
        rec_delta = deltas.get(day, Decimal(0))
        balance += rec_delta
        if balance < lowest:
            lowest = balance
            lowest_date = day
        # Muestra ~ un punto cada pocos días para horizontes largos.
        if offset % max(1, days // 60) == 0 or offset == days or rec_delta != 0:
            points.append({
                "date": day.isoformat(),
                "balance": str(balance.quantize(Decimal("1"))),
                "recurring_delta": str(rec_delta.quantize(Decimal("1"))),
            })

    return {
        "currency": currency,
        "days": days,
        "start_balance": str(start_balance.quantize(Decimal("1"))),
        "end_balance": str(balance.quantize(Decimal("1"))),
        "lowest_balance": str(lowest.quantize(Decimal("1"))),
        "lowest_date": lowest_date.isoformat(),
        "daily_net_avg": str(daily_net.quantize(Decimal("1"))),
        "points": points,
    }
