from __future__ import annotations

import datetime
import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_serializer


class UploadedFileOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    user_id: uuid.UUID
    filename: str
    bank_detected: str | None
    period_start: datetime.date | None
    period_end: datetime.date | None
    status: str

    model_config = {"from_attributes": True}

    @field_serializer("id", "account_id", "user_id")
    def serialize_uuid(self, value: uuid.UUID) -> str:
        return str(value)


class StatementUploadResponse(BaseModel):
    uploaded_file: UploadedFileOut
    imported_transactions: int


class ParserOption(BaseModel):
    key: str
    display_name: str
    subformats: list[dict[str, str]] = Field(default_factory=list)


class PreviewRow(BaseModel):
    date: str
    description: str = Field(max_length=500)
    amount: str
    movement_type: Literal["income", "expense"]


class PreviewRowUpdate(BaseModel):
    rows: list[PreviewRow]


class PreviewSummary(BaseModel):
    total_rows: int
    total_income: str
    total_expenses: str
    date_start: str | None
    date_end: str | None


class StatementPreviewOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    user_id: uuid.UUID
    filename: str
    bank_detected: str | None
    status: str
    rows: list[dict]
    summary: PreviewSummary | None = None

    model_config = {"from_attributes": True}

    @field_serializer("id", "account_id", "user_id")
    def serialize_uuid(self, value: uuid.UUID) -> str:
        return str(value)


class StatementConfirmResponse(BaseModel):
    uploaded_file: UploadedFileOut
    imported_transactions: int
    possible_duplicates: list[str] = Field(default_factory=list)


class StatementQualityOut(BaseModel):
    uploaded_file_id: str
    parser: str | None
    status: str
    transaction_count: int
    income_count: int
    expense_count: int
    duplicate_count: int
    uncategorized_count: int
    internal_transfer_count: int
    period_start: str | None
    period_end: str | None
    warnings: list[str] = Field(default_factory=list)
