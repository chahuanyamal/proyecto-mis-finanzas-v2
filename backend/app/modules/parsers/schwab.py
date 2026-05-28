"""Parser para estados de cuenta de Charles Schwab (brokerage, USA).

Cuenta de inversión: extrae flujos de caja (Deposit/Withdrawal/Dividend/Interest)
y trades (Purchase/Sale). El saldo cambia por apreciación de mercado, así que
NO se reconcilia como una cuenta bancaria (is_investment=True).

pdfplumber colapsa los espacios. Filas reales (sección "Transaction Detail"):
  09/03 Purchase LCID LUCIDGROUPINC 3.0000 18.9000 (56.70)
  09/05 Deposit MoneyLinkTxn TfrTDBANKNATIONALA,USUARIO 300.00
El monto de CAJA es el último número con 2 decimales (qty/price traen 4);
paréntesis = salida de caja.
"""
import re
from datetime import date

from app.modules.parsers.base import BaseParser, ParseResult

_CREDIT_TYPES = {"deposit", "sale", "sell", "dividend", "interest", "journal", "credit"}
_DEBIT_TYPES = {"purchase", "buy", "withdrawal", "fee", "debit"}

_MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], 1)}

# Período como valor: "September1-30,2025" (la etiqueta "StatementPeriod" suele
# estar en otra línea por el colapso de pdfplumber, así que matcheamos el rango).
_PERIOD_RE = re.compile(
    r"([A-Za-z]{3,9})\s*(\d{1,2})\s*-\s*(\d{1,2})\s*,\s*(\d{4})",
)
# Fila: fecha, tipo, ...descripción..., monto de caja (2 decimales, opcional paréntesis/$).
_ROW_RE = re.compile(
    r"^(\d{2}/\d{2})\s+([A-Za-z][A-Za-z/]*)\s+(.+?)\s+(\(?\$?[\d,]+\.\d{2}\)?)\s*$"
)


from app.modules.parsers.money import money_us as _amt  # US: $, comas, paréntesis=neg


class SchwabParser(BaseParser):
    key = "schwab"
    display_name = "Charles Schwab"

    def negative_signatures(self) -> list[str]:
        return ["alpaca securities", "uglycash"]

    def can_parse(self, content: bytes, filename: str, text: str = "") -> float:
        tl = text.lower()
        if "charles schwab" in tl or "schwab one" in tl or "schwab.com" in tl:
            return 0.96
        if "schwab" in tl or "schwab" in filename.lower():
            return 0.85
        return 0.0

    def parse(self, content: bytes, text: str, statement, subformat_hint: str | None = None) -> ParseResult:
        result = ParseResult(bank_detected="Charles Schwab", is_investment=True)
        result.raw_data = {"parser": self.key}

        year = date.today().year
        pm = _PERIOD_RE.search(text)
        if pm:
            mon = _MONTHS.get(pm.group(1).lower())
            year = int(pm.group(4))
            if mon:
                try:
                    result.period_start = date(year, mon, int(pm.group(2)))
                    result.period_end = date(year, mon, int(pm.group(3)))
                except ValueError:
                    pass

        # Valores de cuenta (para mostrar como saldos; no se reconcilian).
        bm = re.search(r"BeginningAccountValue\D*\$?([\d,]+\.\d{2})", text, re.IGNORECASE)
        em = re.search(r"EndingAccountValue\D*\$?([\d,]+\.\d{2})", text, re.IGNORECASE)
        if bm:
            result.opening_balance = _amt(bm.group(1))
        if em:
            result.closing_balance = _amt(em.group(1))

        for line in text.split("\n"):
            m = _ROW_RE.match(line.strip())
            if not m:
                continue
            tx_date = self._parse_us_date(m.group(1), year)
            if not tx_date:
                continue
            ttype = m.group(2).strip().lower()
            desc = m.group(3).strip()
            try:
                cash = _amt(m.group(4))
            except Exception:
                continue
            if cash == 0:
                continue
            # Dirección: paréntesis (negativo) = salida; si no, por tipo.
            if cash < 0:
                movement = "debit"
            elif any(t in ttype for t in _CREDIT_TYPES):
                movement = "credit"
            elif any(t in ttype for t in _DEBIT_TYPES):
                movement = "debit"
            else:
                movement = "credit"
            result.transactions.append({
                "date": tx_date,
                "original_description": f"{m.group(2).strip()} {desc}".strip(),
                "normalized_description": desc,
                "amount": abs(cash),
                "currency": "USD",
                "movement_type": movement,
                "raw_data": {"type": m.group(2).strip(), "raw_line": line.strip()},
            })

        if not result.transactions:
            result.warnings.append("Sin movimientos de caja/trades en el período (cuenta de inversión).")
        return result
