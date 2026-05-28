from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, field_serializer


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=9)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=9)


class TagOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    color: str | None

    model_config = {"from_attributes": True}

    @field_serializer("id", "user_id")
    def serialize_uuid(self, value: uuid.UUID) -> str:
        return str(value)
