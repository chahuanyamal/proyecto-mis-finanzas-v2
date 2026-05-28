"""Parser para estados de cuenta de TD Bank (USA).

Formato real (pdfplumber colapsa los espacios del PDF de TD):
  - Período: "StatementPeriod: Jan242026-Feb232026" (mes en inglés, sin espacios)
  - Fechas de movimiento: MM/DD (formato EE.UU., sin año → se infiere del período)
  - Secciones determinan movement_type (texto SIN espacios):
      "ElectronicDeposits" / "OtherCredits"  → credit
      "ElectronicPayments" / "ChecksPaid"    → debit
  - Anclas: BeginningBalance, EndingBalance, ElectronicDeposits (total créditos),
    ElectronicPayments + ServiceCharges (total débitos)
  - Moneda: USD
"""
import re
from datetime import date, datetime

from app.modules.parsers.base import BaseParser, ParseResult

# Firmas ESTRUCTURALES de un estado TD real. Evitamos el substring suelto
# "tdbank" porque aparece en descripciones de transferencias en cartolas de
# OTROS bancos (p.ej. un MoneyLink "tfr tdbank national" en un estado Schwab).
TD_SIGNATURES = ["td bank", "tdbank.com", "tdbank,n.a", "tdbeyondchecking", "toronto-dominion"]

# Comparadas contra la línea SIN espacios y en minúsculas.
_CREDIT_SECTIONS = {"electronicdeposits", "othercredits", "otherdeposits"}
_DEBIT_SECTIONS = {"electronicpayments", "checkspaid", "otherdebits", "servicecharges"}
# OJO: "How to Balance" es boilerplate intercalado en página 2; las secciones de
# actividad CONTINÚAN en página 3, así que NO debe detener el parseo. El corte
# real es el resumen de saldos diarios.
_STOP_SECTIONS = {"dailybalancesummary", "dailyaccountactivitysummary"}

_AMOUNT = r"([\d,]+\.\d{2})"
_ROW_RE = re.compile(r"^(\d{2}/\d{2})\s+(.+?)\s+" + _AMOUNT + r"$")
_PERIOD_RE = re.compile(
    r"StatementPeriod:\s*([A-Za-z]{3})(\d{1,2})(\d{4})\s*[-–]\s*([A-Za-z]{3})(\d{1,2})(\d{4})",
    re.IGNORECASE,
)
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


from app.modules.parsers.money import money_us as _amt  # US: comas miles, decimales


def _mk_date(mon: str, day: str, year: str):
    m = _MONTHS.get(mon.lower())
    if not m:
        return None
    try:
        return date(int(year), m, int(day))
    except ValueError:
        return None


class TdBankParser(BaseParser):
    key = "td_bank"
    display_name = "TD Bank"

    def can_parse(self, content: bytes, filename: str, text: str = "") -> float:
        tl = text.lower()
        if any(sig in tl for sig in TD_SIGNATURES):
            return 0.95
        if "td" in filename.lower() and "bank" in filename.lower():
            return 0.7
        return 0.0

    def parse(self, content: bytes, text: str, statement, subformat_hint: str | None = None) -> ParseResult:
        result = ParseResult(bank_detected="TD Bank")
        result.raw_data = {"parser": self.key}

        # ── Período (formato colapsado "Jan242026-Feb232026") ──
        pm = _PERIOD_RE.search(text)
        year_start = year_end = datetime.now().year
        if pm:
            ps = _mk_date(pm.group(1), pm.group(2), pm.group(3))
            pe = _mk_date(pm.group(4), pm.group(5), pm.group(6))
            result.period_start, result.period_end = ps, pe
            if ps:
                year_start = ps.year
            if pe:
                year_end = pe.year

        # ── Anclas de saldo y totales ──
        def _find(pattern):
            m = re.search(pattern + r"\s+" + _AMOUNT, text, re.IGNORECASE)
            return _amt(m.group(1)) if m else None

        result.opening_balance = _find(r"BeginningBalance")
        result.closing_balance = _find(r"EndingBalance")
        total_credit = _find(r"ElectronicDeposits")
        total_debit = _find(r"ElectronicPayments")
        service_charges = _find(r"ServiceCharges")
        if total_credit is not None:
            result.total_credit = total_credit
        if total_debit is not None:
            result.total_debit = total_debit + (service_charges or 0)

        ps_month = result.period_start.month if result.period_start else 1

        # ── Movimientos por sección ──
        current_movement = None
        stop = False
        for line in text.split("\n"):
            s = line.strip()
            if not s:
                continue
            collapsed = re.sub(r"\s+", "", s).lower()

            if any(k in collapsed for k in _STOP_SECTIONS):
                stop = True
            if stop:
                continue

            # Encabezado de sección (línea sin monto que nombra la sección).
            row_match = _ROW_RE.match(s)
            if not row_match:
                if any(collapsed.startswith(k) for k in _CREDIT_SECTIONS):
                    current_movement = "credit"
                elif any(collapsed.startswith(k) for k in _DEBIT_SECTIONS):
                    current_movement = "debit"
                continue

            if current_movement is None:
                continue  # filas antes de cualquier sección (no debería pasar)

            mm = int(row_match.group(1)[:2])
            year = year_start if mm >= ps_month else year_end
            tx_date = self._parse_us_date(row_match.group(1), year)
            if not tx_date:
                continue
            desc = row_match.group(2).strip()
            try:
                amount = _amt(row_match.group(3))
            except Exception:
                continue
            if amount == 0 or len(desc) < 2:
                continue
            result.transactions.append({
                "date": tx_date,
                "original_description": desc,
                "normalized_description": desc,
                "amount": amount,
                "currency": "USD",
                "movement_type": current_movement,
                "raw_data": {"raw_line": s},
            })

        if not result.transactions:
            result.warnings.append("No se extrajeron movimientos del estado TD Bank.")
        return result
