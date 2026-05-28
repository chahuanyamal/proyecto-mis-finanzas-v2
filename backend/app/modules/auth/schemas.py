from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field, field_serializer


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=1, max_length=100)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=1, max_length=100)


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    is_active: bool
    is_admin: bool
    preferences: dict | None = None

    model_config = {"from_attributes": True}

    @field_serializer("id")
    def serialize_id(self, value: UUID) -> str:
        return str(value)


class LoginResponse(BaseModel):
    user: UserOut
