"""Normalización de montos compartida entre parsers.

Antes cada parser duplicaba su propia conversión (`_amt`, `_to_int`, `_amount`).
Acá viven las dos variantes reales:

- `money_us`  → formatos US/USD: '$1,234.56', '(123.45)'=negativo, '-$5.00',
               '+$8.45', '12.34'. Coma = miles, punto = decimal.
- `money_clp` → formato chileno: '200.000' (punto = miles, sin decimales),
               respeta signo '-' (sobregiro). '$' opcional.

Ambas devuelven Decimal con signo y nunca lanzan para entradas vacías.
"""
from __future__ import annotations

from decimal import Decimal


def money_us(raw: str) -> Decimal:
    s = (raw or "").strip()
    negative = (s.startswith("(") and s.endswith(")")) or "-" in s
    s = s.translate(str.maketrans("", "", "()$+-, ")).strip()
    if not s:
        return Decimal("0")
    value = Decimal(s)
    return -value if negative else value


def money_clp(raw: str) -> Decimal:
    """Convierte string de monto chileno a Decimal.

    ADVERTENCIA: Elimina TODOS los puntos (separador de miles en CLP).
    Para CLP es correcto (no tiene decimales), pero NO usar con USD/EUR
    donde el punto es decimal. Para otras monedas usar money_us() o
    BaseParser._normalize_amount.
    """
    s = (raw or "").strip()
    negative = s.startswith("-")
    s = s.translate(str.maketrans("", "", "$-. ")).strip()
    if not s:
        return Decimal("0")
    value = Decimal(s)
    return -value if negative else value
