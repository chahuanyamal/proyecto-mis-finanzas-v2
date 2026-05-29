# Mis Finanzas V2

Aplicación web local de finanzas personales para importar cartolas PDF, categorizar movimientos, revisar dashboard mensual, gestionar presupuestos, metas, recurrentes, patrimonio, auditoría, reconciliación y exportaciones.

## Stack

| Capa | Tecnología | Versión actual/verificada |
| --- | --- | --- |
| Frontend | Next.js App Router | 15.5.18 |
| UI | React / React DOM | 19.2.6 |
| Lenguaje frontend | TypeScript strict | 5.9.3 |
| Estilos | Tailwind CSS | 3.4.19 |
| Estado/datos frontend | Zustand, TanStack React Query, Axios | 5.0.13, 5.100.14, 1.16.1 |
| Gráficos | Recharts | 2.15.4 |
| Tests frontend | Vitest, Testing Library, Playwright | 3.2.4, 16.3.2, 1.60.0 |
| Backend | FastAPI, Uvicorn | 0.136.3, 0.48.0 |
| Lenguaje backend | Python | 3.12 |
| Dependencias backend | uv | 0.8+ |
| ORM | SQLAlchemy async | 2.0.50 |
| Base de datos | PostgreSQL | 16-alpine |
| Driver DB | asyncpg | 0.31.0 |
| Migraciones | Alembic | 1.18.4 |
| Auth | PyJWT, bcrypt, cookies HttpOnly | 2.13.0, 5.0.0 |
| PDF/OCR | pdfplumber, pytesseract, Tesseract OCR | 0.11.9, 0.3.13 |
| Excel | openpyxl | 3.1.5 |
| Infra | Docker Compose | v2 |

## Requisitos previos

- Docker Engine 24+ y Docker Compose v2.
- Node.js 22.12+ y npm 10+.
- Python 3.12+.
- uv 0.8+.
- PostgreSQL 16 si se desarrolla sin Docker.
- Tesseract OCR con idioma español (`tesseract-ocr`, `tesseract-ocr-spa`) si se prueba OCR fuera de Docker.
- Navegador Playwright instalado para e2e: `cd frontend && npm run test:e2e:install`.

## Variables de entorno

| Variable | Descripción | Requerida | Valor de ejemplo |
| --- | --- | --- | --- |
| `APP_ENV` | Entorno de ejecución. En `production` valida `SECRET_KEY`. | No | `development` |
| `DEBUG` | Activa logging SQL de SQLAlchemy. | No | `false` |
| `ALLOWED_ORIGINS` | Orígenes CORS permitidos separados por coma. | No | `http://localhost:1510` |
| `INTERNAL_API_URL` | URL usada por Next.js para reescribir `/api/*` hacia backend. | Sí frontend | `http://backend:8000` |
| `DATABASE_URL` | URL async SQLAlchemy hacia PostgreSQL. | Sí backend | `postgresql+asyncpg://finanzas:finanzas@postgres:5432/finanzas` |
| `UPLOAD_DIR` | Directorio de PDFs subidos. | No | `/app/uploads` |
| `POSTGRES_DB` | Nombre de DB creada por contenedor Postgres. | Sí Docker | `finanzas` |
| `POSTGRES_USER` | Usuario de Postgres. | Sí Docker | `finanzas` |
| `POSTGRES_PASSWORD` | Password de Postgres. | Sí Docker | `finanzas` |
| `SECRET_KEY` | Clave de firma JWT. Mínimo 32 caracteres en producción. | Sí backend | `openssl-rand-hex-32...` |
| `JWT_ALGORITHM` | Algoritmo JWT. | No | `HS256` |
| `JWT_ACCESS_EXPIRE_MINUTES` | Duración access token en minutos. | No | `15` |
| `JWT_REFRESH_EXPIRE_DAYS` | Duración refresh token en días. | No | `7` |
| `COOKIE_SECURE` | Marca cookies como `Secure`; usar `true` con HTTPS. | No | `false` |
| `ADMIN_EMAIL` | Email del admin creado por seed. | No | `admin@finanzas.local` |
| `ADMIN_FULL_NAME` | Nombre visible del admin seed. | No | `Admin` |
| `ADMIN_PASSWORD` | Password inicial del admin seed. | No | `admin123` |
| `TEST_DATABASE_URL` | DB opcional para tests backend. | No | `sqlite+aiosqlite:///:memory:` |
| `E2E_BASE_URL` | URL base para Playwright. | No | `http://localhost:1510` |
| `E2E_SKIP_WEB_SERVER` | Evita que Playwright levante `npm run dev`. | No | `1` |
| `E2E_USER` | Usuario usado por e2e autenticado. | No | `admin@finanzas.local` |
| `E2E_PASSWORD` | Password usado por e2e autenticado. | No | `admin123` |

## Levantar en local (sin Docker)

```bash
# 1. Crear DB local
createdb finanzas

# 2. Preparar variables
cp .env.example .env
# Ajustar DATABASE_URL a localhost si no usas Docker:
# DATABASE_URL=postgresql+asyncpg://finanzas:finanzas@localhost:5432/finanzas

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
# Crear entorno
cp .env.example .env

# Generar SECRET_KEY recomendado
openssl rand -hex 32

# Build de imágenes
docker compose build

# Levantar servicios
docker compose up -d

# Build + levantar en un comando
docker compose up --build -d

# Ver logs
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Apagar conservando volúmenes
docker compose down

# Apagar y borrar datos locales
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
| `cd frontend && npm run dev` | Inicia Next.js en desarrollo. | Desarrollo frontend diario. |
| `cd frontend && npm run build` | Genera build productivo. | Antes de Docker/merge. |
| `cd frontend && npm run start` | Sirve build productivo. | Probar producción local. |
| `cd frontend && npm test` | Ejecuta Vitest. | Validar tests frontend. |
| `cd frontend && npm run lint` | Ejecuta ESLint. | Antes de commitear frontend. |
| `cd frontend && npm run type-check` | Ejecuta `tsc --noEmit`. | Validar TypeScript strict. |
| `cd frontend && npm run test:e2e:install` | Instala Chromium para Playwright. | Primera vez o al actualizar Playwright. |
| `cd frontend && npm run test:e2e` | Ejecuta Playwright. | Validar navegación e2e. |
| `cd backend && uv run uvicorn app.main:app --reload` | Inicia FastAPI con reload. | Desarrollo backend diario. |
| `cd backend && uv run pytest tests/ -q` | Ejecuta suite backend. | Validar backend. |
| `cd backend && uv run alembic upgrade head` | Aplica migraciones. | Inicializar/actualizar DB. |
| `cd backend && uv run alembic heads` | Lista heads de migración. | Verificar rama única de Alembic. |
| `cd backend && uv run python -m app.scripts.seed` | Siembra admin e información base. | Primera carga o reparación. |
| `docker compose build` | Construye imágenes. | Validar Dockerfiles. |
| `docker compose up -d` | Levanta servicios. | Ejecutar app completa. |
| `docker compose up --build -d` | Construye y levanta servicios. | Verificación integral. |
| `docker compose logs -f` | Muestra logs. | Diagnóstico runtime. |
| `docker compose down` | Detiene servicios. | Apagar entorno Docker. |

## Estructura del proyecto

```text
.
├── .env.example                 # Plantilla de configuración local/Docker/tests.
├── AGENTS.md                    # Reglas de trabajo del proyecto.
├── docker-compose.yml           # Servicios postgres, backend y frontend.
├── Makefile                     # Atajos de desarrollo/Docker.
├── README.md                    # Documentación principal.
├── docs/                        # Documentación complementaria y comparación con app anterior.
├── backend/                     # API FastAPI y lógica de negocio.
│   ├── Dockerfile               # Imagen Python 3.12 con uv, Tesseract y cliente Postgres.
│   ├── entrypoint.sh            # Espera Postgres, bootstrap, seed y Uvicorn.
│   ├── pyproject.toml           # Dependencias Python y configuración pytest.
│   ├── uv.lock                  # Lockfile backend.
│   ├── alembic/                 # Migraciones de base de datos.
│   ├── app/                     # Código fuente backend.
│   │   ├── core/                # Configuración, DB y seguridad.
│   │   ├── models/              # Modelos SQLAlchemy.
│   │   ├── modules/             # Routers, schemas y servicios por dominio.
│   │   └── scripts/             # Bootstrap y seed.
│   └── tests/                   # Suite pytest backend.
└── frontend/                    # Aplicación Next.js.
    ├── Dockerfile               # Build multi-stage con output standalone.
    ├── package.json             # Scripts npm y dependencias.
    ├── package-lock.json        # Lockfile npm.
    ├── playwright.config.ts     # Configuración e2e.
    ├── next.config.mjs          # Output standalone y rewrite `/api/*`.
    ├── tsconfig.json            # TypeScript strict y alias `@/*`.
    ├── eslint.config.mjs        # ESLint flat config.
    ├── vitest.config.mts        # Vitest/jsdom.
    ├── tailwind.config.ts       # Tailwind CSS.
    ├── e2e/                     # Tests Playwright.
    └── src/                     # Código fuente frontend.
        ├── app/                 # Rutas App Router.
        ├── components/          # Componentes reutilizables.
        ├── lib/                 # Cliente API y tipos.
        ├── stores/              # Estado global Zustand.
        └── styles/              # Estilos globales.
```

## Limitaciones conocidas

1. Los parsers PDF se validan principalmente con fixtures sintéticos; necesitan ajustes con cartolas reales de cada banco.
2. OCR depende de Tesseract y del idioma español instalado fuera de Docker.
3. La reconciliación compara saldo actual contra neto de movimientos importados; aún no usa saldos iniciales/finales bancarios reales.
4. La suite e2e inicial cubre navegación/login; falta ampliar flujos autenticados con datos seed.
5. `ADMIN_PASSWORD`, `POSTGRES_PASSWORD` y `COOKIE_SECURE=false` son valores de desarrollo; deben cambiarse antes de exponer la app.
6. La revocación JWT usa tabla en Postgres, sin job dedicado de limpieza periódica.
7. No hay workers separados; parsing/OCR corre dentro del backend por restricción de v1.
8. El frontend usa rewrites de Next.js hacia backend; en despliegues con proxy externo revisar `INTERNAL_API_URL` y CORS.
9. `npm audit` reporta 2 vulnerabilidades moderadas transitivas en `next/postcss`; no se aplicó `npm audit fix --force` porque intenta un cambio mayor incorrecto.
10. `npm ls --depth=0` puede mostrar `@emnapi/runtime` como extraneous en el workspace local; Docker usa `npm ci` limpio y no reproduce ese estado.

## Flujo de cartolas

1. Abrir `Cartolas`, elegir cuenta, parser automático o parser forzado, y PDF.
2. Generar preview para revisar filas, editar datos, eliminar filas erróneas, detectar duplicados y exportar CSV.
3. Confirmar preview para crear cartola y movimientos importados.
4. Revisar detalle de cartola, calidad individual, filtros, CSV, reproceso o rollback.
5. Usar `Revisión` para movimientos sin categoría y creación de reglas reutilizables.

Ver también `docs/validacion-cartolas-reales.md` para validar parsers con PDFs reales sin commitear datos sensibles.
