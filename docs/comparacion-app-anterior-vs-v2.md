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
| Backend | Muchos modulos, observabilidad, rate limit, Redis, jobs | Modulos principales sin workers | V2 sacrifica automatizacion por estabilidad |
| Frontend | UI mas pulida, mas componentes, Radix, Sonner, Framer Motion | UI terminal/Bloomberg mas simple | V2 tiene identidad clara, pero menos acabado por pantalla |
| PDF | Parsers, preview, AI review, rollback, quality stats | Parsers, preview, confirmacion, duplicados, reproceso | V2 cubre lo esencial, faltan herramientas avanzadas |
| Dashboard | Resumen avanzado, tendencias, rangos, comparaciones | Dashboard mensual simple | Alta oportunidad de mejora |
| Patrimonio | Historial, tendencia por cuenta, comparacion, proyeccion | Patrimonio basico | Alta oportunidad de mejora |
| Seguridad | CSRF, rate limit, sesiones, admin, auditoria | Auth con cookies, refresh y revocacion | V2 es suficiente localmente, faltan controles avanzados |
| Datos compartidos | Familias y cuentas compartidas | No incluido | No prioritario para app personal local |
| IA/ML | ML local, Ollama/OpenAI compatible, AI review | Pantallas placeholder/simple segun V2 | No traer ML pesado; si se trae IA, hacerlo opcional |
| Operacion | Backups, cloud providers, metrics, Sentry, Caddy | Docker simple | V2 es mas facil de levantar |

## Matriz de funcionalidades

| Funcionalidad | App anterior | V2 nueva | Estado recomendado |
| --- | --- | --- | --- |
| Login/logout | Si | Si | Mantener V2 |
| Refresh token | Si | Si | Mantener V2 |
| Registro | Si | Si backend | Mantener si se usa localmente |
| Cambio de password | Si | No detectado en V2 | Agregar despues |
| Sesiones activas | Si | No | Opcional |
| Admin usuarios | Si | Pantalla/admin basica o parcial | Rehacer simple si hace falta |
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
| Listado de parsers disponibles | Si | No detectado en V2 | Agregar |
| Seleccion manual de parser | Si | No detectado en V2 | Agregar si hay cartolas reales problematicas |
| Export CSV de preview | Si | No | Agregar |
| Rollback de cartola | Si | No | Agregar con cuidado |
| Quality stats de parsers | Si | No | Opcional |
| AI review de cartolas | Si | No/placeholder | Opcional, no prioritario |
| Dashboard mensual | Si | Si | Mejorar V2 |
| Rangos MTD/30d/YTD/12m | Si | No | Agregar |
| Tendencias 12 meses | Si | Parcial via transacciones | Agregar al dashboard |
| Comparacion periodo anterior | Si | No | Agregar |
| Transacciones recientes en dashboard | Si | No | Agregar |
| Presupuestos | Si | Si | Mantener V2 |
| Alertas de presupuesto | Si | Parcial | Mejorar despues |
| Metas | Si | Si | Mantener V2 |
| Depositos a metas | Si | No detectado en V2 | Agregar despues |
| Recurrentes | Si | Si | Mantener V2 |
| Deteccion automatica de recurrentes | Si | No | Agregar sin ML pesado |
| Proximos pagos recurrentes | Si | No | Agregar |
| Patrimonio resumen | Si | Si | Mejorar V2 |
| Patrimonio historial | Si | No | Agregar |
| Tendencia por cuenta | Si | No | Agregar |
| Comparacion patrimonial | Si | No | Agregar |
| Proyeccion patrimonial | Si | No | Agregar simple |
| Reconciliacion | Si | No | Agregar despues de cartolas estables |
| Busqueda global | Si | No | Agregar pronto |
| Auditoria | Si | No | Opcional localmente |
| Notificaciones | Si | No | Opcional |
| Reporte anual | Si | No | Agregar despues |
| Familias/cuentas compartidas | Si | No | No prioritario |
| Backups desde UI | Si | No | Opcional, mejor despues |
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

Riesgo: algunas pantallas se sienten mas funcionales que terminadas. El dashboard y patrimonio pueden verse simples frente a la app anterior.

### Recomendacion visual

No conviene mezclar ambos estilos completos. La V2 ya tiene una direccion clara. Conviene mantener el estilo terminal/Bloomberg y rescatar de la app anterior solo patrones de UX:

- Header consistente por pantalla.
- KPIs con comparacion contra periodo anterior.
- Estados de carga/error/vacio bien disenados.
- Componentes de tabla mas claros.
- Acciones principales visibles.
- Controles de rango y moneda persistentes.
- Dashboard con jerarquia visual mas fuerte.

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

## Prioridades recomendadas

### Prioridad 1: valor alto, riesgo bajo

1. Mejorar dashboard con rangos, tendencias, comparacion y recientes.
2. Agregar busqueda global simple.
3. Mejorar `/review` para categorizar movimientos pendientes y crear reglas sugeridas.
4. Agregar listado de parsers disponibles y seleccion manual al importar cartola.
5. Mejorar estados visuales de loading/error/empty en pantallas principales.

### Prioridad 2: valor alto, riesgo medio

1. Expandir patrimonio con historial, tendencia por cuenta y comparacion.
2. Agregar rollback de cartolas confirmadas.
3. Agregar export CSV de preview.
4. Agregar deteccion simple de recurrentes.
5. Agregar proximos pagos recurrentes.

### Prioridad 3: valor medio o uso especifico

1. Reporte anual.
2. Cambio de password y sesiones activas.
3. Auditoria local de cambios relevantes.
4. Backup manual desde UI.
5. Depositos/contribuciones a metas.

### No prioritario

1. Familias/cuentas compartidas.
2. Cloud backup/providers.
3. IA avanzada.
4. ML local.
5. Workers separados.
6. Tauri.

## Roadmap propuesto

### Etapa 1: dashboard util y confiable

Objetivo: que la pantalla principal vuelva a sentirse potente sin cambiar la arquitectura.

Cambios sugeridos:

- Endpoint `GET /v1/dashboard/summary` con rango `date_from`, `date_to` y `currency`.
- Endpoint `GET /v1/dashboard/trends` para 12 meses.
- Cards: ingresos, gastos, ahorro neto y tasa de ahorro.
- Comparacion contra periodo anterior.
- Top categorias.
- Ultimas transacciones.
- Selector de rango: este mes, ultimos 30 dias, ano a la fecha, 12 meses.

### Etapa 2: revision y reglas

Objetivo: acelerar la limpieza de movimientos sin categoria.

Cambios sugeridos:

- Pantalla `/review` con resumen de movimientos pendientes.
- Accion para asignar categoria rapido.
- Creacion de regla basada en descripcion/comercio.
- Boton para aplicar reglas pendientes.

### Etapa 3: patrimonio avanzado simple

Objetivo: recuperar lo mejor de la app anterior sin sobrecargar.

Cambios sugeridos:

- Historial mensual de patrimonio.
- Tendencia por cuenta.
- Comparacion contra N meses atras.
- Proyeccion lineal simple basada en historial.

### Etapa 4: cartolas mas controlables

Objetivo: que importar PDFs sea diagnosticable y reversible.

Cambios sugeridos:

- Listar parsers soportados.
- Permitir parser manual opcional.
- Exportar preview a CSV.
- Rollback de cartola confirmada.
- Mostrar estadisticas basicas de parseo.

### Etapa 5: mejoras operativas locales

Objetivo: mejorar seguridad y mantenimiento sin meter infraestructura pesada.

Cambios sugeridos:

- Cambio de password.
- Sesiones activas.
- Backup manual desde UI o comando documentado.
- Auditoria local acotada.

## Conclusion

La app anterior sirve como catalogo de ideas, no como base para copiar. La V2 nueva deberia mantenerse simple y estable, incorporando solo las funcionalidades que aportan valor directo.

El mejor primer paso es mejorar el dashboard, porque concentra la percepcion de calidad de la app y reutiliza datos que ya existen: transacciones, categorias, cuentas y presupuestos.
