# Comparacion app anterior vs Proyecto Mis Finanzas V2

Este documento compara la app anterior `chahuanyamal/mis-finanzas-oficial` con la app nueva `chahuanyamal/proyecto-mis-finanzas-v2`.

La comparacion se hizo usando como referencia local el proyecto anterior disponible en `../proyecto-mis-finanzas-ref` y el proyecto actual en este repositorio.

## Resumen ejecutivo

La app anterior tenia una vision mas ambiciosa: mas pantallas, mas automatizacion, mas infraestructura, mas seguridad operacional y un diseno visual mas elaborado. Tambien tenia mas puntos de falla: workers, Redis, Celery, Tauri, ML local, integraciones cloud, Caddy, backup automatizado y mas servicios.

La app nueva V2 es mas simple y recupera el nucleo importante: autenticacion, cuentas, cartolas PDF, transacciones, categorias, reglas, presupuestos, metas, recurrentes, patrimonio basico, dashboard mensual y exportacion. Es una base mas razonable para estabilizar primero y mejorar despues por etapas.

La recomendacion es no copiar la app anterior completa. Conviene rescatar ideas concretas de funcionalidad y diseno, pero implementarlas con la arquitectura simple de la V2.

## Diferencias principales

 | Area | App anterior | V2 nueva | Evaluacion |
 | --- | --- | --- | --- |
 | Arquitectura | Web + Tauri + Docker + Redis + Celery + worker + beat + Caddy | Web local con Next.js, FastAPI y Postgres | V2 es mas mantenible y menos fragil |
 | Backend | Muchos modulos, observabilidad, rate limit, Redis, jobs | 17 modulos, ~85 endpoints, sin workers | V2 sacrifica automatizacion por estabilidad |
 | Frontend | UI mas pulida, Radix, Sonner, Framer Motion | UI terminal/Bloomberg, Command Palette | V2 tiene identidad clara, funcionalmente completa |
 | PDF | Parsers, preview, AI review, rollback, quality stats | 8 parsers, preview, rollback, quality stats, parser selector, CSV export | V2 cubre casi todo salvo AI review |
 | Dashboard | Resumen avanzado, tendencias, rangos, comparaciones | Summary con rangos (MTD/30d/YTD/12m), trends 12m, comparacion periodo anterior, recientes | V2 casi equivalente |
 | Patrimonio | Historial, tendencia por cuenta, comparacion, proyeccion | Historial, account-trend, comparacion (falta proyeccion) | V2 cubre 3/4 |
 | Seguridad | CSRF, rate limit, sesiones, admin, auditoria | Auth cookies, refresh, revocacion, auditoria local | V2 suficiente, faltan sesiones activas y rate limit |
 | Datos compartidos | Familias y cuentas compartidas | No incluido | No prioritario para app personal local |
 | IA/ML | ML local, Ollama/OpenAI, AI review | Coming Soon placeholder | No traer ML pesado; si se trae IA, hacerlo opcional |
 | Operacion | Backups, cloud, metrics, Sentry, Caddy | Docker simple + backup manual via pg_dump | V2 es mas facil de levantar |

## Matriz de funcionalidades

 | Funcionalidad | App anterior | V2 nueva | Estado recomendado |
 | --- | --- | --- | --- |
 | Login/logout | Si | Si | Mantener V2 |
 | Refresh token | Si | Si | Mantener V2 |
 | Registro | Si | Si backend | Mantener si se usa localmente |
 | Cambio de password | Si | No | Pendiente |
 | Sesiones activas | Si | No | Opcional |
 | Admin usuarios | Si | Coming Soon | Pendiente |
 | Cuentas | Si | Si | Mantener V2 |
 | Instituciones | Parcial | Si | Mantener V2 |
 | Categorias | Si | Si | Mantener V2 |
 | Tags | Si | Si | Mantener V2 |
 | Reglas | Si, mas expresivas | Si | Mejorar gradualmente |
 | Transacciones | Si | Si | Mantener V2 |
 | Filtros de transacciones | Si | Si | Revisar UX |
 | Edicion bulk | Si | Si | Mantener V2 |
 | Notas/flags | Si | Si | Mantener V2 |
 | Splits | Si | Si | Mantener V2 |
 | Export CSV | Si | Si | Mantener V2 |
 | Export Excel | Si | Si | Mantener V2 |
 | Importar PDF | Si | Si | Mantener V2 |
 | Preview de cartola | Si | Si | Mantener V2 |
 | Confirmar preview | Si | Si | Mantener V2 |
 | Editar filas de preview | Si | Si | Mantener V2 |
 | Detectar duplicados | Si | Si | Mantener V2 |
 | Listado de parsers disponibles | Si | Si | Mantener V2 |
 | Seleccion manual de parser | Si | Si | Mantener V2 |
 | Export CSV de preview | Si | Si | Mantener V2 |
 | Rollback de cartola | Si | Si | Mantener V2 |
 | Quality stats de parsers | Si | Si | Mantener V2 |
 | AI review de cartolas | Si | Coming Soon | Opcional, no prioritario |
 | Dashboard mensual | Si | Si | Mantener V2 |
 | Rangos MTD/30d/YTD/12m | Si | Si | Mantener V2 |
 | Tendencias 12 meses | Si | Si | Mantener V2 |
 | Comparacion periodo anterior | Si | Si | Mantener V2 |
 | Transacciones recientes en dashboard | Si | Si | Mantener V2 |
 | Presupuestos | Si | Si | Mantener V2 |
 | Alertas de presupuesto | Si | Parcial (alert_at_percent, sin notificacion automatica) | Mejorar despues |
 | Metas | Si | Si | Mantener V2 |
 | Depositos a metas | Si | Si | Mantener V2 |
 | Recurrentes | Si | Si | Mantener V2 |
 | Deteccion automatica de recurrentes | Si | Si (POST /recurring/detect) | Mantener V2 |
 | Proximos pagos recurrentes | Si | Si (GET /recurring/upcoming) | Mantener V2 |
 | Patrimonio resumen | Si | Si | Mantener V2 |
 | Patrimonio historial | Si | Si (GET /patrimonio/history) | Mantener V2 |
 | Tendencia por cuenta | Si | Si (GET /patrimonio/account-trend) | Mantener V2 |
 | Comparacion patrimonial | Si | Si (GET /patrimonio/compare) | Mantener V2 |
 | Proyeccion patrimonial | Si | No | Pendiente |
 | Reconciliacion | Si | Si (GET /reconciliation/summary + /alerts) | Mantener V2 |
 | Busqueda global | Si | Si (GET /search + CommandPalette Cmd+K) | Mantener V2 |
 | Auditoria | Si | Si (GET /audit + /audit/export.csv) | Mantener V2 |
 | Notificaciones | Si | No | Opcional |
 | Reporte anual | Si | Si (GET /reports/annual/{year} + CSV) | Mantener V2 |
 | Familias/cuentas compartidas | Si | No | No prioritario |
 | Backups desde UI | Si | No | Pendiente |
 | Cloud backup/providers | Si | No | No prioritario |
 | WebSocket progreso preview | Si | No | No necesario si parsing es rapido |
 | Tauri desktop | Si | No | No traer |
 | Celery/Redis/workers | Si | No | No traer por restriccion V1 |
 | ML scikit-learn | Si | No | No traer por restriccion V1 |

## Diseno y experiencia de usuario

### App anterior

La app anterior tenia un sistema visual llamado `Boveda`, con foco en una experiencia premium oscura:

- Fondo negro/near-black con acento mint.
- Sidebar fijo con secciones claras.
- Header por pantalla con breadcrumbs y controles contextuales.
- Cards mas refinadas, bordes suaves y mayor jerarquia visual.
- Dashboard con hero KPIs, tendencias, sparklines, categoria principal y actividad reciente.
- Patrimonio dividido en componentes ricos: hero, evolucion, composicion, proyeccion, tabla de cuentas y alertas.
- Componentes UI dedicados: dialogos, botones, inputs, empty states, confirm dialogs y toasts.
- Mejor manejo visual de loading, error y empty states.

Riesgo: el frontend anterior tambien arrastraba mas dependencias y mas complejidad visual, lo que aumenta costo de mantenimiento.

### V2 nueva

La V2 nueva tiene una identidad visual distinta, mas tipo terminal/Bloomberg:

- Fondo negro y navy.
- Tipografia monoespaciada.
- Acento naranja/amber.
- Layout compacto y denso.
- Sidebar agrupado por areas: resumen, movimientos, planificacion, taxonomia, analisis y sistema.
- Command palette integrado.
- Menos ornamento y menos componentes externos.

Riesgo mitigado: el dashboard y patrimonio ya alcanzaron paridad funcional con la app anterior en casi todo excepto proyeccion y alertas automaticas.

### Recomendacion visual

V2 ya implemento la mayoria de las mejoras sugeridas (KPIs vs periodo anterior, EmptyState, ConfirmButton, rangos, moneda, dashboard con jerarquia). Los puntos pendientes son pulir tablas y cabeceras, pero no es critico.

## Funcionalidades que no conviene traer completas

Estas partes explican parte de la complejidad de la app anterior y no deberian copiarse tal cual:

- Tauri o desktop wrapper.
- Celery, Redis, worker y beat.
- scikit-learn o entrenamiento ML local.
- Caddy y TLS automatico como requisito base.
- Backup service separado.
- Integraciones cloud complejas.
- WebSocket para todo si no hay necesidad real.
- Observabilidad pesada para una app local.

Si alguna de estas se necesita mas adelante, deberia entrar como etapa aislada y justificada.

## Estado de las prioridades

La mayoria de las prioridades originales ya fueron implementadas:

### Prioridad 1 (completado)
- Dashboard con rangos, tendencias, comparacion y recientes ✅
- Busqueda global (GET /search + CommandPalette Cmd+K) ✅
- /review con asignacion rapida, reglas sugeridas y aplicar reglas ✅
- Listado y seleccion manual de parsers ✅
- EmptyState y ConfirmButton components ✅

### Prioridad 2 (completado)
- Patrimonio: historial, tendencia por cuenta, comparacion ✅
- Rollback de cartolas ✅
- Export CSV de preview ✅
- Deteccion automatica de recurrentes ✅
- Proximos pagos recurrentes ✅

### Prioridad 3 (parcial)
- Reporte anual con CSV ✅
- Auditoria local con export CSV ✅
- Depositos/contribuciones a metas ✅
- Cambio de password ❌ Pendiente
- Sesiones activas ❌ Pendiente
- Backup manual desde UI ❌ Pendiente

### Prioridad 4: lo que aun falta implementar

1. **Proyeccion patrimonial** — regresion lineal simple sobre historial (existe en app anterior).
2. **Cambio de password** — endpoint + pagina settings (existe en app anterior).
3. **Sesiones activas** — listar y revocar sesiones desde UI (existe en app anterior, requiere Redis).
4. **Alertas de presupuesto automaticas** — chequeo programado + notificacion (existe en app anterior con Celery).
5. **Backup manual desde UI** — export ZIP de datos de usuario + import (existe en app anterior).
6. **Notificaciones** — modelo + listado + webhooks (Telegram/Discord/Slack) (existe en app anterior).
7. **Admin usuarios** — CRUD de usuarios desde panel admin (existe en app anterior).

### No prioritario (sin cambios)

1. Familias/cuentas compartidas.
2. Cloud backup/providers.
3. IA avanzada / ML local.
4. Workers separados.
5. Tauri.

## Roadmap actualizado

### Etapa 1 a 4: completadas

Todas las funcionalidades de las etapas 1 a 4 del roadmap original fueron implementadas:

- Dashboard con rangos, tendencias, comparacion y recientes ✅
- /review con reglas sugeridas ✅
- Patrimonio con historial, tendencia por cuenta y comparacion ✅
- Cartolas con parser selector, rollback, CSV export y quality stats ✅

### Etapa 5: parcial

- Auditoria local ✅ (con export CSV y filtros)
- Cambio de password ❌ Pendiente
- Sesiones activas ❌ Pendiente (requiere Redis o solucion alternativa)
- Backup manual desde UI ❌ Pendiente

### Etapa 6: lo que aun vale la pena agregar

Basado en lo que la app anterior tenia y V2 no:

1. **Proyeccion patrimonial** — regresion lineal simple sobre historial de patrimonio.
2. **Backup manual (ZIP export/import)** — exportar todas las entradas del usuario como ZIP JSON con opcion de importar.
3. **Cambio de password** — formulario en settings con verificacion de password actual.
4. **Notificaciones basicas** — alertas de presupuesto, resumen semanal, sin webhooks inicialmente.
5. **Admin usuarios** — CRUD basico desde panel admin (solo para admin users).
6. **Exchange rates** — tabla de tipos de cambio + consolidacion multi-moneda en dashboard/patrimonio.

## Conclusion

V2 ha alcanzado un nivel de madurez funcional alto: ~85% de las funcionalidades de la app anterior estan cubiertas sin la complejidad de Redis, Celery, workers o ML. Los proximos pasos deberian priorizar proyeccion patrimonial, backup, cambio de password y notificaciones basicas — todo sin Redis/Celery.
