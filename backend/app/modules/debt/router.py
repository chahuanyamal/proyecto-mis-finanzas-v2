"""Router para debt payoff planner."""
from __future__ import annotations

import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.account import Account
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.debt.service import DebtCompareResult, DebtPayoffResult, PayoffProjection, compare_payoff_strategies, simulate_payoff

router = APIRouter(prefix="/api/v1/debt", tags=["debt"])

CREDIT_CARD_TYPES = {"credit"}


async def _get_debt_accounts(db: AsyncSession, user: User) -> list[Account]:
    result = await db.execute(
        select(Account).where(Account.user_id == user.id)
    )
    accounts = result.scalars().all()
    return [a for a in accounts if a.account_type in CREDIT_CARD_TYPES]


@router.get("/accounts")
async def list_debt_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Lista cuentas de banco que son susceptibles de deuda (tarjetas, préstamos)."""
    accounts = await _get_debt_accounts(db, current_user)
    return [
        {
            "id": str(a.id),
            "name": a.name,
            "account_type": a.account_type,
            "currency": a.currency,
            "balance": str(a.balance),
            "institution": a.institution.name if a.institution else None,
        }
        for a in accounts
    ]


@router.post("/simulate")
async def simulate_payoff_endpoint(
    current_balance: str,
    annual_rate: str,
    minimum_payment: str,
    extra_payment: str = "0",
    account_name: str = "Cuenta",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DebtPayoffResult:
    """Simula el payoff de una deuda con estrategia de pago mínimo + extra."""
    try:
        balance = Decimal(current_balance)
        rate = Decimal(annual_rate)
        min_pmt = Decimal(minimum_payment)
        extra = Decimal(extra_payment)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Montos inválidos")

    months, total_interest, total_paid, schedule = simulate_payoff(balance, rate, min_pmt, extra)
    payoff_date = datetime.date.today() + datetime.timedelta(days=months * 30)

    projection = PayoffProjection(
        months_to_payoff=months,
        total_interest_paid=total_interest,
        total_amount_paid=total_paid,
        payoff_date=payoff_date.isoformat(),
        monthly_schedule=schedule[:6],
    )

    return DebtPayoffResult(
        account_name=account_name,
        current_balance=current_balance,
        interest_rate=annual_rate,
        strategy=f"mínimo + ${extra} extra",
        projection=projection,
    )


@router.post("/compare")
async def compare_strategies(
    current_balance: str,
    annual_rate: str,
    minimum_payment: str,
    account_name: str = "Cuenta",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Compara múltiples estrategias de pago para una deuda."""
    try:
        balance = Decimal(current_balance)
        rate = Decimal(annual_rate)
        min_pmt = Decimal(minimum_payment)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Montos inválidos")

    results = compare_payoff_strategies(balance, rate, min_pmt)

    return {
        "account_name": account_name,
        "current_balance": current_balance,
        "annual_rate": annual_rate,
        "minimum_payment": minimum_payment,
        "strategies": results,
    }


@router.post("/snowball")
async def debt_snowball(
    accounts: list[dict],
    extra_monthly: str = "0",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Deuda snowball: ordena cuentas por saldo y aplica extra al menor, luego al siguiente."""
    try:
        extra = Decimal(extra_monthly)
    except Exception:
        extra = Decimal("0")

    formatted = []
    total_debt = Decimal("0")

    for acc in accounts:
        try:
            balance = Decimal(str(acc.get("balance", "0")))
            rate = Decimal(str(acc.get("rate", "0")))
            min_pmt = Decimal(str(acc.get("minimum", "0")))
        except Exception:
            continue

        if balance <= 0:
            continue

        total_debt += balance

        months, interest, total, schedule = simulate_payoff(balance, rate, min_pmt)
        payoff_date = datetime.date.today() + datetime.timedelta(days=months * 30)

        formatted.append({
            "name": acc.get("name", "Cuenta"),
            "balance": str(balance),
            "rate": str(rate),
            "months_to_payoff": months,
            "total_interest": str(interest),
            "payoff_date": payoff_date.isoformat(),
            "order": 0,
        })

    formatted.sort(key=lambda x: Decimal(x["balance"]))

    for i, acc in enumerate(formatted):
        acc["order"] = i + 1

    return {
        "accounts": formatted,
        "total_debt": str(total_debt),
        "extra_monthly": str(extra),
        "recommended_order": [a["name"] for a in formatted],
    }