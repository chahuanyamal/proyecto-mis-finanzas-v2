"""Tests para el servicio de debt payoff."""
from __future__ import annotations

from decimal import Decimal

from app.modules.debt.service import compare_payoff_strategies, simulate_payoff


def test_simulate_payoff_credit_card():
    balance = Decimal("500000")
    rate = Decimal("0.35")
    min_pmt = Decimal("25000")

    months, total_interest, total_paid, schedule = simulate_payoff(
        balance, rate, min_pmt, Decimal("0")
    )

    assert months > 0
    assert total_interest > 0
    assert total_paid > balance
    assert len(schedule) > 0
    assert schedule[0]["balance"] < str(balance)


def test_simulate_payoff_with_extra():
    balance = Decimal("500000")
    rate = Decimal("0.35")
    min_pmt = Decimal("25000")

    _, interest_min, _, _ = simulate_payoff(balance, rate, min_pmt, Decimal("0"))
    _, interest_extra, _, _ = simulate_payoff(balance, rate, min_pmt, Decimal("50000"))

    assert interest_extra < interest_min


def test_simulate_payoff_zero_balance():
    months, interest, total, _ = simulate_payoff(
        Decimal("0"), Decimal("0.35"), Decimal("10000"), Decimal("0")
    )
    assert months == 0


def test_compare_strategies_returns_multiple():
    results = compare_payoff_strategies(
        Decimal("500000"), Decimal("0.35"), Decimal("25000")
    )
    assert len(results) == 5
    names = [r["strategy"] for r in results]
    assert "minimum_only" in names
    assert "fixed_50k" in names


def test_compare_strategies_sorts_by_months():
    results = compare_payoff_strategies(
        Decimal("500000"), Decimal("0.35"), Decimal("25000")
    )
    months_list = [r["months_to_payoff"] for r in results]
    assert months_list == sorted(months_list)