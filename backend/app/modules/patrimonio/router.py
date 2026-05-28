from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.account import Account
from app.models.user import User
from app.modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/v1/patrimonio", tags=["patrimonio"])


@router.get("")
async def net_worth(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Patrimonio neto: agrega los saldos de las cuentas del usuario por moneda.

    Los saldos de distinta moneda no se suman entre sí (no hay tipo de cambio
    en la v2); se reportan totales por moneda."""
    result = await db.execute(
        select(Account).where(Account.user_id == current_user.id).order_by(Account.name)
    )
    accounts = list(result.scalars().all())

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
