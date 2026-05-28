from __future__ import annotations

from pydantic import BaseModel, Field


class SettingsOut(BaseModel):
    email: str
    full_name: str
    preferences: dict | None = None


class SettingsUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    # Preferencias arbitrarias (tema, moneda por defecto, locale…). Se fusionan
    # con las existentes en vez de reemplazarlas por completo.
    preferences: dict | None = None
