# Mis Finanzas V2

App web local de finanzas personales. Importar cartolas PDF, categorizar, dashboard mensual, presupuestos, exportación Excel.

## Stack

| Capa       | Tecnología                            |
| ---------- | ------------------------------------- |
| Frontend   | Next.js 15 + TypeScript strict + Tailwind CSS |
| Backend    | FastAPI + Python 3.12 + uv            |
| ORM        | SQLAlchemy 2 async                    |
| DB         | PostgreSQL 16 + asyncpg               |
| Migraciones| Alembic                               |
| PDF        | pdfplumber + pytesseract              |
| Excel      | openpyxl                              |
| Infra      | Docker Compose                        |

## Requisitos

- Docker + Docker Compose
- (Desarrollo local) Node.js 22+, Python 3.12+, uv

## Arranque rápido (Docker)

```bash
# 1. Crear archivo de entorno
cp .env.example .env

# 2. Editar .env: cambiar SECRET_KEY (recomendado: openssl rand -hex 32)

# 3. Levantar todos los servicios
docker compose up --build -d

# Esperar ~15s a que Postgres + backend estén listos
```

## Arranque con Makefile

```bash
make help          # Ver todos los comandos disponibles
make build         # Reconstruir y levantar
make up            # Levantar servicios (sin rebuild)
make down          # Detener servicios
make logs          # Ver logs en vivo
make reset-db      # Destruir volúmenes y recrear desde cero
make shell-backend # Entrar al contenedor del backend
make shell-db      # Conectar a psql
```

## Servicios

| Servicio      | URL                         |
| ------------- | --------------------------- |
| Frontend      | http://localhost:1510       |
| Backend API   | http://localhost:8000       |
| Swagger Docs  | http://localhost:8000/docs  |
| PostgreSQL    | localhost:5432 (finanzas/finanzas) |

## Desarrollo local

### Backend

```bash
cd backend
cp ../.env .
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```

### Comandos disponibles

| Comando              | Descripción                   |
| -------------------- | ----------------------------- |
| `npm run dev`        | Servidor de desarrollo        |
| `npm run build`      | Build de producción           |
| `npm run start`      | Iniciar build de producción   |
| `npm run lint`       | Lint con ESLint               |
| `npm run typecheck`  | Verificar tipos TypeScript    |

### Base de datos (desarrollo local)

Si ejecutas el backend fuera de Docker necesitas PostgreSQL corriendo localmente o ajustar `DATABASE_URL` en `.env`:

```
DATABASE_URL=postgresql+asyncpg://finanzas:finanzas@localhost:5432/finanzas
```

### Migraciones

```bash
cd backend
uv run alembic upgrade head     # Aplicar migraciones pendientes
uv run alembic revision --autogenerate -m "descripción"  # Crear nueva migración
```

## Admin por defecto

Al iniciar por primera vez se crea automáticamente:

| Campo     | Valor                    |
| --------- | ------------------------ |
| Email     | admin@finanzas.local     |
| Password  | admin123                 |

Configurable en `.env` con `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`.

## Estado actual del proyecto

**Etapa 1 — Scaffolding (completada)**

- [x] Modelos SQLAlchemy + migración inicial
- [x] Configuración del proyecto (config, DB, seguridad)
- [x] Health check endpoint (`/health`)
- [x] Bootstrap automático (migraciones + seed)
- [x] Docker Compose funcional
- [x] Frontend Next.js 15 scaffold con Tailwind CSS + React Query
- [x] Endpoints API REST de autenticación (`/api/v1/auth/*`)
- [x] Autenticación JWT con cookies HttpOnly (login, refresh, logout, me)
- [ ] Upload y parseo de PDF
- [ ] Dashboard mensual
- [ ] Categorización por reglas
- [ ] Presupuestos y alertas
- [ ] Exportación Excel
- [ ] Tests

## Limitaciones actuales

- **API parcial.** Existen `/health` y endpoints de autenticación. Falta migrar cuentas, transacciones, categorías, PDFs, presupuestos y dashboard real.
- **Auth v1 simplificada.** Usa JWT en cookies HttpOnly, sin Redis ni blacklist de sesiones. Refresh token es JWT firmado, no persistido en BD.
- **Frontend mínimo.** Login y dashboard autenticado funcionan, pero el dashboard aún es placeholder.
- **Sin tests.** `pytest` y `pytest-asyncio` están en dependencias pero no hay archivos de test.
- **PDF parsing no implementado.** `pdfplumber` y `pytesseract` están instalados pero sin código que los use.
- **Exportación Excel no implementada.** `openpyxl` instalado pero sin uso.
- **Sin manejo de archivos.** `python-multipart` instalado pero no hay endpoints de upload.
- **Admin creado sin verificación de unicidad en seed concurrente.** El seed de bootstrap no usa locking; si múltiples instancias arrancan simultáneamente puede haber race condition (poco probable en deploy single-instance).
- **El `SECRET_KEY` por defecto es inseguro.** Debe cambiarse en producción con `openssl rand -hex 32`.

## Variables de entorno

| Variable               | Default                                                    | Descripción                         |
| ---------------------- | ---------------------------------------------------------- | ----------------------------------- |
| `APP_ENV`              | `development`                                              | Entorno de la app                   |
| `DEBUG`                | `true`                                                     | SQLAlchemy echo / modo debug        |
| `ALLOWED_ORIGINS`      | `http://localhost:1510`                                    | CORS origins (separar por coma)     |
| `DATABASE_URL`         | `postgresql+asyncpg://finanzas:finanzas@postgres:5432/finanzas` | Conexión a BD                  |
| `POSTGRES_DB`          | `finanzas`                                                 | Nombre BD                           |
| `POSTGRES_USER`        | `finanzas`                                                 | Usuario BD                          |
| `POSTGRES_PASSWORD`    | `finanzas`                                                 | Password BD                         |
| `SECRET_KEY`           | `cambiar-en-produccion...`                                 | Clave JWT (min 32 chars)            |
| `JWT_ALGORITHM`        | `HS256`                                                    | Algoritmo JWT                       |
| `JWT_ACCESS_EXPIRE_MINUTES` | `15`                                                  | Expiración access token             |
| `JWT_REFRESH_EXPIRE_DAYS`   | `7`                                                    | Expiración refresh token            |
| `COOKIE_SECURE`        | `false`                                                   | Cookies solo HTTPS (`true` en prod con TLS) |
| `ADMIN_EMAIL`          | `admin@finanzas.local`                                     | Email admin inicial                 |
| `ADMIN_FULL_NAME`      | `Admin`                                                    | Nombre admin inicial                |
| `ADMIN_PASSWORD`       | `admin123`                                                 | Password admin inicial              |

## Endpoints implementados

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| `GET` | `/health` | Healthcheck con conexión a Postgres |
| `POST` | `/api/v1/auth/login` | Login; setea cookies `access_token` y `refresh_token` |
| `POST` | `/api/v1/auth/refresh` | Renueva cookies desde refresh token |
| `POST` | `/api/v1/auth/logout` | Limpia cookies de sesión |
| `GET` | `/api/v1/auth/me` | Usuario autenticado actual |

## Estructura del proyecto

```
├── docker-compose.yml
├── Makefile
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   └── app/
│       ├── main.py
│       ├── core/
│       │   ├── config.py
│       │   ├── database.py
│       │   └── security.py
│       ├── models/
│       │   ├── user.py
│       │   ├── account.py
│       │   ├── institution.py
│       │   ├── category.py
│       │   ├── category_rule.py
│       │   ├── transaction.py
│       │   ├── transaction_tag.py
│       │   ├── tag.py
│       │   ├── budget.py
│       │   ├── uploaded_file.py
│       │   └── mixins.py
│       └── scripts/
│           ├── bootstrap.py
│           └── seed.py
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── next.config.mjs
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   └── page.tsx
        ├── lib/
        │   └── query-client.tsx
        └── styles/
            └── globals.css
```

## Modelo de datos

```
User (1) ──< (N) Account ──< (N) UploadedFile ──< (N) Transaction
User (1) ──< (N) CategoryRule              Transaction >── (N) TransactionTag ──< (N) Tag
User (1) ──< (N) Budget                                               User (1) ──< (N) Tag
User (1) ──< (N) UploadedFile
                                                                                Category (1) ──< (N) Category (self-referential tree)
Account (N) >── (1) Institution                                            Category (1) ──< (N) Transaction
Category (1) ──< (N) CategoryRule                                          Category (1) ──< (N) Budget
```
