from __future__ import annotations

import asyncio
import os
import uuid
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool, StaticPool

from app.core.database import Base, get_db
from app.main import create_app
from app.models.category import Category
from app.models.institution import Institution
from app.models.user import User

# Default to an in-memory SQLite database so the suite runs anywhere without a
# live Postgres. Override with TEST_DATABASE_URL to run against Postgres, e.g.
# TEST_DATABASE_URL=postgresql+asyncpg://finanzas:finanzas@localhost:5432/finanzas_test
TEST_URL = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")


def _engine_kwargs(url: str) -> dict[str, Any]:
    if url.startswith("sqlite"):
        # StaticPool keeps a single connection alive so the in-memory schema
        # persists across sessions for the whole test run.
        return {"poolclass": StaticPool, "connect_args": {"check_same_thread": False}}
    return {"poolclass": NullPool}

SEED_INSTITUTIONS = [
    ("Itaú", "CL"),
    ("BICE", "CL"),
    ("Prex", "CL"),
    ("UglyCash", "CL"),
    ("TD Bank", "US"),
    ("Charles Schwab", "US"),
    ("Alpaca", "US"),
    ("Genérico", "CL"),
]

SEED_CATEGORIES = {
    "Ingresos": ["Sueldo", "Honorarios", "Inversiones", "Reembolso", "Otros Ingresos"],
    "Vivienda": ["Arriendo", "Hipoteca", "Mantenimiento", "Servicios Básicos"],
    "Transporte": ["Combustible", "Transporte Público", "Peajes", "Estacionamiento", "Mant. Vehículo"],
    "Alimentación": ["Supermercado", "Restaurantes", "Delivery", "Cafetería"],
    "Salud": ["Seguro Médico", "Medicamentos", "Consultas", "Dental", "Óptica"],
    "Entretención": ["Suscripciones", "Cine/Teatro", "Viajes", "Hobbies", "Electrónica"],
    "Educación": ["Cursos", "Libros", "Materiales"],
    "Financiero": ["Comisiones", "Intereses", "Impuestos"],
    "Compras": ["Ropa", "Hogar", "Tecnología", "Mascotas"],
    "Otros Gastos": ["Retiro Efectivo", "Transferencia", "No Clasificado"],
}


@pytest.fixture(scope="session")
def event_loop() -> Any:
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def _test_engine():
    engine = create_async_engine(TEST_URL, echo=False, **_engine_kwargs(TEST_URL))
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with async_sessionmaker(engine, class_=AsyncSession)() as db:
        for name, country in SEED_INSTITUTIONS:
            db.add(Institution(name=name, country=country))
        for parent_name, children in SEED_CATEGORIES.items():
            parent = Category(name=parent_name, icon="folder")
            db.add(parent)
            await db.flush()
            for child_name in children:
                db.add(Category(name=child_name, parent_id=parent.id, icon="tag"))
        await db.commit()

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(_test_engine) -> AsyncIterator[AsyncSession]:
    session_factory = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def _app(_test_engine):
    app = create_app()
    session_factory = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield app
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(_app) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def test_user(client: AsyncClient) -> User:
    email = f"test-{uuid.uuid4()}@test.com"
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "test123",
            "full_name": "Test User",
        },
    )
    assert resp.status_code == 201
    return User(**resp.json())


@pytest_asyncio.fixture
async def other_user(client: AsyncClient) -> User:
    email = f"other-{uuid.uuid4()}@test.com"
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "other123",
            "full_name": "Other User",
        },
    )
    assert resp.status_code == 201
    return User(**resp.json())


@pytest_asyncio.fixture
async def auth_client(_app, test_user: User) -> AsyncClient:
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"username": test_user.email, "password": "test123"},
        )
        assert resp.status_code == 200
        client.cookies.update(resp.cookies)
        yield client


@pytest_asyncio.fixture
async def other_auth_client(_app, other_user: User) -> AsyncClient:
    transport = ASGITransport(app=_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"username": other_user.email, "password": "other123"},
        )
        assert resp.status_code == 200
        client.cookies.update(resp.cookies)
        yield client
