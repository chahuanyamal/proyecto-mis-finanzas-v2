# Mis Finanzas V2

Aplicación web local de finanzas personales. Importar cartolas PDF, categorizar movimientos, dashboard mensual, presupuestos, metas, suscripciones, patrimonio, auditoría, reconciliación y exportaciones.

---

## Stack

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | Next.js (App Router) | 15.x |
| UI | React | 19.x |
| Lenguaje frontend | TypeScript | 5.7+ |
| Estilos | Tailwind CSS | 3.4+ |
| Estado frontend | Zustand + TanStack React Query + Axios | 5.x / 5.x / 1.x |
| Backend | FastAPI | 0.136+ |
| Lenguaje backend | Python | 3.12+ |
| ORM | SQLAlchemy 2 (async) | 2.0+ |
| Base de datos | PostgreSQL | 16 |
| Driver DB | asyncpg | 0.30+ |
| Migraciones | Alembic | 1.14+ |
| Validación | Pydantic + pydantic-settings | 2.9+ |
| Auth | JWT (PyJWT + bcrypt, cookies HttpOnly) | 2.9+ / 4.2+ |
| PDF | pdfplumber | 0.11+ |
| OCR | pytesseract + Tesseract OCR | 0.3+ |
| Excel | openpyxl | 3.1+ |
| Infra | Docker Compose (3 servicios) | — |
| Tests frontend | Vitest + Playwright | 3.x / 1.60+ |
| Tests backend | pytest + pytest-asyncio + aiosqlite | 8.x |

---

## Requisitos previos

| Herramienta | Versión mínima | Notas |
|---|---|---|
| Docker | 24+ | Solo si usas Docker Compose |
| Docker Compose | 2.20+ | Solo si usas Docker Compose |
| Node.js | 22+ | Solo para desarrollo sin Docker |
| Python | 3.12+ | Solo para desarrollo sin Docker |
| uv | 0.5+ | Gestor de paquetes Python |
| PostgreSQL | 16+ | Solo para desarrollo sin Docker |
| Tesseract OCR | 5.x | Con idioma español (`tesseract-ocr-spa`) |

---

## Variables de entorno

| Variable | Descripción | Requerida | Valor de ejemplo |
|---|---|---|---|
| `APP_ENV` | Entorno (`development` / `production`) | No | `development` |
| `DEBUG` | Logging SQL verbose | No | `false` |
| `ALLOWED_ORIGINS` | CORS (separados por coma) | No | `http://localhost:1510` |
| `INTERNAL_API_URL` | URL del backend para Next.js | Sí (frontend) | `http://backend:8000` |
| `DATABASE_URL` | URL async de PostgreSQL | Sí (backend) | `postgresql+asyncpg://finanzas:finanzas@postgres:5432/finanzas` |
| `UPLOAD_DIR` | Directorio de PDFs subidos | No | `/app/uploads` |
| `POSTGRES_DB` | Nombre de la BD | Sí (Docker) | `finanzas` |
| `POSTGRES_USER` | Usuario de PostgreSQL | Sí (Docker) | `finanzas` |
| `POSTGRES_PASSWORD` | Password de PostgreSQL | Sí (Docker) | `finanzas` |
| `SECRET_KEY` | Clave JWT (mín 32 chars en prod) | Sí (backend) | `openssl rand -hex 32` |
| `JWT_ALGORITHM` | Algoritmo JWT | No | `HS256` |
| `JWT_ACCESS_EXPIRE_MINUTES` | Duración access token | No | `15` |
| `JWT_REFRESH_EXPIRE_DAYS` | Duración refresh token | No | `7` |
| `COOKIE_SECURE` | Marcar cookies Secure | No | `false` |
| `ADMIN_EMAIL` | Email del admin seed | No | `admin@finanzas.local` |
| `ADMIN_FULL_NAME` | Nombre completo del admin seed | No | `Admin` |
| `ADMIN_PASSWORD` | Password del admin seed | No | `admin123` |
| `TEST_DATABASE_URL` | BD para tests backend | No | `sqlite+aiosqlite:///:memory:` |
| `E2E_BASE_URL` | URL base para tests E2E | No | `http://localhost:1510` |
| `E2E_SKIP_WEB_SERVER` | Saltar arranque del web server en E2E | No | `1` |
| `E2E_USER` | Usuario para tests E2E | No | `admin@finanzas.local` |
| `E2E_PASSWORD` | Password para tests E2E | No | `admin123` |

---

## Levantar en local (sin Docker)

```bash
# 1. Clonar el repositorio
git clone <url-del-repo> proyecto-mis-finanzas-v2
cd proyecto-mis-finanzas-v2

# 2. Crear base de datos en PostgreSQL
createdb finanzas

# 3. Configurar entorno
cp .env.example .env
# Editar .env: cambiar DATABASE_URL a localhost:
# DATABASE_URL=postgresql+asyncpg://finanzas:finanzas@localhost:5432/finanzas

# 4. Generar clave secreta (recomendado)
openssl rand -hex 32
# Pegar el resultado como SECRET_KEY en .env

# 5. Backend (terminal 1)
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.scripts.seed
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 6. Frontend (terminal 2)
cd frontend
npm install
INTERNAL_API_URL=http://localhost:8000 npm run dev
```

| Servicio | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |

Usuario admin por defecto: `admin@finanzas.local` / `admin123`

---

## Levantar con Docker

```bash
# 1. Clonar el repositorio
git clone <url-del-repo> proyecto-mis-finanzas-v2
cd proyecto-mis-finanzas-v2

# 2. Crear archivo de entorno
cp .env.example .env

# 3. Generar clave secreta (opcional pero recomendado)
openssl rand -hex 32
# Pegar el resultado como SECRET_KEY en .env

# 4. Levantar todo (build + up)
docker compose up --build -d

# Ver logs en vivo
docker compose logs -f

# Ver solo logs del backend
docker compose logs -f backend

# Detener servicios (conserva datos)
docker compose down

# Detener y borrar datos (reset completo)
docker compose down -v

# Reconstruir imágenes y levantar
docker compose up --build -d

# Reset completo en un solo comando
docker compose down -v && docker compose up --build -d
```

| Servicio | URL |
|---|---|
| Frontend | http://localhost:1510 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |

Usuario admin por defecto: `admin@finanzas.local` / `admin123`

---

## Scripts disponibles

### Frontend (`cd frontend`)

| Comando | Descripción | Cuándo usarlo |
|---|---|---|
| `npm run dev` | Next.js en modo desarrollo con hot-reload | Desarrollo diario |
| `npm run build` | Build de producción (standalone) | Antes de desplegar |
| `npm run start` | Servir el build de producción | Después de `build` |
| `npm test` | Tests unitarios (Vitest, single run) | CI o verificación rápida |
| `npm run test:watch` | Tests unitarios en modo watch | Desarrollo de tests |
| `npm run test:e2e` | Tests E2E (Playwright) | Verificar flujos completos |
| `npm run test:e2e:install` | Instalar Chromium para Playwright | Primera vez o CI |
| `npm run lint` | ESLint sobre `src/` | Antes de commit |
| `npm run type-check` | Verificar TypeScript (`tsc --noEmit`) | Antes de commit |

### Backend (`cd backend`)

| Comando | Descripción | Cuándo usarlo |
|---|---|---|
| `uv run uvicorn app.main:app --reload` | Servidor de desarrollo con hot-reload | Desarrollo diario |
| `uv run pytest -q` | Ejecutar todos los tests | CI o verificación |
| `uv run alembic upgrade head` | Aplicar migraciones pendientes | Después de `git pull` |
| `uv run alembic revision --autogenerate -m "msg"` | Crear nueva migración | Tras cambiar modelos |
| `uv run python -m app.scripts.seed` | Sembrar datos iniciales (admin, categorías) | Primera instalación |

### Docker / Makefile (raíz del proyecto)

| Comando | Descripción | Cuándo usarlo |
|---|---|---|
| `make up` | Levantar servicios en background | Inicio rápido |
| `make down` | Detener servicios (conserva datos) | Parar la app |
| `make build` | Reconstruir imágenes y levantar | Después de cambios |
| `make dev` | Levantar en foreground (ver logs) | Desarrollo con Docker |
| `make logs` | Logs en vivo de todos los servicios | Debug |
| `make reset-db` | Borrar DB y levantar desde cero | Reset de datos |
| `make shell-backend` | Shell bash en contenedor backend | Debug backend |
| `make shell-db` | Consola psql en contenedor postgres | Consultas directas |

---

## Estructura del proyecto

```text
.
├── docker-compose.yml          # Orquestación: postgres, backend, frontend
├── Makefile                    # Comandos de conveniencia
├── .env.example                # Plantilla de variables de entorno
├── AGENTS.md                   # Instrucciones para agentes de código
│
├── backend/
│   ├── Dockerfile              # Imagen Python 3.12-slim + Tesseract + uv
│   ├── entrypoint.sh           # Espera Postgres → bootstrap → Uvicorn
│   ├── pyproject.toml          # Dependencias Python (uv)
│   ├── uv.lock                 # Lock de dependencias
│   ├── alembic.ini             # Configuración Alembic
│   ├── alembic/
│   │   ├── env.py              # Configuración de migraciones async
│   │   └── versions/           # Archivos de migración
│   ├── app/
│   │   ├── main.py             # Punto de entrada FastAPI + registro de routers
│   │   ├── core/
│   │   │   ├── config.py       # Settings (pydantic-settings, validación en prod)
│   │   │   ├── database.py     # Engine async, session factory, Base
│   │   │   └── security.py     # JWT, bcrypt, hash/verify/create/decode
│   │   ├── models/             # 18 modelos SQLAlchemy (User, Account, Transaction, etc.)
│   │   ├── modules/            # 21 módulos de negocio
│   │   │   ├── accounts/       # CRUD cuentas
│   │   │   ├── admin/          # Gestión de usuarios (admin)
│   │   │   ├── audit/          # Log de auditoría
│   │   │   ├── auth/           # Login, registro, JWT, refresh, logout
│   │   │   ├── budgets/        # Presupuestos mensuales
│   │   │   ├── categories/     # Categorías de transacciones
│   │   │   ├── dashboard/      # Resumen mensual, tendencias, summary
│   │   │   ├── goals/          # Metas de ahorro + contribuciones
│   │   │   ├── notifications/  # Notificaciones in-app
│   │   │   ├── parsers/        # Parsers de cartolas PDF (registry + bancos)
│   │   │   ├── patrimonio/     # Patrimonio neto, proyecciones, historial
│   │   │   ├── reconciliation/ # Reconciliación bancaria
│   │   │   ├── recurring/      # Gastos recurrentes + detección
│   │   │   ├── reports/        # Reportes anuales + export CSV
│   │   │   ├── rules/          # Reglas de categorización automática
│   │   │   ├── search/         # Búsqueda global
│   │   │   ├── settings/       # Perfil de usuario + backup/restore
│   │   │   ├── statements/     # Upload, preview, confirm de cartolas
│   │   │   ├── tags/           # Etiquetas de transacciones
│   │   │   └── transactions/   # CRUD transacciones, export, split, bulk
│   │   └── scripts/
│   │       ├── bootstrap.py    # Alembic upgrade + seed al arrancar
│   │       └── seed.py         # Datos iniciales (admin, categorías)
│   └── tests/                  # 90 tests (pytest + aiosqlite)
│
└── frontend/
    ├── Dockerfile              # Multi-stage: deps → build → standalone runner
    ├── package.json            # Dependencias Node
    ├── next.config.mjs         # Output standalone para Docker
    ├── tsconfig.json           # TypeScript strict + path alias @/*
    ├── tailwind.config.ts      # Design system "Bóveda"
    ├── eslint.config.mjs       # ESLint + typescript-eslint + next
    ├── vitest.config.mts       # Vitest config
    ├── playwright.config.ts    # Playwright E2E config
    ├── src/
    │   ├── middleware.ts        # Auth guard + API proxy a backend
    │   ├── app/
    │   │   ├── layout.tsx      # Root layout + providers
    │   │   ├── page.tsx        # Página raíz (redirect a /dashboard)
    │   │   ├── (auth)/         # Rutas públicas: /login
    │   │   └── (dashboard)/    # 22 rutas protegidas
    │   ├── components/
    │   │   ├── boveda/         # Componentes del design system
    │   │   ├── statements/     # Componentes de cartolas
    │   │   └── ui/             # Componentes UI genéricos
    │   ├── lib/
    │   │   ├── api.ts          # Cliente HTTP (Axios)
    │   │   ├── api-types.ts    # Tipos TypeScript para la API
    │   │   └── query-client.tsx # TanStack Query provider
    │   ├── stores/
    │   │   ├── auth.ts         # Zustand: autenticación
    │   │   └── period.ts       # Zustand: período seleccionado
    │   └── styles/             # Tailwind globals + CSS variables
    └── e2e/                    # Tests E2E (Playwright)
```

---

## Limitaciones conocidas

1. Los parsers PDF se validaron con fixtures sintéticos; pueden necesitar ajustes con cartolas reales de cada banco.
2. OCR requiere Tesseract con idioma español instalado (Docker lo trae; fuera de Docker hay que instalarlo manualmente).
3. `ADMIN_PASSWORD` y `POSTGRES_PASSWORD` son valores de desarrollo; cambiarlos antes de exponer la app.
4. La revocación JWT usa una tabla en PostgreSQL, sin limpieza periódica automática.
5. Parsing y OCR corren dentro del mismo backend (sin workers separados, decisión de arquitectura).
6. Backup import ZIP: los IDs se regeneran, así que modelos con FK dependientes (GoalContribution) no se reimportan correctamente.
7. No hay rate limiting en endpoints de autenticación.
8. El proxy API en middleware.ts usa `NextResponse.rewrite` — no soporta websockets ni streaming.
9. Dependencias `recharts`, `clsx`, `tailwind-merge` y `zod` están declaradas en `package.json` pero no se usan actualmente en el código fuente (reservadas para uso futuro).
10. El `Any` type se usa en `parsers/base.py` (Python) para la interfaz abstracta de parsers — justificado por la naturaleza heterogénea de los datos PDF.
