from __future__ import annotations

import uuid

from pydantic import BaseModel


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    is_admin: bool
    preferences: dict | None = None

    model_config = {"from_attributes": True}


class AdminUserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    is_active: bool = True
    is_admin: bool = False


class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None
    is_admin: bool | None = None
