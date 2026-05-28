from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class CategoryRule(Base, TimestampMixin):
    __tablename__ = "category_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    field: Mapped[str] = mapped_column(
        String(50), nullable=False, default="description"
    )
    operator: Mapped[str] = mapped_column(
        String(20), nullable=False, default="contains"
    )
    pattern: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    user = relationship("User", back_populates="category_rules")
    target_category = relationship("Category", back_populates="category_rules")
    transactions = relationship("Transaction", back_populates="category_rule")
