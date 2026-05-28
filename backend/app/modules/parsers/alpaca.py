"""Parser para estados mensuales de Alpaca Markets (brokerage, USD).

Cuenta de inversión (is_investment): extrae flujos de caja y trades. El saldo
cambia por mercado, así que no se reconcilia crédito/débito.

Secciones (cada una con filas MM/DD/YYYY):
  - Income:               fecha tipo símbolo descripción $NetAmt        (crédito)
  - Fees:                 fecha descripción $NetAmt                       (débito)
  - Transaction:          fecha "Trade Entry" side símbolo desc qty price $Amount $Comm (trade)
  - Deposit & Withdrawals: fecha "Journal..." descripción ±$NetAmt cuenta (cashflow)
Las filas "High-Yield Cash Sweep" son movimientos internos → se omiten.
"""
import calendar
import re
from datetime import date, datetime

from app.modules.parsers.base import BaseParser, ParseResult

_MONTHS = {m.upper(): i for i, m in enumerate(
    ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY",
     "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"], 1)}

_PERIOD_RE = re.compile(r"Statement Period:\s*([A-Z]+)\s*-\s*(\d{4})", re.IGNORECASE)
_DATE_RE = re.compile(r"^(\d{2}/\d{2}/\d{4})\b")
_AMT_RE = re.compile(r"([+-]?)\$\s?([\d,]+\.\d{2})")

_SECTIONS = {
    "income": "income",
    "fees": "fees",
    "transaction": "transaction",
    "deposit & withdrawals": "deposit",
    "deposits & withdrawals": "deposit",
}


class AlpacaParser(BaseParser):
    key = "alpaca"
    display_name = "Alpaca Markets"

    def negative_signatures(self) -> list[str]:
        return ["charles schwab", "schwab one", "td bank"]

    def can_parse(self, content: bytes, filename: str, text: str = "") -> float:
        tl = text.lower()
        if "alpaca securities" in tl or "alpaca markets" in tl:
            return 0.95
        if "alpaca" in tl or "alpaca" in filename.lower():
            return 0.8
        return 0.0

    def _amount(self, raw_with_sign: tuple[str, str]):
        from app.modules.parsers.money import money_us
        sign, num = raw_with_sign
        return money_us(f"{sign}{num}")

    def parse(self, content: bytes, text: str, statement, subformat_hint: str | None = None) -> ParseResult:
        result = ParseResult(bank_detected="Alpaca Markets", is_investment=True)
        result.raw_data = {"parser": self.key}

        pm = _PERIOD_RE.search(text)
        year = date.today().year
        if pm:
            mon = _MONTHS.get(pm.group(1).upper())
            year = int(pm.group(2))
            if mon:
                result.period_start = date(year, mon, 1)
                result.period_end = date(year, mon, calendar.monthrange(year, mon)[1])

        # Valores de cuenta (Cash Summary): Beginning Balance / Ending Value.
        bm = re.search(r"Beginning Balance\s+\$([\d,]+\.\d{2})", text, re.IGNORECASE)
        em = re.search(r"Ending Value\s+\$([\d,]+\.\d{2})", text, re.IGNORECASE)
        if bm:
            result.opening_balance = self._amount(("", bm.group(1)))
        if em:
            result.closing_balance = self._amount(("", em.group(1)))

        section = None
        for line in text.split("\n"):
            s = line.strip()
            if not s:
                continue
            low = s.lower()
            # Cambio de sección (líneas de encabezado sin fecha).
            if not _DATE_RE.match(s):
                for key, val in _SECTIONS.items():
                    if low == key or low.startswith(key + " "):
                        section = val
                        break
                continue
            if section is None:
                continue
            if "cash sweep" in low:  # movimiento interno, no cashflow real
                continue

            try:
                tx_date = datetime.strptime(_DATE_RE.match(s).group(1), "%m/%d/%Y").date()
            except ValueError:
                continue
            amts = [(sg, n) for sg, n in _AMT_RE.findall(s)]
            if not amts:
                continue

            if section == "transaction":
                # Layout: ... qty price $Amount $Commission → Amount = penúltimo $.
                cash = self._amount(amts[-2]) if len(amts) >= 2 else self._amount(amts[-1])
            elif section == "deposit":
                # ... ±$NetAmt cuenta → el NetAmt es el primer (único) $ con signo.
                cash = self._amount(amts[0])
            else:  # income / fees → NetAmt es el último $
                cash = self._amount(amts[-1])

            if cash == 0:
                continue
            if section == "fees":
                movement = "debit"
            elif section == "income":
                movement = "credit"
            else:
                movement = "debit" if cash < 0 else "credit"

            # Descripción: quitar la fecha del inicio.
            desc = s[len(_DATE_RE.match(s).group(1)):].strip()
            desc = re.sub(r"\s+\$.*$", "", desc).strip() or desc
            result.transactions.append({
                "date": tx_date,
                "original_description": desc[:200],
                "normalized_description": desc[:200],
                "amount": abs(cash),
                "currency": "USD",
                "movement_type": movement,
                "raw_data": {"section": section, "raw_line": s[:300]},
            })

        if not result.transactions:
            result.warnings.append("Sin movimientos en el período (cuenta de inversión).")
        return result
