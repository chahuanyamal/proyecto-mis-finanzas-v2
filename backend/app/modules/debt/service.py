"""Módulo debt payoff planner: simulator projections for credit cards and loans."""
from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class DebtAccountInput(BaseModel):
    account_id: str
    name: str
    debt_type: Literal["credit_card", "loan", "line_of_credit"]
    current_balance: Decimal
    interest_rate_annual: Decimal
    minimum_payment: Decimal
    due_day: int = Field(ge=1, le=31, default=15)


class PaymentStrategy(BaseModel):
    name: str
    description: str
    extra_payment: Decimal = Decimal("0")


class PayoffProjection(BaseModel):
    months_to_payoff: int
    total_interest_paid: Decimal
    total_amount_paid: Decimal
    payoff_date: str
    monthly_schedule: list[dict]


class DebtPayoffResult(BaseModel):
    account_name: str
    current_balance: str
    interest_rate: str
    strategy: str
    projection: PayoffProjection


class DebtCompareResult(BaseModel):
    accounts: list[DebtPayoffResult]
    recommended_order: list[str]
    total_debt: str
    estimated_free_date: str


def simulate_payoff(
    balance: Decimal,
    annual_rate: Decimal,
    minimum_payment: Decimal,
    extra_payment: Decimal = Decimal("0"),
    start_date: datetime.date | None = None,
) -> tuple[int, Decimal, Decimal, list[dict]]:
    if start_date is None:
        start_date = datetime.date.today()

    monthly_rate = annual_rate / Decimal("12")

    if monthly_rate == 0 or minimum_payment <= 0:
        months = int(balance / minimum_payment) if minimum_payment > 0 else 0
        return months, Decimal("0"), balance, []

    balance = Decimal(str(balance))
    minimum_payment = Decimal(str(minimum_payment))
    extra_payment = Decimal(str(extra_payment))

    total_interest = Decimal("0")
    total_paid = Decimal("0")
    schedule = []
    current_date = start_date.replace(day=1) + datetime.timedelta(days=31)
    current_date = current_date.replace(day=min(current_date.day, 28))

    month_count = 0
    max_months = 360

    while balance > 0 and month_count < max_months:
        month_count += 1

        interest = (balance * monthly_rate).quantize(Decimal("0.01"))
        total_interest += interest

        payment = minimum_payment + extra_payment

        if payment >= balance + interest:
            payment = balance + interest

        principal = payment - interest
        balance -= principal
        total_paid += payment

        if balance < 0:
            balance = Decimal("0")

        schedule.append({
            "month": month_count,
            "date": current_date.isoformat(),
            "payment": str(payment),
            "principal": str(principal),
            "interest": str(interest),
            "balance": str(balance),
        })

        current_date = (current_date + datetime.timedelta(days=31)).replace(day=min(current_date.day, 28))

    return month_count, total_interest, total_paid, schedule


def compare_payoff_strategies(
    balance: Decimal,
    annual_rate: Decimal,
    minimum_payment: Decimal,
) -> list[dict]:
    strategies = [
        PaymentStrategy(name="minimum_only", description="Solo pagos mínimos", extra_payment=Decimal("0")),
        PaymentStrategy(name="extra_10pct", description="10% extra sobre mínimo", extra_payment=minimum_payment * Decimal("0.1")),
        PaymentStrategy(name="extra_20pct", description="20% extra sobre mínimo", extra_payment=minimum_payment * Decimal("0.2")),
        PaymentStrategy(name="fixed_50k", description="$50.000 fijo extra", extra_payment=Decimal("50000")),
        PaymentStrategy(name="fixed_100k", description="$100.000 fijo extra", extra_payment=Decimal("100000")),
    ]

    results = []
    for s in strategies:
        months, interest, total, schedule = simulate_payoff(balance, annual_rate, minimum_payment, s.extra_payment)
        payoff_date = datetime.date.today() + datetime.timedelta(days=months * 30)
        results.append({
            "strategy": s.name,
            "description": s.description,
            "extra_payment": str(s.extra_payment),
            "months_to_payoff": months,
            "total_interest": str(interest),
            "total_paid": str(total),
            "payoff_date": payoff_date.isoformat(),
            "schedule": schedule[:6],
        })

    return results