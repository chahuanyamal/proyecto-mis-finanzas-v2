from __future__ import annotations

import datetime
import uuid

from pydantic import BaseModel, field_serializer


class AttachmentOut(BaseModel):
    id: uuid.UUID
    transaction_id: uuid.UUID
    filename: str
    content_type: str
    size: int
    created_at: datetime.datetime

    model_config = {"from_attributes": True}

    @field_serializer("id", "transaction_id")
    def _ser(self, v: uuid.UUID) -> str:
        return str(v)
