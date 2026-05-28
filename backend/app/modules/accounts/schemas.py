from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_serializer

AccountType = Literal["checking", "credit", "savings", "cash"]
Currency = Literal["CLP", "USD"]


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    account_type: AccountType = "checking"
    currency: Currency = "CLP"
    balance: Decimal = Field(default=Decimal("0"))
    institution_id: uuid.UUID | None = None


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    account_type: AccountType | None = None
    currency: Currency | None = None
    balance: Decimal | None = None
    institution_id: uuid.UUID | None = None


class InstitutionOut(BaseModel):
    id: uuid.UUID
    name: str
    country: str

    model_config = {"from_attributes": True}

    @field_serializer("id")
    def serialize_id(self, value: uuid.UUID) -> str:
        return str(value)


class AccountOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    institution_id: uuid.UUID | None
    name: str
    account_type: str
    currency: str
    balance: Decimal
    institution: InstitutionOut | None = None

    model_config = {"from_attributes": True}

    @field_serializer("id", "user_id", "institution_id")
    def serialize_uuid(self, value: uuid.UUID | None) -> str | None:
        return str(value) if value is not None else None

    @field_serializer("balance")
    def serialize_balance(self, value: Decimal) -> str:
        return str(value)
