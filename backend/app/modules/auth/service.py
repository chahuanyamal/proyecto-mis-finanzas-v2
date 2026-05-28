from __future__ import annotations

from fastapi import Response

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token
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
