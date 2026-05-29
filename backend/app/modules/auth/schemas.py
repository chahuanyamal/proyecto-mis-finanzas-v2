from __future__ import annotations

import re
from uuid import UUID

from pydantic import BaseModel, Field, field_serializer, field_validator


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=1, max_length=100)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)

    @field_validator("new_password")
    @classmethod
    def _check(cls, v: str) -> str:
        failures = []
        if len(v) < 8:
            failures.append("minimo 8 caracteres")
        if not re.search(r"[A-Z]", v):
            failures.append("al menos una mayuscula")
        if not re.search(r"[0-9]", v):
            failures.append("al menos un numero")
        if not re.search(r"[^A-Za-z0-9]", v):
            failures.append("al menos un caracter especial")
        if failures:
            raise ValueError("Contrasena debil: " + ", ".join(failures))
        return v


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
