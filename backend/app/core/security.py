from __future__ import annotations

import datetime
import secrets

import bcrypt
import jwt

from app.core.config import settings

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt(rounds=12)
    ).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(
        password.encode("utf-8"), hashed.encode("utf-8")
    )


def create_token(subject: str, token_type: str, expires_delta: datetime.timedelta) -> str:
    now = datetime.datetime.now(datetime.UTC)
    payload = {
        "sub": subject,
        "typ": token_type,
        "jti": secrets.token_hex(16),
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(subject: str) -> str:
    return create_token(
        subject,
        ACCESS_TOKEN_TYPE,
        datetime.timedelta(minutes=settings.JWT_ACCESS_EXPIRE_MINUTES),
    )


def create_refresh_token(subject: str) -> str:
    return create_token(
        subject,
        REFRESH_TOKEN_TYPE,
        datetime.timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS),
    )


def decode_token(token: str, expected_type: str = ACCESS_TOKEN_TYPE) -> dict:
    payload = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
    )
    if payload.get("typ") != expected_type:
        raise jwt.InvalidTokenError("Invalid token type")
    return payload
