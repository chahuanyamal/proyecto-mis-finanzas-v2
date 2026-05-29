from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from pydantic import BaseModel, Field, field_serializer


class GoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    target_amount: Decimal = Field(gt=0)
    current_amount: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="CLP", max_length=3)
    target_date: datetime.date | None = None


class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    target_amount: Decimal | None = Field(default=None, gt=0)
    current_amount: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=3)
    target_date: datetime.date | None = None


class GoalDeposit(BaseModel):
    amount: Decimal = Field(gt=0)
    date: datetime.date | None = None
    note: str | None = Field(default=None, max_length=500)


class GoalContributionOut(BaseModel):
    id: uuid.UUID
    goal_id: uuid.UUID
    user_id: uuid.UUID
    date: datetime.date
    amount: Decimal
    note: str | None

    model_config = {"from_attributes": True}

    @field_serializer("id", "goal_id", "user_id")
    def serialize_contribution_uuid(self, value: uuid.UUID) -> str:
        return str(value)

    @field_serializer("amount")
    def serialize_contribution_amount(self, value: Decimal) -> str:
        return str(value)


class GoalOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    target_amount: Decimal
    current_amount: Decimal
    currency: str
    target_date: datetime.date | None
    percent: int = 0

    model_config = {"from_attributes": True}

    @field_serializer("id", "user_id")
    def serialize_uuid(self, value: uuid.UUID) -> str:
        return str(value)

    @field_serializer("target_amount", "current_amount")
    def serialize_amount(self, value: Decimal) -> str:
        return str(value)
