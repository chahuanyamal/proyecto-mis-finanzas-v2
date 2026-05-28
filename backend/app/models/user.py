from __future__ import annotations

import uuid

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    hashed_password: Mapped[str] = mapped_column(nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(default=False, nullable=False)
    preferences: Mapped[dict | None] = mapped_column(JSONB, default=dict)

    accounts = relationship("Account", back_populates="user")
    uploaded_files = relationship("UploadedFile", back_populates="uploaded_by")
    category_rules = relationship("CategoryRule", back_populates="user")
    budgets = relationship("Budget", back_populates="user")
    tags = relationship("Tag", back_populates="user")
