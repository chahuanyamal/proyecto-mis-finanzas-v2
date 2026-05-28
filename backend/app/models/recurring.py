from __future__ import annotations

import datetime
import uuid
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class RecurringExpense(Base, TimestampMixin):
    """Gasto/ingreso recurrente (suscripciones, sueldos, arriendos…)."""

    __tablename__ = "recurring_expenses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CLP")
    # monthly | weekly | yearly
    frequency: Mapped[str] = mapped_column(String(10), nullable=False, default="monthly")
    movement_type: Mapped[str] = mapped_column(String(10), nullable=False, default="expense")
    next_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user = relationship("User", back_populates="recurring_expenses")
    category = relationship("Category")
