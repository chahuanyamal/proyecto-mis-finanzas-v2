# Mis Finanzas V2

Aplicación web local de finanzas personales. Importar cartolas PDF, categorizar movimientos, dashboard mensual, presupuestos, metas, suscripciones, patrimonio, auditoría, reconciliación y exportaciones.

---

## Instalación (Docker — recomendado)

```bash
# 1. Clonar el repositorio
git clone <url-del-repo> proyecto-mis-finanzas-v2
cd proyecto-mis-finanzas-v2

# 2. Crear archivo de entorno
cp .env.example .env

# 3. Generar clave secreta (opcional pero recomendado)
openssl rand -hex 32
# Copiar el resultado y pegarlo como valor de SECRET_KEY en .env

# 4. Levantar todo
docker compose up --build -d
```

Listo. La app está corriendo:

| Servicio | URL |
|---|---|
| Frontend | http://localhost:1510 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |

Usuario admin por defecto: `admin@finanzas.local` / `admin123`

---

## Instalación (sin Docker)

Requisitos: Python 3.12+, uv, Node.js 22+, PostgreSQL 16.

```bash
# 1. Crear base de datos
createdb finanzas

# 2. Configurar entorno
cp .env.example .env
# Editar .env: cambiar DATABASE_URL a localhost:
# DATABASE_URL=postgresql+asyncpg://finanzas:finanzas@localhost:5432/finanzas

# 3. Backend (terminal 1)
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.scripts.seed
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 4. Frontend (terminal 2)
cd frontend
npm install
INTERNAL_API_URL=http://localhost:8000 npm run dev
```

URLs sin Docker:

| Servicio | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |

---

## Actualizar

### Con Docker

```bash
# Traer últimos cambios
git pull

# Reconstruir y reiniciar
docker compose up --build -d
```

Las migraciones de Alembic se ejecutan automáticamente al iniciar el contenedor backend.

### Sin Docker

```bash
# Traer últimos cambios
git pull

# Actualizar backend
cd backend
uv sync
uv run alembic upgrade head

# Actualizar frontend
cd frontend
npm install

# Reiniciar ambos servidores (Ctrl+C y volver a ejecutar los comandos de inicio)
```

---

## Eliminar y volver a instalar

### Eliminar todo (Docker)

```bash
# Detener contenedores
docker compose down

# Borrar volúmenes (base de datos y archivos subidos)
docker compose down -v

# Borrar imágenes construidas (opcional)
docker compose down --rmi all

# Borrar dependencias del frontend (opcional)
rm -rf frontend/node_modules frontend/.next

# Borrar dependencias del backend (opcional)
rm -rf backend/.venv

# Volver a instalar desde cero
docker compose up --build -d
```

### Eliminar todo (sin Docker)

```bash
# Detener servidores (Ctrl+C)

# Borrar datos de PostgreSQL
dropdb finanzas

# Borrar dependencias
rm -rf backend/.venv frontend/node_modules frontend/.next

# Volver a instalar desde cero (ver sección "Instalación sin Docker")
```

### Reset completo (un solo comando)

```bash
# Docker: borrar todo y levantar limpio
docker compose down -v && docker compose up --build -d
```

---

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `docker compose up -d` | Levantar servicios en background |
| `docker compose down` | Detener servicios (conserva datos) |
| `docker compose down -v` | Detener y borrar datos |
| `docker compose up --build -d` | Reconstruir imágenes y levantar |
| `docker compose logs -f` | Ver logs de todos los servicios |
| `docker compose logs -f backend` | Ver solo logs del backend |
| `docker compose restart backend` | Reiniciar solo el backend |
| `make dev` | Levantar en foreground (ver todo en una terminal) |
| `make reset-db` | Borrar DB y levantar desde cero |
| `make shell-backend` | Entrar al contenedor del backend |
| `make shell-db` | Entrar a la consola de PostgreSQL |

### Desarrollo

| Comando | Descripción |
|---|---|
| `cd frontend && npm run dev` | Next.js en desarrollo |
| `cd frontend && npm run build` | Build de producción |
| `cd frontend && npm run lint` | Linting |
| `cd frontend && npm run type-check` | Verificar TypeScript |
| `cd frontend && npm test` | Tests unitarios (Vitest) |
| `cd frontend && npm run test:e2e` | Tests E2E (Playwright) |
| `cd backend && uv run pytest -q` | Tests backend |
| `cd backend && uv run alembic upgrade head` | Aplicar migraciones |
| `cd backend && uv run python -m app.scripts.seed` | Sembrar datos iniciales |

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript 5.7, Tailwind CSS 3 |
| Estado frontend | Zustand, TanStack React Query, Axios |
| Backend | FastAPI, Python 3.12, Uvicorn |
| ORM | SQLAlchemy 2 async |
| Base de datos | PostgreSQL 16, asyncpg |
| Migraciones | Alembic |
| Auth | JWT (PyJWT + bcrypt, cookies HttpOnly) |
| PDF/OCR | pdfplumber, pytesseract, Tesseract OCR |
| Excel | openpyxl |
| Infra | Docker Compose (3 servicios) |

---

## Estructura del proyecto

```text
.
├── docker-compose.yml       # Orchestration: postgres, backend, frontend
├── Makefile                 # Comandos de conveniencia
├── .env.example             # Plantilla de variables de entorno
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh        # Espera Postgres → Alembic → seed → Uvicorn
│   ├── pyproject.toml       # Dependencias Python (uv)
│   ├── alembic/             # 10 migraciones de BD
│   ├── app/
│   │   ├── core/            # config.py, database.py, security.py
│   │   ├── models/          # 20 modelos SQLAlchemy
│   │   ├── modules/         # 19 módulos (router + schemas + service)
│   │   └── scripts/         # bootstrap.py, seed.py
│   └── tests/               # 83 tests (pytest + aiosqlite)
└── frontend/
    ├── Dockerfile           # Multi-stage build
    ├── package.json
    ├── src/
    │   ├── app/             # 23 rutas App Router
    │   ├── components/      # UI reutilizable
    │   ├── lib/             # api.ts, api-types.ts
    │   ├── stores/          # Zustand: auth, period
    │   └── styles/          # Tailwind globals
    └── e2e/                 # Playwright
```

---

## Variables de entorno

| Variable | Descripción | Requerida | Ejemplo |
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
| `ADMIN_PASSWORD` | Password del admin seed | No | `admin123` |

---

## Limitaciones conocidas

1. Los parsers PDF se validaron con fixtures sintéticos; pueden necesitar ajustes con cartolas reales de cada banco.
2. OCR requiere Tesseract con idioma español instalado (Docker lo trae; fuera de Docker hay que instalarlo manualmente).
3. `ADMIN_PASSWORD` y `POSTGRES_PASSWORD` son valores de desarrollo; cambiarlos antes de exponer la app.
4. La revocación JWT usa una tabla en PostgreSQL, sin limpieza periódica automática.
5. Parsing y OCR corren dentro del mismo backend (sin workers separados, decisión de arquitectura).
6. Backup import ZIP: los IDs se regeneran, así que modelos con FK dependientes (GoalContribution) no se reimportan correctamente.
