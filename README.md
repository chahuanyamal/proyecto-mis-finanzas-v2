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

### Tests

```bash
cd backend
uv run pytest
```

Los tests actuales cubren el parser de cartolas con fixtures de texto para Itaú, BICE, Prex y fallback genérico.

## Admin por defecto

Al iniciar por primera vez se crea automáticamente:

| Campo     | Valor                    |
| --------- | ------------------------ |
| Email     | admin@finanzas.local     |
| Password  | admin123                 |

Configurable en `.env` con `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`.

## Validación de cartolas reales

Para cerrar un parser bancario contra cartolas reales:

1. Levantar la app con `docker compose up --build -d`.
2. Entrar a `http://localhost:1510` con el usuario admin.
3. Crear o seleccionar una cuenta de la institución correspondiente.
4. Subir el PDF en `/statements` y revisar el preview antes de confirmar.
5. Verificar banco detectado, cantidad de filas, fechas, cargos/abonos y montos.
6. Si falla, crear un fixture sanitizado en `backend/tests/` con texto extraído, nunca con datos personales reales.

No hay PDFs reales en el repositorio; los parsers actuales se validan con fixtures sintéticos y deben ajustarse cuando se prueben cartolas reales.

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
- [x] CRUD básico de cuentas (`/api/v1/accounts`) + página `/accounts`
- [x] CRUD básico de categorías, tags y reglas de categorización
- [x] CRUD básico de transacciones manuales + página `/transactions`
- [x] Presupuestos mensuales + página `/presupuestos`
- [x] Dashboard mensual real (`/api/v1/dashboard/monthly`)
- [x] Auto-categorización por reglas y exportación Excel de transacciones
- [x] Upload PDF + parser fallback básico + historial `/statements`
- [x] Preview/confirmación/cancelación/reproceso básico de cartolas PDF
- [x] Detección inicial de banco + parsers Itaú/BICE/Prex/fallback
- [x] OCR fallback con Tesseract cuando el PDF no trae texto útil
- [x] Shell visual autenticado para navegación principal
- [ ] Parsers bancarios específicos completos con fixtures reales por institución
- [x] Tests unitarios iniciales del parser de cartolas
- [ ] Cobertura completa de tests backend/frontend

## Limitaciones actuales

- **API parcial.** Existen `/health`, autenticación, cuentas, categorías, tags, reglas, transacciones manuales, presupuestos, dashboard mensual, auto-categorización, export Excel y cartolas PDF con preview/confirmación básica. Falta endurecer parsers bancarios con cartolas reales y reportes avanzados.
- **Auth v1 simplificada.** Usa JWT en cookies HttpOnly, sin Redis ni blacklist de sesiones. Refresh token es JWT firmado, no persistido en BD.
- **Frontend v1.** Login, shell autenticado y pantallas CRUD principales funcionan; falta pulir UX/validaciones finas.
- **Cobertura baja de tests.** Hay tests unitarios iniciales para parsers de cartolas; faltan tests de API, auth, queries por `user_id` y frontend.
- **PDF parsing inicial.** Usa `pdfplumber`; si no hay texto útil cae a OCR con `pytesseract`. Hay detección inicial para Itaú, BICE, Prex y fallback genérico, pero requiere validarse con PDFs reales.
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
| `UPLOAD_DIR`           | `/app/uploads`                                            | Carpeta de PDFs subidos                     |
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
| `GET` | `/api/v1/institutions` | Lista instituciones seeded |
| `GET` | `/api/v1/accounts` | Lista cuentas del usuario autenticado |
| `POST` | `/api/v1/accounts` | Crea cuenta para el usuario autenticado |
| `GET` | `/api/v1/accounts/{id}` | Obtiene una cuenta propia |
| `PATCH` | `/api/v1/accounts/{id}` | Edita una cuenta propia |
| `DELETE` | `/api/v1/accounts/{id}` | Elimina una cuenta propia |
| `GET` | `/api/v1/categories` | Lista categorías |
| `POST` | `/api/v1/categories` | Crea categoría |
| `PATCH` | `/api/v1/categories/{id}` | Edita categoría |
| `DELETE` | `/api/v1/categories/{id}` | Elimina categoría |
| `GET` | `/api/v1/tags` | Lista tags del usuario |
| `POST` | `/api/v1/tags` | Crea tag |
| `PATCH` | `/api/v1/tags/{id}` | Edita tag |
| `DELETE` | `/api/v1/tags/{id}` | Elimina tag |
| `GET` | `/api/v1/category-rules` | Lista reglas del usuario |
| `POST` | `/api/v1/category-rules` | Crea regla |
| `PATCH` | `/api/v1/category-rules/{id}` | Edita regla |
| `DELETE` | `/api/v1/category-rules/{id}` | Elimina regla |
| `GET` | `/api/v1/transactions` | Lista transacciones del usuario con filtros básicos |
| `GET` | `/api/v1/transactions/export/excel` | Exporta transacciones a Excel |
| `POST` | `/api/v1/transactions/auto-categorize` | Aplica reglas a transacciones sin categoría |
| `POST` | `/api/v1/transactions` | Crea transacción manual |
| `GET` | `/api/v1/transactions/{id}` | Obtiene transacción propia |
| `PATCH` | `/api/v1/transactions/{id}` | Edita transacción propia |
| `DELETE` | `/api/v1/transactions/{id}` | Elimina transacción propia |
| `GET` | `/api/v1/budgets` | Lista presupuestos del usuario |
| `POST` | `/api/v1/budgets` | Crea presupuesto mensual |
| `PATCH` | `/api/v1/budgets/{id}` | Edita presupuesto propio |
| `DELETE` | `/api/v1/budgets/{id}` | Elimina presupuesto propio |
| `GET` | `/api/v1/dashboard/monthly` | Resumen mensual de ingresos, gastos y presupuestos |
| `GET` | `/api/v1/statements` | Lista PDFs subidos por el usuario |
| `GET` | `/api/v1/statements/previews` | Lista previews pendientes del usuario |
| `POST` | `/api/v1/statements/preview` | Sube PDF, parsea fallback y guarda preview pendiente |
| `GET` | `/api/v1/statements/previews/{id}` | Obtiene un preview propio |
| `POST` | `/api/v1/statements/previews/{id}/confirm` | Confirma preview e importa transacciones |
| `POST` | `/api/v1/statements/previews/{id}/cancel` | Cancela preview pendiente |
| `GET` | `/api/v1/statements/history/{id}` | Detalle de una cartola importada y sus transacciones |
| `POST` | `/api/v1/statements/history/{id}/reprocess` | Reprocesa una cartola importada |
| `POST` | `/api/v1/statements/upload` | Sube PDF y aplica parser fallback básico |

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
