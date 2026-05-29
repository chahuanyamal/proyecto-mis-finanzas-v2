from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.logging import get_logger, setup_logging
from app.modules.accounts.router import router as accounts_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.budgets.router import router as budgets_router
from app.modules.categories.router import router as categories_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.goals.router import router as goals_router
from app.modules.patrimonio.router import router as patrimonio_router
from app.modules.recurring.router import router as recurring_router
from app.modules.reconciliation.router import router as reconciliation_router
from app.modules.reports.router import router as reports_router
from app.modules.rules.router import router as rules_router
from app.modules.admin.router import router as admin_router
from app.modules.notifications.router import router as notifications_router
from app.modules.search.router import router as search_router
from app.modules.settings.router import router as settings_router
from app.modules.statements.router import router as statements_router
from app.modules.tags.router import router as tags_router
from app.modules.transactions.router import router as transactions_router
from app.modules.ofx.router import router as ofx_router
from app.modules.ai.router import router as ai_router
from app.modules.debt.router import router as debt_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    setup_logging()
    logger = get_logger("app")
    logger.info("app_starting", env=settings.APP_ENV, debug=settings.DEBUG)
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
    app.include_router(audit_router)
    app.include_router(accounts_router)
    app.include_router(budgets_router)
    app.include_router(categories_router)
    app.include_router(dashboard_router)
    app.include_router(tags_router)
    app.include_router(rules_router)
    app.include_router(statements_router)
    app.include_router(transactions_router)
    app.include_router(goals_router)
    app.include_router(recurring_router)
    app.include_router(patrimonio_router)
    app.include_router(notifications_router)
    app.include_router(admin_router)
    app.include_router(settings_router)
    app.include_router(search_router)
    app.include_router(reports_router)
    app.include_router(reconciliation_router)
    app.include_router(ofx_router)
    app.include_router(ai_router)
    app.include_router(debt_router)

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
