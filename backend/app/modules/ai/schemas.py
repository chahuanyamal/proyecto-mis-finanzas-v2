from __future__ import annotations

from pydantic import BaseModel, Field


class AiConfigOut(BaseModel):
    provider: str = "ollama"
    base_url: str = ""
    model: str = ""
    has_token: bool = False
    enabled: bool = False


class AiConfigUpdate(BaseModel):
    provider: str = Field(default="ollama", max_length=40)
    base_url: str = Field(default="", max_length=500)
    model: str = Field(default="", max_length=120)
    token: str | None = Field(default=None, max_length=400)


class AiTestResult(BaseModel):
    ok: bool
    detail: str
    model: str | None = None


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    currency: str = Field(default="CLP", max_length=3)


class AskResponse(BaseModel):
    answer: str
    model: str
    context_used: list[str]
