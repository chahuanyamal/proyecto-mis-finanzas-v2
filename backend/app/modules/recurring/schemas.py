from __future__ import annotations

import datetime
import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_serializer

Frequency = Literal["weekly", "monthly", "yearly"]
MovementType = Literal["income", "expense"]


class RecurringCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0)
    currency: str = Field(default="CLP", max_length=3)
    frequency: Frequency = "monthly"
    movement_type: MovementType = "expense"
    category_id: uuid.UUID | None = None
    next_date: datetime.date | None = None
    active: bool = True


class RecurringUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0)
    currency: str | None = Field(default=None, max_length=3)
    frequency: Frequency | None = None
    movement_type: MovementType | None = None
    category_id: uuid.UUID | None = None
    next_date: datetime.date | None = None
    active: bool | None = None


class RecurringOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    category_id: uuid.UUID | None
    name: str
    amount: Decimal
    currency: str
    frequency: str
    movement_type: str
    next_date: datetime.date | None
    active: bool

    model_config = {"from_attributes": True}

    @field_serializer("id", "user_id", "category_id")
    def serialize_uuid(self, value: uuid.UUID | None) -> str | None:
        return str(value) if value is not None else None

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return str(value)


class RecurringDetectItem(BaseModel):
    name: str
    amount: Decimal
    currency: str
    movement_type: MovementType
    frequency: Frequency
    next_date: datetime.date | None
    occurrences: int

    @field_serializer("amount")
    def serialize_detect_amount(self, value: Decimal) -> str:
        return str(value)


class RecurringDetectResult(BaseModel):
    detected: int
    created: int
    items: list[RecurringDetectItem]


class UpcomingRecurring(BaseModel):
    id: uuid.UUID
    name: str
    amount: Decimal
    currency: str
    movement_type: str
    frequency: str
    due_date: datetime.date
    days_until: int

    @field_serializer("id")
    def serialize_upcoming_id(self, value: uuid.UUID) -> str:
        return str(value)

    @field_serializer("amount")
    def serialize_upcoming_amount(self, value: Decimal) -> str:
        return str(value)
