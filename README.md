# Mis Finanzas V2

App web local de finanzas personales: importar cartolas PDF, categorizar movimientos, dashboard mensual, presupuestos y exportación a Excel. Multiusuario, con todos los datos aislados por `user_id`.

---

## Stack

| Capa         | Tecnología                                   | Versión        |
| ------------ | -------------------------------------------- | -------------- |
| Frontend     | Next.js (App Router) + React                 | 15.x / 19.x    |
| Lenguaje FE  | TypeScript (`strict`)                        | 5.7            |
| Estilos      | Tailwind CSS                                 | 3.4            |
| Estado/datos | TanStack React Query + Zustand + Axios       | 5.x / 5.x / 1.7 |
| Backend      | FastAPI + Uvicorn                            | 0.115 / 0.32   |
| Lenguaje BE  | Python                                       | 3.12           |
| Gestor deps  | uv                                           | 0.8+           |
| ORM          | SQLAlchemy async                             | 2.0            |
| Driver DB    | asyncpg                                      | 0.30           |
| DB           | PostgreSQL                                   | 16             |
| Migraciones  | Alembic                                      | 1.14           |
| Auth         | PyJWT + bcrypt (cookies HttpOnly)            | 2.9 / 4.2      |
| PDF / OCR    | pdfplumber + pytesseract (Tesseract OCR)     | 0.11 / 0.3     |
| Excel        | openpyxl                                     | 3.1            |
| Infra        | Docker Compose                               | —              |

---

## Requisitos previos

**Para correr con Docker (recomendado):**

- Docker Engine **24+** y Docker Compose v2

**Para desarrollo local (sin Docker):**

- Node.js **22+** y npm 10+
- Python **3.12+**
- [uv](https://docs.astral.sh/uv/) **0.8+**
- PostgreSQL **16** corriendo localmente (o accesible vía `DATABASE_URL`)
- Tesseract OCR + paquete de idioma español (`tesseract-ocr`, `tesseract-ocr-spa`) — solo necesario para el fallback OCR de cartolas escaneadas

---

## Variables de entorno

Copia `.env.example` a `.env` y ajusta los valores. En Docker Compose la mayoría tiene un valor por defecto integrado; **`SECRET_KEY` debe cambiarse antes de cualquier despliegue real**.

| Variable                     | Descripción                                                        | Requerida | Valor de ejemplo |
| ---------------------------- | ------------------------------------------------------------------ | --------- | ---------------- |
| `APP_ENV`                    | Entorno de ejecución (`development` / `production`)                | No        | `development` |
| `DEBUG`                      | Activa `echo` de SQLAlchemy y modo debug                           | No        | `true` |
| `ALLOWED_ORIGINS`            | Orígenes CORS permitidos (separados por coma)                      | No        | `http://localhost:1510` |
| `INTERNAL_API_URL`           | URL interna del backend usada por el rewrite del frontend          | Sí (FE)   | `http://backend:8000` |
| `DATABASE_URL`               | Cadena de conexión async a PostgreSQL                              | **Sí**    | `postgresql+asyncpg://finanzas:finanzas@postgres:5432/finanzas` |
| `UPLOAD_DIR`                 | Carpeta donde se guardan los PDFs subidos                          | No        | `/app/uploads` |
| `POSTGRES_DB`                | Nombre de la base de datos (servicio postgres)                     | **Sí**    | `finanzas` |
| `POSTGRES_USER`              | Usuario de la base de datos                                        | **Sí**    | `finanzas` |
| `POSTGRES_PASSWORD`          | Contraseña de la base de datos                                     | **Sí**    | `finanzas` |
| `SECRET_KEY`                 | Clave de firma JWT (mínimo 32 chars; usar `openssl rand -hex 32`)  | **Sí**    | `c0ffee...` (32+ bytes hex) |
| `JWT_ALGORITHM`              | Algoritmo de firma JWT                                             | No        | `HS256` |
| `JWT_ACCESS_EXPIRE_MINUTES`  | Minutos de validez del access token                               | No        | `15` |
| `JWT_REFRESH_EXPIRE_DAYS`    | Días de validez del refresh token                                 | No        | `7` |
| `COOKIE_SECURE`              | Marca cookies como `Secure` (activar `true` en prod con HTTPS)     | No        | `false` |
| `ADMIN_EMAIL`                | Email del admin creado en el seed inicial                         | No        | `admin@finanzas.local` |
| `ADMIN_FULL_NAME`            | Nombre del admin inicial                                           | No        | `Admin` |
| `ADMIN_PASSWORD`             | Contraseña del admin inicial                                       | No        | `admin123` |

> `INTERNAL_API_URL` solo aplica al frontend (Next.js reescribe `/api/*` hacia el backend). Las demás aplican al backend / Postgres.

---

## Levantar en local (sin Docker)

Requiere un PostgreSQL 16 ya corriendo y accesible. Crea la base de datos vacía antes de empezar.

```bash
# 0. Base de datos (una sola vez)
createdb finanzas            # o: psql -c "CREATE DATABASE finanzas;"

# 1. Backend
cd backend
cp ../.env.example .env       # ajusta DATABASE_URL para apuntar a localhost:5432
uv sync                       # instala dependencias (incluye grupo dev)
uv run alembic upgrade head   # aplica migraciones
uv run python -m app.scripts.seed   # crea admin + instituciones + categorías
uv run uvicorn app.main:app --reload --port 8000
# Backend listo en http://localhost:8000  ·  Swagger en http://localhost:8000/docs

# 2. Frontend (en otra terminal)
cd frontend
npm install
INTERNAL_API_URL=http://localhost:8000 npm run dev
# Frontend listo en http://localhost:3000
```

> En local el frontend corre en el puerto **3000** (Next.js dev). En Docker se expone en **1510**.

---

## Levantar con Docker

```bash
# 1. Preparar entorno
cp .env.example .env
#    Editar .env y cambiar SECRET_KEY:  openssl rand -hex 32

# 2. Build + arranque (en segundo plano)
docker compose up --build -d

# 3. Ver logs en vivo (Ctrl-C para salir, los servicios siguen corriendo)
docker compose logs -f

# 4. Detener y eliminar contenedores (conserva los datos)
docker compose down

# 4b. Detener y BORRAR volúmenes (resetea la base de datos)
docker compose down -v
```

El `entrypoint.sh` del backend espera a Postgres, aplica migraciones Alembic y ejecuta el seed automáticamente.

| Servicio     | URL                          |
| ------------ | ---------------------------- |
| Frontend     | http://localhost:1510        |
| Backend API  | http://localhost:8000        |
| Swagger Docs | http://localhost:8000/docs   |
| PostgreSQL   | localhost:5432               |

Atajos equivalentes vía `make`: `make build`, `make up`, `make down`, `make logs`, `make reset-db`, `make shell-backend`, `make shell-db`.

---

## Scripts disponibles

**Frontend (`frontend/`, vía `npm run <script>`):**

| Comando             | Descripción                              | Cuándo usarlo                                     |
| ------------------- | ---------------------------------------- | ------------------------------------------------- |
| `dev`               | Servidor de desarrollo con hot-reload    | Día a día desarrollando la UI                     |
| `build`             | Build de producción optimizado           | Antes de desplegar / dentro del Dockerfile        |
| `start`             | Sirve el build de producción             | Probar localmente el resultado de `build`         |
| `lint`              | ESLint sobre `src/**/*.{ts,tsx}`         | Antes de commitear o en CI                        |
| `typecheck`         | `tsc --noEmit` (verificación de tipos)   | Validar tipos sin emitir JS; en CI                |

**Backend (`backend/`, vía `uv run <cmd>`):**

| Comando                              | Descripción                                  | Cuándo usarlo                          |
| ------------------------------------ | -------------------------------------------- | -------------------------------------- |
| `uvicorn app.main:app --reload`      | Servidor de desarrollo (equivalente a `dev`) | Desarrollar la API con recarga         |
| `uvicorn app.main:app`               | Servidor sin recarga (equivalente a `start`) | Ejecución estable / producción         |
| `pytest`                             | Ejecuta la suite de tests (`test`)           | Antes de commitear o en CI             |
| `alembic upgrade head`               | Aplica migraciones de BD                     | Tras clonar o crear nuevas migraciones |
| `python -m app.scripts.seed`         | Crea admin + instituciones + categorías      | Primera inicialización de la BD        |

> El backend no usa un comando `build` propio (Python no transpila); el "build" ocurre al construir la imagen Docker (`uv sync`).

**Tests:** por defecto corren contra **SQLite en memoria** (sin necesidad de Postgres). Para correrlos contra Postgres:

```bash
cd backend
uv run pytest                                   # SQLite en memoria (por defecto)
TEST_DATABASE_URL=postgresql+asyncpg://finanzas:finanzas@localhost:5432/finanzas_test \
  uv run pytest                                 # contra Postgres
```

---

## Estructura del proyecto

```
.
├── docker-compose.yml          # Orquesta postgres + backend + frontend
├── Makefile                    # Atajos de Docker Compose
├── .env.example                # Plantilla de variables de entorno
├── AGENTS.md                   # Convenciones y restricciones del proyecto
├── backend/                    # API FastAPI
│   ├── Dockerfile              # Imagen Python 3.12 + Tesseract + uv
│   ├── entrypoint.sh           # Espera DB → migra → seed → arranca uvicorn
│   ├── pyproject.toml          # Dependencias y config de pytest
│   ├── alembic.ini             # Config de Alembic
│   ├── alembic/                # Entorno + migraciones de esquema
│   │   └── versions/           # 0001 esquema, 0002 previews, 0003 tx.user_id, 0004 cat.user_id
│   ├── tests/                  # Tests de auth, cuentas, transacciones, budgets, parser
│   └── app/
│       ├── main.py             # create_app(): CORS, routers, /health
│       ├── core/               # config (settings), database (engine/session), security (JWT/bcrypt)
│       ├── models/             # Modelos SQLAlchemy (user, account, transaction, budget, ...)
│       ├── modules/            # Un paquete por dominio: router + schemas (Pydantic)
│       │   ├── auth/           # Login, refresh, logout, me, register (cookies HttpOnly)
│       │   ├── accounts/       # CRUD de cuentas + instituciones
│       │   ├── categories/     # Categorías (defaults del sistema + propias por usuario)
│       │   ├── tags/           # Tags por usuario
│       │   ├── rules/          # Reglas de auto-categorización
│       │   ├── transactions/   # CRUD + auto-categorizar + export Excel
│       │   ├── budgets/        # Presupuestos mensuales por categoría
│       │   ├── dashboard/      # Resumen mensual (ingresos/gastos/presupuestos)
│       │   └── statements/     # Upload PDF, parser, preview, confirmación, historial
│       └── scripts/            # bootstrap (migra+seed) y seed (admin/instituciones/categorías)
└── frontend/                   # App Next.js 15
    ├── Dockerfile              # Build multi-stage → output standalone
    ├── package.json            # Scripts y dependencias
    ├── tsconfig.json           # TypeScript strict, alias @/*
    ├── next.config.mjs         # output standalone + rewrite /api/* → backend
    ├── tailwind.config.ts      # Configuración de Tailwind
    └── src/
        ├── middleware.ts       # Protege rutas según cookies de sesión
        ├── app/                # Rutas App Router: (auth)/login y (dashboard)/*
        ├── components/         # Componentes (bóveda, statements)
        ├── lib/                # api.ts (cliente axios), api-types.ts, query-client
        ├── stores/             # Estado Zustand (auth)
        └── styles/             # globals.css (Tailwind)
```

---

## Limitaciones conocidas

1. **Sesiones JWT sin revocación.** Los tokens son JWT firmados (HS256) en cookies HttpOnly; no hay blacklist ni almacenamiento de sesiones, así que un token robado es válido hasta expirar y `logout` solo borra la cookie del cliente. Es una decisión de diseño de la v1 (sin Redis/almacén de sesiones, según `AGENTS.md`).
2. **`SECRET_KEY` y credenciales por defecto inseguras.** Los valores de `.env.example` (`SECRET_KEY`, `ADMIN_PASSWORD=admin123`, password de Postgres) son solo para desarrollo y deben cambiarse antes de exponer la app.
3. **Parsers bancarios sin validación contra cartolas reales.** La detección de banco (Itaú, BICE, Prex, UglyCash, TD Bank, Schwab, Alpaca) y los parsers se validan solo con fixtures sintéticos; requieren ajuste con PDFs reales por institución.
4. **OCR dependiente del entorno.** El fallback OCR necesita Tesseract con idioma español instalado; fuera de Docker hay que instalarlo manualmente o el parsing de PDFs escaneados fallará.
5. **Seed sin locking.** El seed de bootstrap no usa bloqueo; en arranques concurrentes de múltiples instancias podría haber una race condition (improbable en despliegue single-instance).
6. **`COOKIE_SECURE=false` por defecto.** En producción con HTTPS debe ponerse en `true` para evitar envío de cookies sobre conexiones no cifradas.
7. **Sin tests de frontend.** Solo el backend tiene suite de tests; el frontend se valida con `lint` y `typecheck`, sin pruebas unitarias ni e2e.

> **Categorías**: ahora hay aislamiento por usuario. Las categorías sembradas son del sistema (compartidas, `user_id` NULL, solo lectura) y cada usuario puede crear/editar/eliminar únicamente las suyas. Otros usuarios no pueden ver ni referenciar categorías privadas ajenas.
```
