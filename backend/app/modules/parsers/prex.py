"""Parser para cartolas de Prex Chile (wallet digital, Pesos chilenos).

Formato real: CARTOLA MENSUAL DE MOVIMIENTOS — PREX CHILE S.A.
  - Moneda: Pesos chilenos (CLP)
  - Columnas: Fecha | Descripción | Tipo de Cambio | Entradas | Salidas
  - Celda vacía representada con "-"
"""
import re
from decimal import Decimal

from app.modules.parsers.base import BaseParser, ParseResult


class PrexParser(BaseParser):
    key = "prex"
    display_name = "Prex"

    def can_parse(self, content: bytes, filename: str, text: str = "") -> float:
        text_lower = text.lower()
        if "prex chile" in text_lower or "cartola mensual de movimientos" in text_lower:
            return 0.95
        if "prex" in text_lower or "prex" in filename.lower():
            return 0.85
        return 0.0

    def parse(self, content: bytes, text: str, statement, subformat_hint: str | None = None) -> ParseResult:
        result = ParseResult(bank_detected="Prex")
        result.raw_data = {"parser": self.key}

        # Moneda desde el texto (puede ser "Pesos chilenos" u otra)
        currency = "CLP"
        moneda_m = re.search(r"Moneda:\s*(.+)", text, re.IGNORECASE)
        if moneda_m:
            moneda_str = moneda_m.group(1).strip().lower()
            if "dólar" in moneda_str or "dollar" in moneda_str or "usd" in moneda_str:
                currency = "USD"

        result.raw_data["currency_detected"] = currency

        # Período: "Desde 01/02/2026 Hasta 28/02/2026"
        period_m = re.search(
            r"Desde\s+(\d{2}/\d{2}/\d{4})\s+Hasta\s+(\d{2}/\d{2}/\d{4})",
            text, re.IGNORECASE,
        )
        if period_m:
            result.period_start = self._parse_clp_date(period_m.group(1))
            result.period_end = self._parse_clp_date(period_m.group(2))

        # Totales
        tot_entradas = re.search(r"Total Entradas\s+([\d.]+)", text, re.IGNORECASE)
        tot_salidas = re.search(r"Total Salidas\s+([\d.]+)", text, re.IGNORECASE)
        if tot_entradas:
            try:
                result.total_credit = self._normalize_amount(tot_entradas.group(1))
            except Exception:
                pass
        if tot_salidas:
            try:
                result.total_debit = self._normalize_amount(tot_salidas.group(1))
            except Exception:
                pass

        # Transacciones: columnas Fecha | Descripción | Tipo de Cambio | Entradas | Salidas
        # Celda vacía = "-", montos con punto-miles ej: "5.000", "105.000"
        tx_pattern = re.compile(
            r"(\d{2}/\d{2}/\d{4})\s+"   # fecha
            r"(.+?)\s+"                  # descripción (lazy)
            r"-\s+"                      # tipo de cambio (siempre "-" en CLP)
            r"([\d.]+|-)\s+"            # Entradas
            r"([\d.]+|-)",              # Salidas
            re.MULTILINE,
        )
        for m in tx_pattern.finditer(text):
            tx_date = self._parse_clp_date(m.group(1))
            if not tx_date:
                continue
            desc = m.group(2).strip()
            if not desc or len(desc) < 3:
                continue

            entradas_raw = m.group(3)
            salidas_raw = m.group(4)

            entradas = Decimal("0")
            salidas = Decimal("0")

            if entradas_raw != "-":
                try:
                    entradas = self._normalize_amount(entradas_raw)
                except Exception:
                    pass

            if salidas_raw != "-":
                try:
                    salidas = self._normalize_amount(salidas_raw)
                except Exception:
                    pass

            if entradas == 0 and salidas == 0:
                continue

            if entradas > 0:
                amount = entradas
                movement_type = "credit"
            else:
                amount = salidas
                movement_type = "debit"

            result.transactions.append({
                "date": tx_date,
                "original_description": desc,
                "normalized_description": desc,
                "amount": amount,
                "currency": currency,
                "movement_type": movement_type,
                "raw_data": {},
            })

        return result
