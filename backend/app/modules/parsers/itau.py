"""Parser para cartolas de Itaú Chile.

Soporta los formatos reales:
  - Cuenta Corriente "Cartola Histórica" (multi-período): filas
    `DD/MM Nº-operación Descripción $cargo $abono $saldo`, fecha sin año
    (el año se infiere del bloque de período).
  - Tarjeta de Crédito "Estado de cuenta nacional/internacional" (multi-período):
    filas `DD/MM/YYYY opid Descripción $monto $monto NN/N $monto`.

Cada documento histórico se parte en segmentos de período (`raw_data["periods"]`)
para que el pipeline pueda crear un Statement por período.
"""
from __future__ import annotations

import re
from datetime import date

from app.modules.parsers.base import BaseParser, ParseResult

ITAU_STRONG_SIGNATURES = [
    "banco itaú", "banco itau", "itaú corpbanca", "itau corpbanca",
    "itaucorp", "itaú chile", "itau chile",
]
ITAU_TOKEN_RE = re.compile(r"\bita[uú]\b", re.IGNORECASE)
ITAU_FILENAME_RE = re.compile(r"(?:^|[_\-\s])ita[uú](?:[_\-\s]|$)", re.IGNORECASE)

_MESES_ES = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}

# CC: "Período : 25-Mar-2025 - 31-Mar-2025"
_CC_PERIOD_RE = re.compile(
    r"Per[ií]odo\s*:\s*(\d{2})-([A-Za-z]{3})-(\d{4})\s*-\s*(\d{2})-([A-Za-z]{3})-(\d{4})"
)
# CC movimiento: 31/03 450793073 Transferencia De Usuario $0 $10.000 $10.000
# El saldo puede ser negativo en sobregiro y el signo va ANTES del $ (-$189.536),
# por eso aceptamos un '-' opcional delante de cada $.
_CC_ROW_RE = re.compile(
    r"^(\d{2})/(\d{2})\s+(\d{6,})\s+(.+?)\s+-?\$([\d.]+)\s+-?\$([\d.]+)\s+-?\$([\d.]+)\s*$",
    re.MULTILINE,
)
_CC_SALDO_ANT_RE = re.compile(r"[Ss]aldo anterior[^$]*\$\s?(-?[\d.]+)")

# TC: "Período facturado 27/03/2025 24/04/2025"
_TC_PERIOD_RE = re.compile(
    r"Per[ií]odo facturado\s+(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})"
)
# TC movimiento: 29/03/2025 2025032910352463 Tiendas La Vinoteca $ 37.576 $ 37.576 01/1 $ 37.576
_TC_ROW_RE = re.compile(
    r"^(\d{2}/\d{2}/\d{4})\s+(\d{10,})\s+(.+?)\s+\$\s?(-?[\d.]+)\s+\$\s?-?[\d.]+",
    re.MULTILINE,
)


from app.modules.parsers.money import money_clp as _to_int  # CLP: puntos = miles, respeta signo


class ItauParser(BaseParser):
    key = "itau"
    display_name = "Itaú Chile"

    SUBFORMATS = [
        {"key": "cc_clp", "label": "Cuenta Corriente CLP"},
        {"key": "cc_usd", "label": "Cuenta Corriente USD"},
        {"key": "tc_clp", "label": "Tarjeta de Crédito CLP"},
        {"key": "tc_usd", "label": "Tarjeta de Crédito USD"},
    ]

    def subformats(self) -> list[dict[str, str]]:
        return list(self.SUBFORMATS)

    def negative_signatures(self) -> list[str]:
        return [
            "banco bice", "banco bci", "banco de chile", "banco santander",
            "scotiabank", "banco security", "banco falabella", "banco estado",
        ]

    def can_parse(self, content: bytes, filename: str, text: str = "") -> float:
        text_lower = text.lower()
        if ITAU_FILENAME_RE.search(filename.lower()):
            return 0.95
        if any(sig in text_lower for sig in ITAU_STRONG_SIGNATURES):
            return 0.9
        if ITAU_TOKEN_RE.search(text):
            return 0.6
        return 0.0

    def _subformat_label(self, key: str) -> str:
        return next((s["label"] for s in self.SUBFORMATS if s["key"] == key), key)

    def _detect_subformat(self, text: str) -> str:
        """Detección por marcadores ESTRUCTURALES (no por substring suelto).

        El boilerplate legal de una cuenta corriente puede mencionar "tarjeta de
        crédito"; por eso miramos los encabezados reales del documento.
        """
        tl = text.lower()
        is_tc = bool(
            _TC_PERIOD_RE.search(text)
            or "estado de cuenta nacional" in tl
            or "estado de cuenta internacional" in tl
            or ("cupo total" in tl and "cupo utilizado" in tl)
        )
        is_cc = bool(
            _CC_PERIOD_RE.search(text)
            or "cartola histórica cuenta corriente" in tl
            or "cartola historica cuenta corriente" in tl
            or "fecha nº operación movimientos" in tl
        )
        is_usd = "internacional" in tl or "dólar" in tl or "dolar" in tl
        if is_tc and not is_cc:
            return "tc_usd" if is_usd else "tc_clp"
        # Por defecto CC (las históricas de CC suelen mencionar TC en el legal).
        return "cc_usd" if (is_usd and not is_tc) else "cc_clp"

    # ── Bloques de período ───────────────────────────────────────────────────
    def _cc_period_blocks(self, text: str) -> list[dict]:
        """Parte el texto CC en bloques [inicio_offset, fin_offset) por período."""
        matches = list(_CC_PERIOD_RE.finditer(text))
        blocks = []
        for i, m in enumerate(matches):
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            d1, mo1, y1, d2, mo2, y2 = m.groups()
            try:
                ps = date(int(y1), _MESES_ES[mo1.lower()], int(d1))
                pe = date(int(y2), _MESES_ES[mo2.lower()], int(d2))
            except (KeyError, ValueError):
                continue
            blocks.append({"period_start": ps, "period_end": pe, "text": text[start:end]})
        return blocks

    def _tc_period_blocks(self, text: str) -> list[dict]:
        matches = list(_TC_PERIOD_RE.finditer(text))
        blocks = []
        for i, m in enumerate(matches):
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            ps = self._parse_clp_date(m.group(1))
            pe = self._parse_clp_date(m.group(2))
            blocks.append({"period_start": ps, "period_end": pe, "text": text[start:end]})
        return blocks

    def _cc_balances(self, block_text: str):
        """Saldo inicial/final del bloque CC. 'Saldo anterior' = último $ de la
        línea bajo su encabezado; 'Saldo final' = primer $ tras 'Resumen de
        Saldos'. Devuelve (opening, closing) como Decimal o None."""
        opening = closing = None
        lines = block_text.split("\n")
        for i, l in enumerate(lines):
            if "Saldo anterior cuenta corriente" in l and i + 1 < len(lines):
                amts = re.findall(r"\$(-?[\d.]+)", lines[i + 1])
                if amts:
                    opening = _to_int(amts[-1])
            if "Resumen de Saldos" in l:
                for j in range(i + 1, min(i + 4, len(lines))):
                    amts = re.findall(r"\$(-?[\d.]+)", lines[j])
                    if amts:
                        closing = _to_int(amts[0])
                        break
        return opening, closing

    # ── Extracción de transacciones por bloque ───────────────────────────────
    def _cc_transactions(self, block: dict, currency: str) -> list[dict]:
        year = block["period_start"].year if block["period_start"] else date.today().year
        month0 = block["period_start"].month if block["period_start"] else 1
        txs = []
        for m in _CC_ROW_RE.finditer(block["text"]):
            dd, mm, op, desc, cargo, abono, _saldo = m.groups()
            mo = int(mm)
            # Si el mes del movimiento es menor al del inicio del período, cruzó de año.
            yr = year + 1 if mo < month0 else year
            try:
                tx_date = date(yr, mo, int(dd))
            except ValueError:
                continue
            cargo_v, abono_v = _to_int(cargo), _to_int(abono)
            if cargo_v == 0 and abono_v == 0:
                continue
            is_credit = abono_v > 0
            amount = abono_v if is_credit else cargo_v
            desc = desc.strip()
            txs.append({
                "date": tx_date,
                "original_description": desc,
                "normalized_description": desc,
                "amount": amount,
                "currency": currency,
                "movement_type": "credit" if is_credit else "debit",
                "reference_number": op,
                "raw_data": {"raw_line": m.group(0).strip()},
            })
        return txs

    def _tc_transactions(self, block: dict, currency: str) -> list[dict]:
        txs = []
        for m in _TC_ROW_RE.finditer(block["text"]):
            d, op, desc, amount_raw = m.groups()
            tx_date = self._parse_clp_date(d)
            if not tx_date:
                continue
            neg = amount_raw.startswith("-")
            amount = _to_int(amount_raw.lstrip("-"))
            if amount == 0:
                continue
            desc = desc.strip()
            # En TC, un monto negativo (cashback/abono) es crédito; el resto, débito (compra).
            is_credit = neg
            txs.append({
                "date": tx_date,
                "original_description": desc,
                "normalized_description": desc,
                "amount": amount,
                "currency": currency,
                "movement_type": "credit" if is_credit else "debit",
                "reference_number": op,
                "raw_data": {"raw_line": m.group(0).strip()},
            })
        return txs

    def parse(
        self,
        content: bytes,
        text: str,
        statement,
        subformat_hint: str | None = None,
    ) -> ParseResult:
        subformat = subformat_hint or self._detect_subformat(text)
        label = self._subformat_label(subformat)
        currency = "USD" if subformat.endswith("_usd") else "CLP"
        is_tc = subformat.startswith("tc")

        result = ParseResult(
            bank_detected=f"Itaú Chile — {label}",
            subformat=subformat,
            subformat_label=label,
            is_liability=is_tc,  # TC = pasivo
        )
        result.raw_data = {"parser": self.key, "subformat": subformat}
        if subformat_hint:
            result.raw_data["subformat_forced"] = True

        blocks = self._tc_period_blocks(text) if is_tc else self._cc_period_blocks(text)
        period_segments: list[dict] = []
        all_txs: list[dict] = []

        for blk in blocks:
            txs = self._tc_transactions(blk, currency) if is_tc else self._cc_transactions(blk, currency)
            credit = sum(t["amount"] for t in txs if t["movement_type"] == "credit")
            debit = sum(t["amount"] for t in txs if t["movement_type"] == "debit")
            # Saldos por período (solo CC; el TC es pasivo con formato de cupo).
            opening, closing = (None, None) if is_tc else self._cc_balances(blk["text"])
            seg = {
                "period_start": blk["period_start"].isoformat() if blk["period_start"] else None,
                "period_end": blk["period_end"].isoformat() if blk["period_end"] else None,
                "tx_count": len(txs),
                "total_credit": str(credit),
                "total_debit": str(debit),
                "opening_balance": str(opening) if opening is not None else None,
                "closing_balance": str(closing) if closing is not None else None,
                "transactions": txs,
            }
            period_segments.append(seg)
            all_txs.extend(txs)

        # El saldo final de un mes == saldo inicial del siguiente. Si no se pudo
        # extraer el closing de un bloque, lo derivamos del opening del próximo
        # (el "chain" de saldos es consistente en las cartolas Itaú).
        for i in range(len(period_segments) - 1):
            if period_segments[i].get("closing_balance") is None:
                nxt_open = period_segments[i + 1].get("opening_balance")
                if nxt_open is not None:
                    period_segments[i]["closing_balance"] = nxt_open

        # Resultado consolidado (preview muestra todo el histórico).
        result.transactions = all_txs
        if period_segments:
            result.period_start = blocks[0]["period_start"]
            result.period_end = blocks[-1]["period_end"]
            result.total_credit = sum(t["amount"] for t in all_txs if t["movement_type"] == "credit")
            result.total_debit = sum(t["amount"] for t in all_txs if t["movement_type"] == "debit")
        # Resumen serializable de períodos (sin transacciones) para raw_data/JSONB.
        result.raw_data["periods"] = [
            {k: v for k, v in s.items() if k != "transactions"} for s in period_segments
        ]
        result.raw_data["multi_period"] = len(period_segments) > 1
        # Segmentos completos (con transacciones) — en memoria, no se serializan.
        result.multi_period = len(period_segments) > 1
        result.period_segments = period_segments

        if not all_txs:
            result.warnings.append("No se extrajeron movimientos del documento Itaú.")
        return result
