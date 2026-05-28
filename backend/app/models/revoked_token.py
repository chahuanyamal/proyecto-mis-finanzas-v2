from __future__ import annotations

import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RevokedToken(Base):
    """Lista de denegación de tokens JWT por su `jti`. Permite invalidar
    tokens (logout / rotación de refresh) sin depender de Redis."""

    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(32), primary_key=True)
    # Hasta cuándo seguía siendo válido el token: pasado este punto ya no hace
    # falta conservarlo en la lista (se purga).
    expires_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
