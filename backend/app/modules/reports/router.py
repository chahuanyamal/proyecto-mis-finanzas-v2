from __future__ import annotations

import csv
import io
from decimal import Decimal

from fastapi import APIRouter, Depends, Path
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import String, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


class AnnualCurrencyTotal(BaseModel):
    currency: str
    income: str
    expenses: str
    net: str
    count: int


class AnnualMonthTotal(BaseModel):
    month: str
    currency: str
    income: str
    expenses: str
    net: str
    count: int


class AnnualCategoryTotal(BaseModel):
    category_id: str | None
    category_name: str
    currency: str
    income: str
    expenses: str
    net: str
    count: int


class AnnualReport(BaseModel):
    year: int
    totals: list[AnnualCurrencyTotal]
    by_month: list[AnnualMonthTotal]
    by_category: list[AnnualCategoryTotal]
    transaction_count: int
    uncategorized_count: int


def _money(value: Decimal | int | None) -> str:
    return str(value or Decimal("0"))


def _start_end(year: int) -> tuple[str, str]:
    return f"{year}-01-01", f"{year + 1}-01-01"


async def _build_report(year: int, db: AsyncSession, current_user: User) -> AnnualReport:
    start, end = _start_end(year)

    totals_rows = await db.execute(
        select(
            Transaction.currency,
            Transaction.movement_type,
            func.coalesce(func.sum(Transaction.amount), 0),
            func.count(Transaction.id),
        )
        .join(Account, Account.id == Transaction.account_id)
        .where(
            Account.user_id == current_user.id,
            Transaction.user_id == current_user.id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.is_internal_transfer.is_(False),
            Transaction.is_duplicate.is_(False),
        )
        .group_by(Transaction.currency, Transaction.movement_type)
    )
    totals_map: dict[str, dict[str, Decimal | int]] = {}
    transaction_count = 0
    for currency, movement_type, amount, count in totals_rows.all():
        item = totals_map.setdefault(currency, {"income": Decimal("0"), "expenses": Decimal("0"), "count": 0})
        if movement_type == "income":
            item["income"] = Decimal(amount)
        else:
            item["expenses"] = Decimal(amount)
        item["count"] = int(item["count"]) + int(count)
        transaction_count += int(count)

    month_expr = func.substr(func.cast(Transaction.date, String), 1, 7)
    month_rows = await db.execute(
        select(
            month_expr,
            Transaction.currency,
            Transaction.movement_type,
            func.coalesce(func.sum(Transaction.amount), 0),
            func.count(Transaction.id),
        )
        .join(Account, Account.id == Transaction.account_id)
        .where(
            Account.user_id == current_user.id,
            Transaction.user_id == current_user.id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.is_internal_transfer.is_(False),
            Transaction.is_duplicate.is_(False),
        )
        .group_by(month_expr, Transaction.currency, Transaction.movement_type)
        .order_by(month_expr.asc(), Transaction.currency.asc())
    )
    month_map: dict[tuple[str, str], dict[str, Decimal | int]] = {}
    for month, currency, movement_type, amount, count in month_rows.all():
        item = month_map.setdefault((month, currency), {"income": Decimal("0"), "expenses": Decimal("0"), "count": 0})
        if movement_type == "income":
            item["income"] = Decimal(amount)
        else:
            item["expenses"] = Decimal(amount)
        item["count"] = int(item["count"]) + int(count)

    category_rows = await db.execute(
        select(
            Transaction.category_id,
            Category.name,
            Transaction.currency,
            Transaction.movement_type,
            func.coalesce(func.sum(Transaction.amount), 0),
            func.count(Transaction.id),
        )
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
        .group_by(Transaction.category_id, Category.name, Transaction.currency, Transaction.movement_type)
        .order_by(Transaction.currency.asc(), Category.name.asc().nulls_last())
    )
    category_map: dict[tuple[str | None, str, str], dict[str, Decimal | int]] = {}
    uncategorized_count = 0
    for category_id, category_name, currency, movement_type, amount, count in category_rows.all():
        name = category_name or "Sin categoria"
        key = (str(category_id) if category_id else None, name, currency)
        item = category_map.setdefault(key, {"income": Decimal("0"), "expenses": Decimal("0"), "count": 0})
        if movement_type == "income":
            item["income"] = Decimal(amount)
        else:
            item["expenses"] = Decimal(amount)
        item["count"] = int(item["count"]) + int(count)
        if category_id is None:
            uncategorized_count += int(count)

    return AnnualReport(
        year=year,
        totals=[
            AnnualCurrencyTotal(
                currency=currency,
                income=_money(values["income"]),
                expenses=_money(values["expenses"]),
                net=_money(Decimal(values["income"]) - Decimal(values["expenses"])),
                count=int(values["count"]),
            )
            for currency, values in sorted(totals_map.items())
        ],
        by_month=[
            AnnualMonthTotal(
                month=month,
                currency=currency,
                income=_money(values["income"]),
                expenses=_money(values["expenses"]),
                net=_money(Decimal(values["income"]) - Decimal(values["expenses"])),
                count=int(values["count"]),
            )
            for (month, currency), values in sorted(month_map.items())
        ],
        by_category=[
            AnnualCategoryTotal(
                category_id=category_id,
                category_name=category_name,
                currency=currency,
                income=_money(values["income"]),
                expenses=_money(values["expenses"]),
                net=_money(Decimal(values["income"]) - Decimal(values["expenses"])),
                count=int(values["count"]),
            )
            for (category_id, category_name, currency), values in sorted(category_map.items(), key=lambda item: (item[0][2], item[0][1]))
        ],
        transaction_count=transaction_count,
        uncategorized_count=uncategorized_count,
    )


@router.get("/annual/{year}", response_model=AnnualReport)
async def annual_report(
    year: int = Path(ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnnualReport:
    return await _build_report(year, db, current_user)


@router.get("/annual/{year}/csv")
async def annual_report_csv(
    year: int = Path(ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    report = await _build_report(year, db, current_user)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["section", "period_or_category", "currency", "income", "expenses", "net", "count"])
    for total in report.totals:
        writer.writerow(["total", str(report.year), total.currency, total.income, total.expenses, total.net, total.count])
    for item in report.by_month:
        writer.writerow(["month", item.month, item.currency, item.income, item.expenses, item.net, item.count])
    for item in report.by_category:
        writer.writerow(["category", item.category_name, item.currency, item.income, item.expenses, item.net, item.count])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=reporte-anual-{year}.csv"},
    )
