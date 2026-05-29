# Validación de Cartolas Reales

Checklist para ajustar parsers con PDFs reales sin guardar datos sensibles en el repo.

## Flujo recomendado

1. Crear una copia anonimizada del PDF o extraer solo texto sin datos personales.
2. Validar detección automática y, si falla, forzar parser desde la UI de `Cartolas`.
3. Revisar preview: fechas, descripción, monto, tipo de movimiento y cantidad total de filas.
4. Confirmar que `opening_balance` y `closing_balance` aparezcan en el detalle de calidad cuando el banco los informe.
5. Confirmar reconciliación: `opening_balance + ingresos - gastos = closing_balance` para cuentas de activo.
6. Registrar cualquier patrón fallido como fixture sintético en tests, no como PDF real con datos privados.

## Bancos priorizados

- Itaú cuenta corriente: columnas cargo/abono/saldo y saldos por período.
- BICE cuenta corriente: resumen de saldos y movimientos.
- BICE tarjeta nacional/internacional: deuda/saldo informativo, revisar eje contable antes de reconciliar.
- Prex/UglyCash: montos firmados y saldos inicial/final si aparecen en texto.
- TD Bank, Schwab, Alpaca: validar formato USD y cuentas de inversión sin reconciliación bancaria estricta.

## Criterios de aceptación

- Parser detectado correctamente o parser forzado funciona.
- Preview no importa encabezados/pies como movimientos.
- Montos negativos/positivos se mapean a `expense`/`income` correctamente.
- Fechas quedan en ISO `YYYY-MM-DD`.
- Saldos inicial/final se extraen cuando existen.
- Reconciliación usa base `statement` cuando hay saldos de cartola.
