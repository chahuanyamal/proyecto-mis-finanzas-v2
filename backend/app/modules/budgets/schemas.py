from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel, Field, field_serializer

from app.modules.categories.schemas import CategoryOut


class BudgetCreate(BaseModel):
    category_id: uuid.UUID
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    amount: Decimal = Field(gt=0)
    alert_at_percent: int = Field(default=80, ge=1, le=100)


class BudgetUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    alert_at_percent: int | None = Field(default=None, ge=1, le=100)


class BudgetOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    category_id: uuid.UUID
    month: str
    amount: Decimal
    alert_at_percent: int
    category: CategoryOut | None = None

    model_config = {"from_attributes": True}

    @field_serializer("id", "user_id", "category_id")
    def serialize_uuid(self, value: uuid.UUID) -> str:
        return str(value)

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return str(value)


class BudgetSuggestion(BaseModel):
    category_id: uuid.UUID
    category_name: str
    suggested_amount: Decimal
    avg_monthly: Decimal
    months_observed: int

    @field_serializer("category_id")
    def _ser_cat(self, value: uuid.UUID) -> str:
        return str(value)

    @field_serializer("suggested_amount", "avg_monthly")
    def _ser_amt(self, value: Decimal) -> str:
        return str(value)
