from __future__ import annotations

import datetime

import jwt
from fastapi import Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.revoked_token import RevokedToken
from app.models.user import User

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


def set_auth_cookies(response: Response, user: User) -> None:
    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    cookie_args = {
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": "lax",
        "path": "/",
    }
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        max_age=settings.JWT_ACCESS_EXPIRE_MINUTES * 60,
        **cookie_args,
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=settings.JWT_REFRESH_EXPIRE_DAYS * 86400,
        **cookie_args,
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")


async def is_token_revoked(db: AsyncSession, jti: str | None) -> bool:
    if not jti:
        return False
    result = await db.execute(select(RevokedToken.jti).where(RevokedToken.jti == jti))
    return result.scalar_one_or_none() is not None


async def revoke_jti(db: AsyncSession, jti: str, exp: int | None) -> None:
    """Añade un `jti` a la lista de denegación y purga los ya expirados."""
    if not jti:
        return
    expires_at = (
        datetime.datetime.fromtimestamp(exp, tz=datetime.UTC)
        if exp is not None
        else datetime.datetime.now(datetime.UTC)
    )
    now = datetime.datetime.now(datetime.UTC)
    await db.execute(delete(RevokedToken).where(RevokedToken.expires_at < now))
    if not await is_token_revoked(db, jti):
        db.add(RevokedToken(jti=jti, expires_at=expires_at))


async def revoke_cookie_token(db: AsyncSession, token: str | None, expected_type: str) -> None:
    """Revoca el token contenido en una cookie. Ignora tokens ausentes,
    inválidos o ya expirados (no hay nada que revocar)."""
    if not token:
        return
    try:
        payload = decode_token(token, expected_type)
    except jwt.PyJWTError:
        return
    await revoke_jti(db, payload.get("jti"), payload.get("exp"))
