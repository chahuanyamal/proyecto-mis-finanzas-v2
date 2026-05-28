from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.account import Account
from app.models.institution import Institution
from app.models.user import User
from app.modules.accounts.schemas import AccountCreate, AccountOut, AccountUpdate, InstitutionOut
from app.modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/v1", tags=["accounts"])


async def _get_institution_or_404(institution_id: uuid.UUID, db: AsyncSession) -> Institution:
    result = await db.execute(select(Institution).where(Institution.id == institution_id))
    institution = result.scalar_one_or_none()
    if institution is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Institución no encontrada")
    return institution


async def _get_account_or_404(
    account_id: uuid.UUID,
    db: AsyncSession,
    current_user: User,
) -> Account:
    result = await db.execute(
        select(Account)
        .options(selectinload(Account.institution))
        .where(Account.id == account_id, Account.user_id == current_user.id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cuenta no encontrada")
    return account


@router.get("/institutions", response_model=list[InstitutionOut])
async def list_institutions(db: AsyncSession = Depends(get_db)) -> list[Institution]:
    result = await db.execute(select(Institution).order_by(Institution.name))
    return list(result.scalars().all())


@router.get("/accounts", response_model=list[AccountOut])
async def list_accounts(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Account]:
    result = await db.execute(
        select(Account)
        .options(selectinload(Account.institution))
        .where(Account.user_id == current_user.id)
        .order_by(Account.name)
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post("/accounts", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(
    body: AccountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Account:
    if body.institution_id is not None:
        await _get_institution_or_404(body.institution_id, db)

    account = Account(user_id=current_user.id, **body.model_dump())
    db.add(account)
    await db.flush()
    account_id = account.id
    await db.commit()
    return await _get_account_or_404(account_id, db, current_user)


@router.get("/accounts/{account_id}", response_model=AccountOut)
async def get_account(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Account:
    return await _get_account_or_404(account_id, db, current_user)


@router.patch("/accounts/{account_id}", response_model=AccountOut)
async def update_account(
    account_id: uuid.UUID,
    body: AccountUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Account:
    account = await _get_account_or_404(account_id, db, current_user)
    changes = body.model_dump(exclude_unset=True)
    if "institution_id" in changes and changes["institution_id"] is not None:
        await _get_institution_or_404(changes["institution_id"], db)

    for field, value in changes.items():
        setattr(account, field, value)

    await db.commit()
    return await _get_account_or_404(account_id, db, current_user)


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    account = await _get_account_or_404(account_id, db, current_user)
    await db.delete(account)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
