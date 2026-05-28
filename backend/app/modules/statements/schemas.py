from __future__ import annotations

import datetime
import uuid

from pydantic import BaseModel, field_serializer


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
