"""Parser para cartolas de UglyCash (eUSD stablecoin wallet).

Formato real: RESUMEN MENSUAL UGLYCASH — RESUMEN DE CUENTA — MAY 2025
  - Moneda: USD (eUSD stablecoin, no CLP)
  - Filas delimitadas por "|": Fecha | Descripción | Monto
  - Fecha "--" = sin fecha específica (recompensas acumuladas)
  - Montos con prefijo "+$" o "-$"
"""
import re

from app.modules.parsers.base import BaseParser, ParseResult

_ENGLISH_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


class UglyCashParser(BaseParser):
    key = "ugly_cash"
    display_name = "UglyCash"

    def can_parse(self, content: bytes, filename: str, text: str = "") -> float:
        text_lower = text.lower()
        if "resumen mensual uglycash" in text_lower or "uglycash" in text_lower:
            return 0.95
        if "ugly cash" in text_lower or "uglycash" in filename.lower():
            return 0.9
        return 0.0

    def parse(self, content: bytes, text: str, statement, subformat_hint: str | None = None) -> ParseResult:
        result = ParseResult(bank_detected="UglyCash")
        result.raw_data = {"parser": self.key}

        # Período: "RESUMEN DE CUENTA — MAY 2025"
        period_m = re.search(
            r"RESUMEN DE CUENTA\s*[—\-]\s*(\w+)\s+(\d{4})",
            text, re.IGNORECASE,
        )
        if period_m:
            month_name = period_m.group(1).strip().lower()
            year = int(period_m.group(2))
            month_num = _ENGLISH_MONTHS.get(month_name)
            if month_num:
                import calendar as cal
                from datetime import date
                last_day = cal.monthrange(year, month_num)[1]
                result.period_start = date(year, month_num, 1)
                result.period_end = date(year, month_num, last_day)

        # Balance inicial: "Balance al 1/5  $0.00"
        bal_ini_m = re.search(r"Balance al\s+\d+/\d+\s+\$([\d.]+)", text, re.IGNORECASE)
        if bal_ini_m:
            try:
                result.opening_balance = self._normalize_amount(bal_ini_m.group(1))
            except Exception:
                pass

        # Balance final: "Balance Final $8.47"
        bal_fin_m = re.search(r"Balance Final\s+\$([\d.]+)", text, re.IGNORECASE)
        if bal_fin_m:
            try:
                result.closing_balance = self._normalize_amount(bal_fin_m.group(1))
            except Exception:
                pass

        # Totales: "Créditos +$1109.70" / "Débitos -$1110.00"
        creditos_m = re.search(r"Cr[ée]ditos\s+\+?\$?([\d.]+)", text, re.IGNORECASE)
        if creditos_m:
            try:
                result.total_credit = self._normalize_amount(creditos_m.group(1))
            except Exception:
                pass
        debitos_m = re.search(r"D[ée]bitos\s+-?\$?([\d.]+)", text, re.IGNORECASE)
        if debitos_m:
            try:
                result.total_debit = abs(self._normalize_amount(debitos_m.group(1)))
            except Exception:
                pass

        # Transacciones (formato real, separado por espacios):
        #   02/02/2026 USDC ERC20 Deposit z7hfn7wn +$159.19
        #   06/02/2026 Transferencia Internacional ACH kaby9hr7 -$411.00
        # El signo +/- antes del $ indica crédito/débito.
        tx_pattern = re.compile(
            r"^(\d{2}/\d{2}/\d{4})\s+(.+?)\s+([+-])\$([\d.,]+)\s*$",
            re.MULTILINE,
        )
        for m in tx_pattern.finditer(text):
            tx_date = self._parse_clp_date(m.group(1))
            desc = m.group(2).strip()
            sign = m.group(3)
            if not tx_date or len(desc) < 2:
                continue
            try:
                amount = abs(self._normalize_amount(m.group(4)))
            except Exception:
                continue
            if amount == 0:
                continue
            result.transactions.append({
                "date": tx_date,
                "original_description": desc,
                "normalized_description": desc,
                "amount": amount,
                "currency": "USD",
                "movement_type": "credit" if sign == "+" else "debit",
                "raw_data": {"raw_line": m.group(0).strip()},
            })

        return result
