from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, field_serializer

from app.modules.categories.schemas import CategoryOut


class CategoryRuleCreate(BaseModel):
    target_category_id: uuid.UUID
    field: str = Field(default="description", max_length=50)
    operator: str = Field(default="contains", max_length=20)
    pattern: str = Field(min_length=1)
    priority: int = 0


class CategoryRuleUpdate(BaseModel):
    target_category_id: uuid.UUID | None = None
    field: str | None = Field(default=None, max_length=50)
    operator: str | None = Field(default=None, max_length=20)
    pattern: str | None = Field(default=None, min_length=1)
    priority: int | None = None


class CategoryRuleOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    target_category_id: uuid.UUID
    field: str
    operator: str
    pattern: str
    priority: int
    target_category: CategoryOut | None = None

    model_config = {"from_attributes": True}

    @field_serializer("id", "user_id", "target_category_id")
    def serialize_uuid(self, value: uuid.UUID) -> str:
        return str(value)


class RulePreviewRequest(BaseModel):
    field: str = Field(default="description", max_length=50)
    operator: str = Field(default="contains", max_length=20)
    pattern: str = Field(min_length=1)


class RulePreviewSample(BaseModel):
    id: uuid.UUID
    date: str
    description: str
    amount: str
    has_category: bool

    @field_serializer("id")
    def serialize_sample_id(self, value: uuid.UUID) -> str:
        return str(value)


class RulePreviewResult(BaseModel):
    count: int
    uncategorized: int
    samples: list[RulePreviewSample]


class RuleApplyResult(BaseModel):
    matched: int
    updated: int


class RuleSuggestion(BaseModel):
    field: str
    operator: str
    pattern: str
    target_category_id: uuid.UUID
    target_category_name: str
    match_count: int
    sample: str

    @field_serializer("target_category_id")
    def _ser_cat(self, v: uuid.UUID) -> str:
        return str(v)
