from __future__ import annotations

import uuid
import datetime

from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class UploadedFile(Base, TimestampMixin):
    __tablename__ = "uploaded_files"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    bank_detected: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    period_start: Mapped[datetime.date | None] = mapped_column(
        Date, nullable=True
    )
    period_end: Mapped[datetime.date | None] = mapped_column(
        Date, nullable=True
    )
    opening_balance: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    closing_balance: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )

    account = relationship("Account", back_populates="uploaded_files")
    uploaded_by = relationship("User", back_populates="uploaded_files")
    transactions = relationship(
        "Transaction", back_populates="uploaded_file", cascade="all, delete-orphan"
    )
