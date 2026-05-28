# AGENTS.md — Proyecto Mis Finanzas V2

## Proyecto

App web local de finanzas personales. Importar cartolas PDF, categorizar, dashboard.

## Referencia

- Proyecto anterior: `../proyecto-mis-finanzas-ref` (solo consulta, no modificar)
- Reutilizar ideas/fragmentos, no copiar carpetas enteras sin justificación

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15 + TypeScript strict + Tailwind CSS |
| Backend | FastAPI + Python 3.12 + uv |
| ORM | SQLAlchemy 2 async |
| DB | PostgreSQL 16 + asyncpg |
| Migraciones | Alembic |
| PDF | pdfplumber + pytesseract |
| Excel | openpyxl |
| Infra | Docker Compose |

## Restricciones v1

- No Tauri, Electron, ni mezclar web+desktop
- No Celery, workers separados, ni Redis
- No scikit-learn
- No agregar dependencias/servicios extra sin justificar
- `any` prohibido en TypeScript
- Toda query de datos debe filtrar por `user_id`

## Trabajo

- Etapas pequeñas. Proponer plan breve antes de implementar
- Después de cada etapa: resumir archivos creados/modificados + cómo probar

## Definición de terminado

- `docker compose up --build` funciona
- `localhost:8000/docs` (backend)
- `localhost:1510` (frontend — Docker expone 1510:3000)
- Autenticación, upload PDF, parser fallback, dashboard mensual, categorización por reglas, presupuestos, exportación Excel

## Desarrollo

```bash
# Backend
uv sync
uv run uvicorn app.main:app --reload

# Frontend
npm run dev

# Docker
docker compose up --build
```
