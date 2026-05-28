from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    # NULL = categoría del sistema (compartida, solo lectura). Con valor =
    # categoría propia del usuario, editable únicamente por su dueño.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    color: Mapped[str | None] = mapped_column(String(9), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)

    user = relationship("User")
    parent = relationship("Category", remote_side="Category.id", back_populates="children")
    children = relationship("Category", back_populates="parent")
    transactions = relationship("Transaction", back_populates="category")
    category_rules = relationship("CategoryRule", back_populates="target_category")
    budgets = relationship("Budget", back_populates="category")
