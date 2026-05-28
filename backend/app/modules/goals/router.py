from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.goal import Goal
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.goals.schemas import GoalCreate, GoalOut, GoalUpdate

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
