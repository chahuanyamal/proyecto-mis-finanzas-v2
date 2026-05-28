from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.models import Category, Institution, User
from app.core.config import settings
from app.core.database import async_session_factory
from app.core.security import hash_password


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
        result = await db.execute(
            select(User).where(User.email == settings.ADMIN_EMAIL)
        )
        if result.scalar():
            print("✓ Admin user already exists, skipping seed")
            return

        admin = User(
            email=settings.ADMIN_EMAIL,
            hashed_password=hash_password(settings.ADMIN_PASSWORD),
            full_name=settings.ADMIN_FULL_NAME,
            is_active=True,
            is_admin=True,
        )
        db.add(admin)
        await db.commit()
        print(f"✓ Admin user created: {settings.ADMIN_EMAIL}")

    async with async_session_factory() as db:
        for name, country in INSTITUTIONS:
            db.add(Institution(name=name, country=country))
        await db.commit()
        print(f"✓ {len(INSTITUTIONS)} institutions seeded")

    async with async_session_factory() as db:
        created = 0
        for parent_name, children in CATEGORIES.items():
            parent = Category(name=parent_name, icon="folder")
            db.add(parent)
            await db.flush()
            created += 1
            for child_name in children:
                child = Category(
                    name=child_name, parent_id=parent.id, icon="tag"
                )
                db.add(child)
                created += 1
        await db.commit()
        print(f"✓ {created} categories seeded")

    print("Seed complete")


if __name__ == "__main__":
    asyncio.run(seed())
