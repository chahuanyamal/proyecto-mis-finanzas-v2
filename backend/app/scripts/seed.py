from __future__ import annotations

import asyncio

from sqlalchemy import select, text

from app.models import Category, Institution, User
from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.security import hash_password

# Identificador arbitrario para el advisory lock de Postgres que serializa el
# seed entre arranques concurrentes.
_SEED_LOCK_ID = 727_001


INSTITUTIONS = [
    ("Itaú", "CL"),
    ("BICE", "CL"),
    ("Prex", "CL"),
    ("UglyCash", "CL"),
    ("TD Bank", "US"),
    ("Charles Schwab", "US"),
    ("Alpaca", "US"),
    ("Genérico", "CL"),
]

CATEGORIES = {
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


async def seed():
    async with async_session_factory() as db:
        # Lock transaccional para que dos instancias arrancando a la vez no
        # siembren datos duplicados (no-op fuera de Postgres).
        if engine.dialect.name == "postgresql":
            await db.execute(
                text("SELECT pg_advisory_xact_lock(:lock_id)"),
                {"lock_id": _SEED_LOCK_ID},
            )

        result = await db.execute(
            select(User).where(User.email == settings.ADMIN_EMAIL)
        )
        if result.scalar_one_or_none():
            print("✓ Admin user already exists, skipping seed")
        else:
            admin = User(
                email=settings.ADMIN_EMAIL,
                hashed_password=hash_password(settings.ADMIN_PASSWORD),
                full_name=settings.ADMIN_FULL_NAME,
                is_active=True,
                is_admin=True,
            )
            db.add(admin)
            print(f"✓ Admin user created: {settings.ADMIN_EMAIL}")

        existing_institutions = set(await db.scalars(select(Institution.name)))
        institution_count = 0
        for name, country in INSTITUTIONS:
            if name not in existing_institutions:
                db.add(Institution(name=name, country=country))
                institution_count += 1
        print(f"✓ {institution_count} institutions seeded")

        existing_system_categories = set(
            await db.scalars(select(Category.name).where(Category.user_id.is_(None)))
        )
        category_count = 0
        for parent_name, children in CATEGORIES.items():
            if parent_name in existing_system_categories:
                result = await db.execute(
                    select(Category).where(
                        Category.user_id.is_(None),
                        Category.parent_id.is_(None),
                        Category.name == parent_name,
                    )
                )
                parent = result.scalars().first()
            else:
                parent = Category(name=parent_name, icon="folder")
                db.add(parent)
                await db.flush()
                existing_system_categories.add(parent_name)
                category_count += 1

            if parent is None:
                continue

            for child_name in children:
                if child_name not in existing_system_categories:
                    db.add(Category(name=child_name, parent_id=parent.id, icon="tag"))
                    existing_system_categories.add(child_name)
                    category_count += 1

        await db.commit()
        print(f"✓ {category_count} categories seeded")

    print("Seed complete")


if __name__ == "__main__":
    asyncio.run(seed())
