from __future__ import annotations

import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User
from app.modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/v1/patrimonio", tags=["patrimonio"])


def _add_months(value: datetime.date, months: int) -> datetime.date:
    month = value.month - 1 + months
    year = value.year + month // 12
    month = month % 12 + 1
    return datetime.date(year, month, 1)


def _month_points(months: int) -> list[datetime.date]:
    current = datetime.date.today().replace(day=1)
    first = _add_months(current, -(months - 1))
    return [_add_months(first, idx) for idx in range(months)]


def _signed_amount(transaction: Transaction) -> Decimal:
    amount = Decimal(transaction.amount or 0)
    return amount if transaction.movement_type == "income" else -amount


async def _accounts_for_user(db: AsyncSession, current_user: User, currency: str | None = None) -> list[Account]:
    query = select(Account).where(Account.user_id == current_user.id).order_by(Account.name)
    if currency:
        query = query.where(Account.currency == currency)
    result = await db.execute(query)
    return list(result.scalars().all())


async def _transactions_for_accounts(db: AsyncSession, current_user: User, account_ids: list) -> list[Transaction]:
    if not account_ids:
        return []
    result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == current_user.id,
            Transaction.account_id.in_(account_ids),
            Transaction.is_internal_transfer.is_(False),
            Transaction.is_duplicate.is_(False),
        )
    )
    return list(result.scalars().all())


def _balance_at_month_start(account: Account, transactions: list[Transaction], month_start: datetime.date) -> Decimal:
    """Aproxima saldo de inicio de mes desde saldo actual y movimientos posteriores."""
    balance = Decimal(account.balance or 0)
    for tx in transactions:
        if tx.account_id == account.id and tx.date >= month_start:
            balance -= _signed_amount(tx)
    return balance


@router.get("")
async def net_worth(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Patrimonio neto: agrega los saldos de las cuentas del usuario por moneda.

    Los saldos de distinta moneda no se suman entre sí (no hay tipo de cambio
    en la v2); se reportan totales por moneda."""
    accounts = await _accounts_for_user(db, current_user)

    totals: dict[str, Decimal] = {}
    items = []
    for account in accounts:
        balance = Decimal(account.balance or 0)
        totals[account.currency] = totals.get(account.currency, Decimal("0")) + balance
        items.append({
            "id": str(account.id),
            "name": account.name,
            "account_type": account.account_type,
            "currency": account.currency,
            "balance": str(balance),
        })

    return {
        "accounts": items,
        "totals_by_currency": [
            {"currency": currency, "total": str(total)} for currency, total in sorted(totals.items())
        ],
        "account_count": len(accounts),
    }


@router.get("/history")
async def patrimonio_history(
    months: int = Query(default=12, ge=1, le=36),
    currency: str | None = Query(default=None, max_length=3),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    accounts = await _accounts_for_user(db, current_user, currency)
    transactions = await _transactions_for_accounts(db, current_user, [account.id for account in accounts])
    points = []
    for month_start in _month_points(months):
        totals: dict[str, Decimal] = {}
        for account in accounts:
            balance = _balance_at_month_start(account, transactions, month_start)
            totals[account.currency] = totals.get(account.currency, Decimal("0")) + balance
        for currency_code, total in sorted(totals.items()):
            points.append({"month": month_start.strftime("%Y-%m"), "currency": currency_code, "value": str(total)})
    return {"months": months, "currency": currency, "history": points}


@router.get("/account-trend")
async def account_trend(
    months: int = Query(default=12, ge=1, le=36),
    currency: str | None = Query(default=None, max_length=3),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    accounts = await _accounts_for_user(db, current_user, currency)
    transactions = await _transactions_for_accounts(db, current_user, [account.id for account in accounts])
    months_list = _month_points(months)
    items = []
    for account in accounts:
        points = [
            {"month": month_start.strftime("%Y-%m"), "balance": str(_balance_at_month_start(account, transactions, month_start))}
            for month_start in months_list
        ]
        first = Decimal(points[0]["balance"]) if points else Decimal("0")
        last = Decimal(points[-1]["balance"]) if points else Decimal(account.balance or 0)
        delta = last - first
        pct = str(round((delta / abs(first)) * 100, 2)) if first else None
        items.append({
            "id": str(account.id),
            "name": account.name,
            "account_type": account.account_type,
            "currency": account.currency,
            "current_balance": str(account.balance),
            "delta": str(delta),
            "delta_percent": pct,
            "points": points,
        })
    return {"months": months, "currency": currency, "accounts": items}


@router.get("/compare")
async def compare_patrimonio(
    months_ago: int = Query(default=1, ge=1, le=36),
    currency: str | None = Query(default=None, max_length=3),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    accounts = await _accounts_for_user(db, current_user, currency)
    transactions = await _transactions_for_accounts(db, current_user, [account.id for account in accounts])
    current_month = datetime.date.today().replace(day=1)
    past_month = _add_months(current_month, -months_ago)
    by_currency: dict[str, dict[str, Decimal]] = {}
    movers = []
    for account in accounts:
        current_balance = _balance_at_month_start(account, transactions, current_month)
        past_balance = _balance_at_month_start(account, transactions, past_month)
        bucket = by_currency.setdefault(account.currency, {"current": Decimal("0"), "past": Decimal("0")})
        bucket["current"] += current_balance
        bucket["past"] += past_balance
        movers.append({
            "id": str(account.id),
            "name": account.name,
            "currency": account.currency,
            "from": str(past_balance),
            "to": str(current_balance),
            "delta": str(current_balance - past_balance),
        })
    totals = []
    for currency_code, values in sorted(by_currency.items()):
        delta = values["current"] - values["past"]
        totals.append({
            "currency": currency_code,
            "from": str(values["past"]),
            "to": str(values["current"]),
            "delta": str(delta),
            "delta_percent": str(round((delta / abs(values["past"])) * 100, 2)) if values["past"] else None,
        })
    movers.sort(key=lambda item: abs(Decimal(item["delta"])), reverse=True)
    return {
        "months_ago": months_ago,
        "from_month": past_month.strftime("%Y-%m"),
        "to_month": current_month.strftime("%Y-%m"),
        "currency": currency,
        "totals": totals,
        "top_movers": movers[:5],
    }


@router.get("/projection")
async def patrimonio_projection(
    months_ahead: int = Query(default=6, ge=1, le=24),
    history_months: int = Query(default=12, ge=3, le=36),
    currency: str | None = Query(default=None, max_length=3),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Proyeccion simple con regresion lineal sobre el historial de patrimonio.

    Calcula el historial mensual (igual que GET /history) y extiende la
    tendencia lineal hacia adelante con banda de incertidumbre creciente."""
    accounts = await _accounts_for_user(db, current_user, currency)
    transactions = await _transactions_for_accounts(db, current_user, [account.id for account in accounts])

    series: list[tuple[datetime.date, Decimal]] = []
    for month_start in _month_points(history_months):
        total = Decimal("0")
        for account in accounts:
            total += _balance_at_month_start(account, transactions, month_start)
        series.append((month_start, total))

    if len(series) < 2:
        return {
            "available": False,
            "reason": "Se necesitan al menos 2 meses de historial para proyectar.",
            "history": [{"month": d.strftime("%Y-%m"), "value": str(v)} for d, v in series],
            "projection": [],
        }

    epoch = series[0][0]
    xs = [(d.year - epoch.year) * 12 + (d.month - epoch.month) for d, _ in series]
    ys = [float(v) for _, v in series]
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
    den = sum((xs[i] - mean_x) ** 2 for i in range(n))
    slope = num / den if den else 0.0
    intercept = mean_y - slope * mean_x

    residuals = [ys[i] - (slope * xs[i] + intercept) for i in range(n)]
    std = (sum(r * r for r in residuals) / (n - 1)) ** 0.5 if n > 1 else 0.0

    last_date = series[-1][0]
    projection = []
    for i in range(1, months_ahead + 1):
        fut_date = _add_months(last_date.replace(day=1), i)
        x = (fut_date.year - epoch.year) * 12 + (fut_date.month - epoch.month)
        yhat = slope * x + intercept
        widening = 1.0 + (i / max(months_ahead, 1)) * 0.5
        projection.append({
            "month": fut_date.strftime("%Y-%m"),
            "value": str(round(yhat, 2)),
            "lower": str(round(yhat - std * widening, 2)),
            "upper": str(round(yhat + std * widening, 2)),
        })

    return {
        "available": True,
        "currency": currency,
        "slope_per_month": slope,
        "history": [{"month": d.strftime("%Y-%m"), "value": str(float(v))} for d, v in series],
        "projection": projection,
    }
