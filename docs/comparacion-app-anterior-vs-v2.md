# Comparación: App Anterior (`ref`) vs V2

## Stack

| Capa | ref | v2 |
|---|---|---|
| Frontend | Next.js 15 + Radix UI + Tailwind css + framer-motion | Next.js 15 + Tailwind CSS + custom Bóveda |
| Backend | FastAPI + Celery + Redis | FastAPI (sin workers) |
| DB | PostgreSQL 16 + asyncpg | PostgreSQL 16 + asyncpg |
| ORM | SQLAlchemy 2 async + SoftDelete | SQLAlchemy 2 async |
| Migraciones | Alembic (UUIDs hash) | Alembic (000X secuencial) |
| Auth | JWT + Redis (sesiones, blacklist, rate-limit) | JWT + tabla `revoked_tokens` (sin Redis) |
| PDF | pdfplumber + pytesseract | pdfplumber + pytesseract |
| ML | scikit-learn (TF-IDF + k-NN) | No |
| Desktop | Tauri v2 | No |
| Workers | Celery + Redis + redbeat | No |
| Linting | Biome | ESLint + TypeScript strict |
| CSS | Radix + tailwindcss-animate + clsx | Tailwind + clsx + tailwind-merge |
| Charts | recharts | recharts |

## Features financieras

| Feature | ref | v2 |
|---|---|---|
| Dashboard mensual | Sí | Sí |
| Dashboard por período (MTD/30d/YTD/12m) | Sí | Sí |
| Dashboard caching (Redis) | Sí | No (cada request recalcula) |
| Proyección fin de mes (dashboard) | Sí (usa recurrencias) | No |
| Tendencias mensuales | Sí | Sí |
| Transacciones CRUD | Sí | Sí |
| Export CSV/Excel | Sí | Sí |
| Bulk categorizar/tags/eliminar | Sí | Sí |
| Splits de transacción | Sí | Sí |
| Tags en transacciones | Sí | Sí |
| Cuentas CRUD | Sí | Sí |
| Categorías CRUD (sistema + propias) | Sí | Sí |
| Presupuestos mensuales | Sí | Sí |
| Alertas de presupuesto | Worker `check_budgets` + modelo `BudgetAlert` | Lazy en dashboard + notificación |
| Metas de ahorro | Sí | Sí |
| Aportes a metas | Sí | Sí |
| Gastos recurrentes | Sí | Sí |
| Detección automática de recurrentes | Sí | Sí |
| Próximos pagos (upcoming) | Sí | Sí |
| Cartolas PDF (upload + preview + confirm) | Sí | Sí |
| Parsers multi-banco | Sí (Itaú, BICE, Prex, TD, Schwab, Alpaca, Generic, Money, UglyCash) | Mismos parsers |
| Revisión OCR | Sí (pytesseract) | Sí |
| Calidad de cartola | Sí | Sí |
| Rollback de importación | Sí | Sí |
| Reprocesar cartola | Sí | Sí |
| Detección duplicados | Sí | Sí |
| Detección transferencias internas | Sí | Sí |
| Patrimonio (net worth) | Sí | Sí |
| Historia patrimonio | Sí (snapshots diarios) | Sí (agregación mensual) |
| Tendencia por cuenta | Sí | Sí |
| Comparar períodos | Sí | Sí |
| Proyección patrimonial (regresión) | Sí | Sí |
| Reconciliación bancaria | Sí | Sí |
| Alertas reconciliación | Sí | Sí |
| Reporte anual | Sí | Sí |
| Búsqueda global | Sí (tsvector GIN) | Sí (LIKE) |
| Reglas de categorización | Sí | Sí |
| Auto-categorizar | Sí (reglas + ML + AI) | Sí (solo reglas) |

## Features extras (ref tiene, v2 no)

| Feature | ref | Por qué no en v2 |
|---|---|---|
| **Familias / cuentas compartidas** | Modelos `Family`, `FamilyMember`, `FamilyAccount` + módulo `families/` | Complejidad extra, no necesario para uso personal |
| **Copia seguridad cloud** | Google Drive + Dropbox via OAuth + `cloud_tokens` encryptados | Dependencias externas, backup ZIP manual suficiente |
| **Webhooks / WhatsApp** | `notifications/webhook.py` | No necesario |
| **Notificaciones push** | Webhook + WebSocket | Solo in-app |
| **WebSocket (preview progress)** | WS `/api/ws/preview/{id}` | No (polling implícito) |
| **AI / LLM** | Ollama + OpenAI para categorizar y revisar cartolas | Dependencia externa, placeholder "Coming Soon" |
| **ML scikit-learn** | TF-IDF + k-NN (`LearningCategorizer`) | Prohibido explícitamente |
| **Anomaly detection** | Z-score por cuenta (`AnomalyDetection`) | No implementado |
| **Sesiones activas** | Listar/revocar sesiones desde `/auth/sessions` | No implementado |
| **Rate limiting** | `slowapi` en login, register, search, admin | No implementado |
| **Account lockout** | Redis-based tras N intentos fallidos | No implementado |
| **Prometheus metrics** | `/api/metrics` con token | No implementado |
| **Sentry** | `sentry-sdk` para errores | No implementado |
| **Soft delete** | `SoftDeleteMixin` en casi todos los modelos | No (borrado físico) |
| **Full-text search** | Columna `search_vector` tsvector con índice GIN | `ILIKE` simple |
| **ETag caching** | Categorías con ETag + `@cache` decorator | No implementado |
| **IP tracking** | IP + User-Agent en audit y sesiones | No |
| **Account groups** | `account_groups` para organizar cuentas | No |
| **Exchange rates** | Tabla `exchange_rates` con tasas históricas | No (solo CLP/USD fijo) |
| **Adjuntos** | `attachments` FK a transaction | No |
| **System settings** | `system_settings` tabla key-value | No (settings en User.preferences) |
| **Statement AI review** | `ai_review` JSONB + panel en preview | No |
| **Budget rollover** | `rollover` field en Budget | No |
| **Budget alert model** | `BudgetAlert` con tracking de notificados | Notificación directa en `Notification` |
| **Email verification** | `email_verified` + flujo de verificación | No |
| **Registro público** | `POST /register` (configurable) | Sí existe |
| **CSP reports** | `/api/csp-report` | No |
| **Tauri desktop** | `src-tauri/` con iOS/Android builds | No (prohibido) |
| **Docker multi-stage** | `Dockerfile.backup`, `Dockerfile.caddy`, `Dockerfile.dev` | Solo Dockerfile simple |

## Diferencias arquitectónicas clave

### 1. Autenticación
- **ref**: JWT access + refresh, sesiones en Redis con metadata (IP, user-agent), blacklist en Redis, rate-limit con slowapi
- **v2**: JWT access + refresh, blacklist en tabla `revoked_tokens` (sin Redis), sin rate-limit, sin sesiones

### 2. Background jobs
- **ref**: Celery + Redis + redbeat para: backup automático, chequeo presupuestos, detección patrones, mantenimiento, refresh tasas
- **v2**: Sin workers. Alertas de presupuesto se evalúan **lazy** al cargar el dashboard

### 3. Modelos
- **ref**: 29 tablas, SoftDeleteMixin, TimestampMixin, search_vector en transacciones, raw_data JSONB
- **v2**: 17 tablas, solo TimestampMixin, sin soft delete, sin tsvector, sin raw_data

### 4. Frontend
- **ref**: Radix UI (12 componentes), framer-motion, sonner toasts, recharts, shadcn-style, Tailwind animate
- **v2**: Hand-rolled Bóveda design system, sin librerías UI externas, recharts, lucide-react, Tailwind + custom CSS

### 5. Caching
- **ref**: Redis caching de dashboard con invalidación por versión
- **v2**: Sin caching (cada request a DB)

### 6. Testing
- **ref**: Vitest (unit) + Playwright (e2e), backend tests con factory-boy
- **v2**: Vitest (5 tests frontend), 83 tests backend con pytest-asyncio, sin e2e

### 7. Parsers
- Ambos comparten los mismos parsers multi-banco (código prácticamente idéntico)

## Resumen: qué ganas y qué pierdes con v2

### Ganas
- ✅ Sin Redis (menos dependencias, menos memoria)
- ✅ Sin Celery/workers (simplicidad operativa)
- ✅ Sin Tauri (solo web)
- ✅ Sin ML/scikit-learn (menos dependencias pesadas)
- ✅ Código más simple y directo
- ✅ TypeScript strict + ESLint (vs Biome en ref)
- ✅ Docker más liviano
- ✅ Backup ZIP manual funcional
- ✅ Notificaciones + Admin usuarios (nuevo en v2)

### Pierdes
- ❌ Caching de dashboard (más lento en carga)
- ❌ Rate limiting (sin protección contra brute force)
- ❌ Account lockout
- ❌ Cloud backup automático
- ❌ Familias/cuentas compartidas
- ❌ ML auto-categorization (solo reglas)
- ❌ AI review de cartolas
- ❌ Full-text search (solo ILIKE)
- ❌ Soft delete (no puedes recuperar datos borrados)
- ❌ Anomaly detection
- ❌ Sesiones (no puedes ver/revocar sesiones activas)
- ❌ WebSocket (previews sin progreso en tiempo real)
- ❌ Exchange rates (solo CLP/USD fijo)

## Tabla comparativa de dependencias

### Python

| Dependencia | ref | v2 |
|---|---|---|
| fastapi | 0.136.1 | >=0.115.0 |
| sqlalchemy[asyncio] | 2.0.50 | >=2.0.36 |
| asyncpg | 0.31.0 | >=0.30.0 |
| alembic | 1.18.4 | >=1.14.0 |
| celery | 5.6.3 | — |
| redis | 7.4.0 | — |
| celery-redbeat | 2.3.3 | — |
| scikit-learn | 1.8.0 | — |
| numpy | 2.4.6 | — |
| sentry-sdk | >=2.60.0 | — |
| prometheus | sí | — |
| slowapi | 0.1.9 | — |
| cryptography | >=42.0.0 | — |
| structlog | >=24.1.0 | — |
| pytest | >=9.0.3 | >=8.3.0 |
| factory-boy | 3.3.3 | — |
| uv | — | Sí (package manager) |
| **Total** | **~30** | **~16** |

### Node.js

| Dependencia | ref | v2 |
|---|---|---|
| radix-ui/* | 12 paquetes | — |
| framer-motion | 12.40.0 | — |
| sonner | 2.0.7 | — |
| @tauri-apps/api | ^2.0.0 | — |
| react-dropzone | 14.2.3 | — |
| pdfjs-dist | 5.4.149 | — |
| @tanstack/react-virtual | 3.10.8 | — |
| recharts | 3.8.1 | 2.13.3 |
| tailwindcss-animate | 1.0.7 | — |
| @biomejs/biome | 1.9.4 | — |
| eslint | — | 9.x |
| eslint-config-next | — | Sí |
| zustand | 5.0.13 | 5.0.1 |
| @tanstack/react-query | 5.100.11 | ^5.59.0 |
| **Total** | **~49** | **~24** |

## Conclusión

La V2 es una **versión minimalista y deliberadamente limitada** del sistema original. Sacrifica features avanzadas (ML, workers, cloud, caché, familias, rate-limiting, sesiones, soft-delete) a cambio de **simplicidad operativa, menos dependencias, y facilidad de despliegue** (sin Redis, sin Celery, sin Tauri).

Ambas apps cubren el **core funcional financiero**: importar cartolas, categorizar, dashboard, presupuestos, metas, patrimonio, reconciliación, recurrencias, splits, tags, búsqueda y reportes. La V2 agrega notificaciones in-app y admin de usuarios que ref no tenía como endpoints standalone.

Para un usuario individual que no necesita ML, cloud backup, ni familias compartidas, la V2 es más liviana y fácil de mantener. Para un power user o familia, ref es más completa.
