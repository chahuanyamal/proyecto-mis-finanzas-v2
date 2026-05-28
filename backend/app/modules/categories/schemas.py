from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, field_serializer


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    parent_id: uuid.UUID | None = None
    color: str | None = Field(default=None, max_length=9)
    icon: str | None = Field(default=None, max_length=50)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    parent_id: uuid.UUID | None = None
    color: str | None = Field(default=None, max_length=9)
    icon: str | None = Field(default=None, max_length=50)


class CategoryOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    name: str
    parent_id: uuid.UUID | None
    color: str | None
    icon: str | None

    model_config = {"from_attributes": True}

    @field_serializer("id", "parent_id", "user_id")
    def serialize_uuid(self, value: uuid.UUID | None) -> str | None:
        return str(value) if value is not None else None
