from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.goal import Goal, GoalContribution
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.audit.service import log_audit
from app.modules.goals.schemas import GoalContributionOut, GoalCreate, GoalDeposit, GoalOut, GoalUpdate

router = APIRouter(prefix="/api/v1/goals", tags=["goals"])


def _to_out(goal: Goal) -> GoalOut:
    out = GoalOut.model_validate(goal)
    if goal.target_amount and goal.target_amount > 0:
        out.percent = int((Decimal(goal.current_amount) / Decimal(goal.target_amount)) * 100)
    return out


async def _goal_or_404(goal_id: uuid.UUID, db: AsyncSession, current_user: User) -> Goal:
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id)
    )
    goal = result.scalar_one_or_none()
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meta no encontrada")
    return goal


@router.get("", response_model=list[GoalOut])
async def list_goals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GoalOut]:
    result = await db.execute(
        select(Goal).where(Goal.user_id == current_user.id).order_by(Goal.created_at.desc())
    )
    return [_to_out(goal) for goal in result.scalars().all()]


@router.post("", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
async def create_goal(
    body: GoalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalOut:
    goal = Goal(user_id=current_user.id, **body.model_dump())
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return _to_out(goal)


@router.patch("/{goal_id}", response_model=GoalOut)
async def update_goal(
    goal_id: uuid.UUID,
    body: GoalUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalOut:
    goal = await _goal_or_404(goal_id, db, current_user)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    await db.commit()
    await db.refresh(goal)
    return _to_out(goal)


@router.post("/{goal_id}/deposit", response_model=GoalOut)
async def deposit_goal(
    goal_id: uuid.UUID,
    body: GoalDeposit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalOut:
    goal = await _goal_or_404(goal_id, db, current_user)
    contribution = GoalContribution(
        goal_id=goal.id,
        user_id=current_user.id,
        amount=body.amount,
        date=body.date or datetime.date.today(),
        note=body.note,
    )
    goal.current_amount = Decimal(goal.current_amount or 0) + body.amount
    db.add(contribution)
    await log_audit(db, user_id=current_user.id, action="deposit", entity_type="goal", entity_id=str(goal.id), metadata={"amount": str(body.amount), "note": body.note})
    await db.commit()
    await db.refresh(goal)
    return _to_out(goal)


@router.get("/{goal_id}/contributions", response_model=list[GoalContributionOut])
async def list_goal_contributions(
    goal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GoalContribution]:
    await _goal_or_404(goal_id, db, current_user)
    result = await db.execute(
        select(GoalContribution)
        .where(GoalContribution.goal_id == goal_id, GoalContribution.user_id == current_user.id)
        .order_by(GoalContribution.date.desc(), GoalContribution.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    goal = await _goal_or_404(goal_id, db, current_user)
    await db.delete(goal)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
