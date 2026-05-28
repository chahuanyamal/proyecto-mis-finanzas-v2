from __future__ import annotations

import datetime
import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_serializer

from app.modules.accounts.schemas import AccountOut
from app.modules.categories.schemas import CategoryOut
from app.modules.tags.schemas import TagOut

MovementType = Literal["income", "expense"]


class TransactionCreate(BaseModel):
    account_id: uuid.UUID
    category_id: uuid.UUID | None = None
    date: datetime.date
    description: str = Field(min_length=1)
    amount: Decimal
    currency: str = Field(default="CLP", max_length=3)
    movement_type: MovementType
    notes: str | None = None


class TransactionUpdate(BaseModel):
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    date: datetime.date | None = None
    description: str | None = Field(default=None, min_length=1)
    amount: Decimal | None = None
    currency: str | None = Field(default=None, max_length=3)
    movement_type: MovementType | None = None
    notes: str | None = None
    is_internal_transfer: bool | None = None
    is_duplicate: bool | None = None


class SplitIn(BaseModel):
    category_id: uuid.UUID | None = None
    amount: Decimal = Field(gt=0)
    notes: str | None = None


class SplitOut(BaseModel):
    id: uuid.UUID
    transaction_id: uuid.UUID
    category_id: uuid.UUID | None
    amount: Decimal
    notes: str | None
    category: CategoryOut | None = None

    model_config = {"from_attributes": True}

    @field_serializer("id", "transaction_id", "category_id")
    def serialize_uuid(self, value: uuid.UUID | None) -> str | None:
        return str(value) if value is not None else None

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return str(value)


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
    notes: str | None = None
    is_flagged: bool = False
    flag_reason: str | None = None
    is_internal_transfer: bool = False
    is_duplicate: bool = False
    account: AccountOut | None = None
    category: CategoryOut | None = None
    tags: list[TagOut] = []
    splits: list[SplitOut] = []

    model_config = {"from_attributes": True}

    @field_serializer("id", "user_id", "uploaded_file_id", "account_id", "category_id")
    def serialize_uuid(self, value: uuid.UUID | None) -> str | None:
        return str(value) if value is not None else None

    @field_serializer("amount")
    def serialize_amount(self, value: Decimal) -> str:
        return str(value)


class CurrencyTotals(BaseModel):
    income: str
    expense: str
    count: int


class TransactionSummary(BaseModel):
    total_count: int
    uncategorized_count: int
    by_currency: dict[str, CurrencyTotals]


class BulkCategoryIn(BaseModel):
    transaction_ids: list[uuid.UUID] = Field(min_length=1)
    category_id: uuid.UUID | None = None


class BulkTagsIn(BaseModel):
    transaction_ids: list[uuid.UUID] = Field(min_length=1)
    tag_ids: list[uuid.UUID] = []


class BulkDeleteIn(BaseModel):
    transaction_ids: list[uuid.UUID] = Field(min_length=1)


class NotesIn(BaseModel):
    notes: str | None = None


class FlagIn(BaseModel):
    is_flagged: bool = True
    reason: str | None = None


class TagsIn(BaseModel):
    tag_ids: list[uuid.UUID] = []
