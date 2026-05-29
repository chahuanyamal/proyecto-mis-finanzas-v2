# Mis Finanzas V2

Aplicación web local de finanzas personales para importar cartolas PDF, categorizar movimientos, revisar dashboards mensuales, gestionar presupuestos y exportar movimientos a Excel.

## Stack

| Capa | Tecnología | Versión |
| --- | --- | --- |
| Frontend | Next.js App Router | 15.5.x |
| UI | React | 19.2.x |
| Lenguaje frontend | TypeScript strict | 5.9.x |
| Estilos | Tailwind CSS | 3.4.x |
| Estado/datos frontend | TanStack React Query, Zustand, Axios | 5.x, 5.x, 1.16.x |
| Tests frontend | Vitest, Testing Library, jsdom | 2.1.x, 16.x, 29.x |
| Backend | FastAPI, Uvicorn | 0.115+, 0.32+ |
| Lenguaje backend | Python | 3.12 |
| Dependencias backend | uv | 0.8+ |
| ORM | SQLAlchemy async | 2.0+ |
| Base de datos | PostgreSQL | 16 |
| Driver DB | asyncpg | 0.30+ |
| Migraciones | Alembic | 1.14+ |
| Auth | PyJWT, bcrypt, cookies HttpOnly | 2.9+, 4.2+ |
| PDF/OCR | pdfplumber, pytesseract, Tesseract OCR | 0.11+, 0.3+ |
| Excel | openpyxl | 3.1+ |
| Infra | Docker Compose | v2 |

## Requisitos previos

- Docker Engine 24+ y Docker Compose v2 para levantar todo con contenedores.
- Node.js 22.12+ y npm 10+ para desarrollo frontend local.
- Python 3.12+ para desarrollo backend local.
- uv 0.8+ para instalar y ejecutar dependencias Python.
- PostgreSQL 16 para desarrollo backend sin Docker.
- Tesseract OCR con idioma español (`tesseract-ocr`, `tesseract-ocr-spa`) si se probará OCR fuera de Docker.

## Variables de entorno

| Variable | Descripción | Requerida | Valor de ejemplo |
| --- | --- | --- | --- |
| `APP_ENV` | Entorno de ejecución. En `production` valida que `SECRET_KEY` sea segura. | No | `development` |
| `DEBUG` | Activa logging SQL de SQLAlchemy. | No | `false` |
| `ALLOWED_ORIGINS` | Orígenes CORS permitidos separados por coma. | No | `http://localhost:1510` |
| `INTERNAL_API_URL` | URL usada por Next.js para reescribir `/api/*` hacia el backend. | Sí frontend | `http://backend:8000` |
| `DATABASE_URL` | URL async SQLAlchemy hacia PostgreSQL. | Sí backend | `postgresql+asyncpg://finanzas:finanzas@localhost:5432/finanzas` |
| `UPLOAD_DIR` | Directorio donde se guardan PDFs subidos. | No | `/app/uploads` |
| `POSTGRES_DB` | Nombre de la DB creada por el contenedor Postgres. | Sí Docker | `finanzas` |
| `POSTGRES_USER` | Usuario de Postgres. | Sí Docker | `finanzas` |
| `POSTGRES_PASSWORD` | Password de Postgres. | Sí Docker | `finanzas` |
| `SECRET_KEY` | Clave de firma JWT, mínimo 32 caracteres en producción. | Sí backend | `openssl-rand-hex-32...` |
| `JWT_ALGORITHM` | Algoritmo JWT. | No | `HS256` |
| `JWT_ACCESS_EXPIRE_MINUTES` | Duración del access token en minutos. | No | `15` |
| `JWT_REFRESH_EXPIRE_DAYS` | Duración del refresh token en días. | No | `7` |
| `COOKIE_SECURE` | Marca cookies como `Secure`; usar `true` con HTTPS. | No | `false` |
| `ADMIN_EMAIL` | Email del admin creado por el seed. | No | `admin@finanzas.local` |
| `ADMIN_FULL_NAME` | Nombre visible del admin creado por el seed. | No | `Admin` |
| `ADMIN_PASSWORD` | Password inicial del admin creado por el seed. | No | `admin123` |
| `TEST_DATABASE_URL` | URL opcional para correr tests backend contra Postgres en vez de SQLite en memoria. | No | `postgresql+asyncpg://finanzas:finanzas@localhost:5432/finanzas_test` |

## Levantar en local (sin Docker)

```bash
# 1. Base de datos local
createdb finanzas

# 2. Variables de entorno
cp .env.example .env
# Edita .env y usa DATABASE_URL=postgresql+asyncpg://finanzas:finanzas@localhost:5432/finanzas

# 3. Backend
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.scripts.seed
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 4. Frontend, en otra terminal
cd frontend
npm install
INTERNAL_API_URL=http://localhost:8000 npm run dev
```

URLs locales:

- Backend: `http://localhost:8000`
- Swagger/OpenAPI: `http://localhost:8000/docs`
- Frontend sin Docker: `http://localhost:3000`

## Levantar con Docker

```bash
# Crear archivo de entorno
cp .env.example .env

# Recomendado antes de levantar en un entorno real
openssl rand -hex 32
# Copia el valor generado en SECRET_KEY dentro de .env

# Build de imágenes
docker compose build

# Levantar servicios en segundo plano
docker compose up -d

# Build + levantar en un solo comando
docker compose up --build -d

# Ver logs de todos los servicios
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Detener contenedores conservando volúmenes
docker compose down

# Detener y borrar volúmenes, reseteando la DB
docker compose down -v
```

URLs con Docker:

- Frontend: `http://localhost:1510`
- Backend: `http://localhost:8000`
- Swagger/OpenAPI: `http://localhost:8000/docs`
- PostgreSQL: `localhost:5432`

## Scripts disponibles

| Comando | Descripción | Cuándo usarlo |
| --- | --- | --- |
| `cd frontend && npm run dev` | Inicia Next.js en modo desarrollo. | Desarrollo diario frontend. |
| `cd frontend && npm run build` | Genera build productivo de Next.js. | Antes de Docker/merge/despliegue. |
| `cd frontend && npm run start` | Sirve el build productivo. | Probar producción local tras `build`. |
| `cd frontend && npm test` | Ejecuta Vitest una vez. | Validar tests frontend en CI/local. |
| `cd frontend && npm run lint` | Ejecuta ESLint sobre `src/**/*.{ts,tsx}`. | Antes de commitear cambios frontend. |
| `cd frontend && npm run type-check` | Ejecuta `tsc --noEmit`. | Validar TypeScript estricto. |
| `cd frontend && npm run typecheck` | Alias histórico de `type-check`. | Compatibilidad con comandos anteriores. |
| `cd frontend && npm run test:watch` | Ejecuta Vitest en watch mode. | Desarrollar tests frontend. |
| `cd backend && uv run uvicorn app.main:app --reload` | Inicia FastAPI con reload. | Desarrollo diario backend. |
| `cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000` | Inicia FastAPI sin reload. | Ejecución local estable. |
| `cd backend && uv run pytest tests/ -q` | Ejecuta tests backend. | Validar backend antes de merge. |
| `cd backend && uv run alembic upgrade head` | Aplica migraciones pendientes. | Inicializar o actualizar DB. |
| `cd backend && uv run alembic heads` | Lista heads de Alembic. | Verificar que no existan ramas de migración. |
| `cd backend && uv run python -m app.scripts.seed` | Siembra admin, instituciones y categorías. | Primera carga o reparación de datos base. |
| `docker compose build` | Construye imágenes backend/frontend. | Validar Dockerfiles y preparar despliegue. |
| `docker compose up -d` | Levanta Postgres, backend y frontend. | Ejecutar app completa con Docker. |
| `docker compose logs -f` | Muestra logs en vivo. | Diagnóstico de startup/runtime. |
| `docker compose down` | Detiene servicios. | Apagar entorno Docker. |

## Estructura del proyecto

```text
.
├── .env.example                 # Plantilla de variables de entorno.
├── AGENTS.md                    # Reglas de trabajo del proyecto.
├── docker-compose.yml           # Orquesta postgres, backend y frontend.
├── Makefile                     # Atajos para Docker Compose.
├── README.md                    # Documentación principal.
├── backend/                     # API FastAPI y dominio de negocio.
│   ├── Dockerfile               # Imagen Python 3.12 con uv, Tesseract y cliente Postgres.
│   ├── entrypoint.sh            # Espera Postgres, ejecuta bootstrap y levanta Uvicorn.
│   ├── pyproject.toml           # Dependencias Python y configuración de pytest.
│   ├── uv.lock                  # Lockfile de dependencias backend.
│   ├── alembic.ini              # Configuración de Alembic.
│   ├── alembic/                 # Entorno y migraciones de base de datos.
│   │   └── versions/            # Migraciones lineales 0001..0005.
│   ├── app/                     # Código fuente backend.
│   │   ├── main.py              # Factory FastAPI, CORS, routers y healthcheck.
│   │   ├── core/                # Configuración, conexión DB y seguridad JWT/bcrypt.
│   │   ├── models/              # Modelos SQLAlchemy.
│   │   ├── modules/             # Módulos por dominio con routers y schemas.
│   │   └── scripts/             # Bootstrap y seed idempotente.
│   └── tests/                   # Suite pytest backend.
└── frontend/                    # Aplicación Next.js.
    ├── Dockerfile               # Build multi-stage con output standalone.
    ├── package.json             # Scripts npm y dependencias frontend.
    ├── package-lock.json        # Lockfile npm.
    ├── next.config.mjs          # Output standalone y rewrite `/api/*`.
    ├── tsconfig.json            # TypeScript strict y alias `@/*`.
    ├── eslint.config.mjs        # ESLint flat config.
    ├── vitest.config.mts        # Configuración de Vitest/jsdom.
    ├── tailwind.config.ts       # Configuración Tailwind.
    └── src/                     # Código fuente frontend.
        ├── app/                 # Rutas App Router.
        ├── components/          # Componentes reutilizables.
        ├── lib/                 # Cliente API, tipos y React Query.
        ├── stores/              # Estado global Zustand.
        └── styles/              # Estilos globales Tailwind.
```

## Limitaciones conocidas

1. Los parsers PDF se validan principalmente con fixtures sintéticos; requieren ajustes con cartolas reales de cada institución.
2. El OCR depende de Tesseract y del idioma español instalado fuera de Docker.
3. No hay suite e2e; la cobertura frontend actual es acotada a cliente API y componentes puntuales.
4. `ADMIN_PASSWORD`, `POSTGRES_PASSWORD` y `COOKIE_SECURE=false` son valores de desarrollo; deben cambiarse antes de exponer la app.
5. La revocación JWT usa una tabla en Postgres; funciona para esta app local, pero no incluye un job dedicado de limpieza periódica.
6. No hay workers separados; parsing/OCR corre dentro del backend por restricción de la v1.
7. El frontend usa rewrites de Next.js hacia el backend; en despliegues con proxy externo hay que revisar `INTERNAL_API_URL` y CORS.
