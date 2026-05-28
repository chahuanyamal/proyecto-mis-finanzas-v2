from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jwt import PyJWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import REFRESH_TOKEN_TYPE, decode_token, hash_password, verify_password
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.auth.schemas import LoginRequest, LoginResponse, RegisterRequest, UserOut
from app.modules.auth.service import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    clear_auth_cookies,
    is_token_revoked,
    revoke_cookie_token,
    revoke_jti,
    set_auth_cookies,
)
from app.core.security import ACCESS_TOKEN_TYPE

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    email = body.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email ya registrado")
    
    user = User(
        email=email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    email = body.username.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales incorrectas")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cuenta desactivada")

    set_auth_cookies(response, user)
    return LoginResponse(user=UserOut.model_validate(user))


@router.post("/refresh")
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token requerido")
    try:
        payload = decode_token(token, REFRESH_TOKEN_TYPE)
        user_id = uuid.UUID(str(payload.get("sub")))
    except (PyJWTError, ValueError, TypeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token inválido") from None

    if await is_token_revoked(db, payload.get("jti")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token revocado")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no encontrado")

    # Rotación: el refresh token usado se invalida para evitar su reutilización.
    await revoke_jti(db, payload.get("jti"), payload.get("exp"))
    set_auth_cookies(response, user)
    await db.commit()
    return {"ok": True}


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await revoke_cookie_token(db, request.cookies.get(ACCESS_COOKIE), ACCESS_TOKEN_TYPE)
    await revoke_cookie_token(db, request.cookies.get(REFRESH_COOKIE), REFRESH_TOKEN_TYPE)
    await db.commit()
    clear_auth_cookies(response)
    return {"message": "Sesión cerrada"}


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)
