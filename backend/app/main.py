from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.modules.accounts.router import router as accounts_router
from app.modules.auth.router import router as auth_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Mis Finanzas V2",
        version="0.1.0",
        docs_url="/docs",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(accounts_router)

    @app.get("/health")
    async def health():
        try:
            async with async_session_factory() as session:
                await session.execute(text("SELECT 1"))
        except Exception:
            return {"status": "error", "database": "unavailable"}
        return {"status": "ok", "database": "ok"}

    return app


app = create_app()
