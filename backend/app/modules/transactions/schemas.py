from __future__ import annotations

import datetime
import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_serializer

from app.modules.accounts.schemas import AccountOut
from app.modules.categories.schemas import CategoryOut

MovementType = Literal["income", "expense"]


class TransactionCreate(BaseModel):
    account_id: uuid.UUID
    category_id: uuid.UUID | None = None
    date: datetime.date
    description: str = Field(min_length=1)
    amount: Decimal
    currency: str = Field(default="CLP", max_length=3)
    movement_type: MovementType


class TransactionUpdate(BaseModel):
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    date: datetime.date | None = None
    description: str | None = Field(default=None, min_length=1)
    amount: Decimal | None = None
    currency: str | None = Field(default=None, max_length=3)
    movement_type: MovementType | None = None


class TransactionOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    uploaded_file_id: uuid.UUID
    account_id: uuid.UUID
    category_id: uuid.UUID | None
    date: datetime.date
    description: str
    amount: Decimal
    currency: str
    movement_type: str
    account: AccountOut | None = None
    category: CategoryOut | None = None

    model_config = {"from_attributes": True}

    @field_serializer("id", "user_id", "uploaded_file_id", "account_id", "category_id")
    def serialize_uuid(self, value: uuid.UUID | None) -> str | None:
        return str(value) if value is not None else None

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return str(value)
