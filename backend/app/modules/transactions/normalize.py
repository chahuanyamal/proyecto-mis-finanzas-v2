"""Normalización de descripciones bancarias → nombre de comercio legible.

Convierte strings ruidosos del banco (p. ej. "COMPRA WEBPAY 003481 UBER")
en un nombre mostrable ("Uber"), sin depender de servicios externos.
"""
from __future__ import annotations

import re

# Palabras de relleno típicas de glosas bancarias chilenas que no aportan al
# nombre del comercio.
_NOISE = {
    "compra", "compras", "webpay", "redcompra", "pago", "pagos", "pat", "pac",
    "transferencia", "transf", "tef", "giro", "cargo", "abono", "deposito",
    "nacional", "internacional", "tarjeta", "tar", "debito", "credito", "deb",
    "cred", "suscripcion", "suscripción", "mensual", "online", "web", "app",
    "comercio", "servicio", "servicios", "cl", "chile", "spa", "ltda", "sa",
    "eirl", "de", "del", "la", "el", "los", "las", "a", "por", "en", "tx",
    "n", "nro", "no", "ref", "aut", "cod",
}

_TOKEN_RE = re.compile(r"[^a-záéíóúñü0-9]+", re.IGNORECASE)


def _is_codeish(token: str) -> bool:
    """True si el token parece un código/ID (tiene dígitos o es muy largo sin vocales)."""
    if any(ch.isdigit() for ch in token):
        return True
    if len(token) >= 12 and not re.search(r"[aeiouáéíóú]", token):
        return True
    return False


def normalize_merchant(description: str | None) -> str:
    """Devuelve un nombre de comercio legible a partir de la glosa bancaria."""
    if not description:
        return ""
    raw = description.strip()
    tokens = [t for t in _TOKEN_RE.split(raw.lower()) if t]
    kept: list[str] = []
    for tok in tokens:
        if _is_codeish(tok):
            continue
        if tok in _NOISE:
            continue
        if len(tok) <= 1:
            continue
        kept.append(tok)
    # Se queda con los primeros 3 tokens significativos.
    meaningful = kept[:3]
    if not meaningful:
        # Fallback: glosa original recortada y capitalizada.
        return raw[:40].title()
    return " ".join(w.capitalize() for w in meaningful)
