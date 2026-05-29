"""Interfaz abstracta para todos los parsers de cartolas bancarias."""
import io
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import TypedDict

from app.core.logging import get_logger

logger = get_logger(__name__)


class TransactionDict(TypedDict, total=False):
    date: date
    description: str
    amount: Decimal
    movement_type: str
    currency: str
    balance: Decimal | None
    raw_description: str
    reference: str


class RawDataDict(TypedDict, total=False):
    bank: str
    filename: str
    page_count: int
    extraction_method: str
    text_length: int
    tables_found: int


class PeriodSegmentDict(TypedDict, total=False):
    period_start: date
    period_end: date
    transactions: list[TransactionDict]
    total_credit: Decimal
    total_debit: Decimal
    opening_balance: Decimal | None
    closing_balance: Decimal | None


class FingerprintDict(TypedDict, total=False):
    producer: str
    creator: str
    page_count: int
    first_page_table_count: int
    first_page_word_count: int
    has_images: bool


@dataclass
class ParseResult:
    bank_detected: str
    subformat: str | None = None
    subformat_label: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    opening_balance: Decimal | None = None
    closing_balance: Decimal | None = None
    total_credit: Decimal | None = None
    total_debit: Decimal | None = None
    transactions: list[TransactionDict] = field(default_factory=list)
    raw_data: RawDataDict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    # True para cuentas de pasivo (tarjetas de crédito). En éstas el cuadre
    # sigue la ecuación  opening + débitos - créditos = closing  porque
    # los cargos AUMENTAN la deuda y los abonos la disminuyen.
    is_liability: bool = False
    # Cuenta de inversión (brokerage): el saldo cambia por apreciación de
    # mercado, así que NO se reconcilia crédito/débito vs saldos.
    is_investment: bool = False
    # Multi-período: segmentos por período (en memoria, NO se serializan a JSONB).
    # Cada item: {period_start, period_end, transactions: [...], total_credit, total_debit}.
    multi_period: bool = False
    period_segments: list[PeriodSegmentDict] = field(default_factory=list)


_SPANISH_MONTHS: dict[str, str] = {
    "ene": "01", "feb": "02", "mar": "03", "abr": "04",
    "may": "05", "jun": "06", "jul": "07", "ago": "08",
    "sep": "09", "oct": "10", "nov": "11", "dic": "12",
}


class BaseParser(ABC):
    key: str = "unknown"
    display_name: str = "Desconocido"

    @abstractmethod
    def can_parse(self, content: bytes, filename: str, text: str = "") -> float:
        """Retorna confianza 0.0–1.0 de que este parser puede procesar el archivo."""

    def negative_signatures(self) -> list[str]:
        """Frases que, si aparecen en el texto, indican que NO es este banco.
        Se usa como penalización cruzada en el registry."""
        return []

    def subformats(self) -> list[dict[str, str]]:
        """Variantes de cartola que este parser sabe procesar.
        Cada item: {key, label, hint?}. Vacío si el parser no tiene subformatos.

        El usuario puede forzar uno desde la UI con `subformat_override`."""
        return []

    @abstractmethod
    def parse(
        self,
        content: bytes,
        text: str,
        statement: object,
        subformat_hint: str | None = None,
    ) -> ParseResult:
        """Extrae transacciones y metadata del archivo.

        `subformat_hint`: si está presente, el parser debe usarlo en vez de
        autodetectar el sub-formato."""

    def _normalize_amount(self, raw: str) -> Decimal:
        """
        Normaliza montos con formato chileno/americano.

        Heurística: si hay exactamente 3 dígitos después del último separador
        (coma o punto), ese separador es de miles. Si hay 1-2 dígitos, es decimal.

        Ejemplos:
          "200.000"   → 200000  (CLP punto-miles)
          "1.250.000" → 1250000 (CLP punto-miles múltiple)
          "3,989"     → 3989    (CLP coma-miles)
          "1,157,980" → 1157980 (CLP coma-miles múltiple)
          "8.31"      → 8.31    (USD decimal)
          "1,234.56"  → 1234.56 (USD coma-miles + punto decimal)
          "+$8.45"    → 8.45    (UglyCash prefijo)
          "(110.00)"  → -110.00 (Schwab negativo)
        """
        cleaned = raw.strip().replace("$", "").replace(" ", "").replace("+", "")

        negative = cleaned.startswith("(") and cleaned.endswith(")")
        if negative:
            cleaned = cleaned[1:-1]

        if not cleaned:
            return Decimal("0")

        try:
            if "," in cleaned and "." in cleaned:
                if cleaned.index(",") < cleaned.index("."):
                    # US format: 1,234.56
                    cleaned = cleaned.replace(",", "")
                else:
                    # EU/CLP format: 1.234,56
                    cleaned = cleaned.replace(".", "").replace(",", ".")
            elif "," in cleaned:
                after = cleaned.rsplit(",", 1)[-1]
                if len(after) == 3:
                    # CLP thousands: 3,989 → 3989
                    cleaned = cleaned.replace(",", "")
                else:
                    # Decimal comma: 3,50 → 3.50
                    cleaned = cleaned.replace(",", ".")
            elif "." in cleaned:
                after = cleaned.rsplit(".", 1)[-1]
                if len(after) == 3:
                    # CLP thousands: 200.000 → 200000
                    cleaned = cleaned.replace(".", "")
                # else: decimal point, keep as-is

            result = Decimal(cleaned)
            return -result if negative else result
        except InvalidOperation as exc:
            raise ValueError(f"No se pudo normalizar el monto: {raw!r}") from exc

    def _parse_clp_date(self, raw: str) -> date | None:
        """Parsea fechas en formato DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY."""
        from datetime import datetime
        raw = raw.strip()
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y"):
            try:
                return datetime.strptime(raw, fmt).date()
            except ValueError:
                continue
        return None

    def _parse_spanish_date(self, raw: str) -> date | None:
        """
        Parsea fechas con meses en español: '29 oct 2025', '2 feb 2026'.
        Soporta: ene feb mar abr may jun jul ago sep oct nov dic.
        """
        from datetime import datetime
        m = re.match(r"(\d{1,2})\s+(\w{3,4})\s+(\d{4})", raw.strip())
        if not m:
            return None
        month = _SPANISH_MONTHS.get(m.group(2).lower()[:3])
        if not month:
            return None
        try:
            return datetime.strptime(f"{m.group(1)}/{month}/{m.group(3)}", "%d/%m/%Y").date()
        except ValueError:
            return None

    def _extract_tables(
        self,
        content: bytes,
        max_pages: int = 50,
        table_settings: dict | None = None,
    ) -> list[list[list[str | None]]]:
        """Extrae tablas del PDF preservando la estructura de columnas.

        Más preciso que texto plano para bancos cuyos PDFs tienen columnas
        alineadas (fecha, descripción, monto, saldo). Usa pdfplumber
        que ya es una dependencia del proyecto.

        Retorna lista plana de tablas (cada tabla es lista de filas, cada
        fila es lista de celdas str|None). Filtra filas completamente vacías.
        """
        try:
            import pdfplumber
        except ImportError:
            return []
        tables: list[list[list[str | None]]] = []
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page in pdf.pages[:max_pages]:
                    settings = table_settings or {
                        "vertical_strategy": "lines",
                        "horizontal_strategy": "lines",
                    }
                    page_tables = page.extract_tables(settings) or []
                    if not page_tables:
                        page_tables = page.extract_tables() or []
                    for table in page_tables:
                        clean = [
                            row for row in table
                            if any(cell and str(cell).strip() for cell in row)
                        ]
                        if clean:
                            tables.append(clean)
        except Exception as exc:
            logger.debug("No se pudieron extraer tablas del PDF: %s", exc)
        return tables

    def _pdf_page_count(self, content: bytes) -> int:
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                return len(pdf.pages)
        except Exception as exc:
            logger.debug("No se pudo contar páginas del PDF: %s", exc)
            return 0

    def _pdf_structural_fingerprint(self, content: bytes) -> FingerprintDict:
        """Extrae características estructurales del PDF para mejorar la detección.

        Devuelve: producer, creator, page_count, first_page_table_count,
        first_page_word_count, has_images.
        Útil en can_parse() como señal adicional cuando el texto es ambiguo.
        """
        result: FingerprintDict = {
            "producer": "",
            "creator": "",
            "page_count": 0,
            "first_page_table_count": 0,
            "first_page_word_count": 0,
            "has_images": False,
        }
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                meta = pdf.metadata or {}
                result["producer"] = str(meta.get("Producer") or "").lower()
                result["creator"] = str(meta.get("Creator") or "").lower()
                result["page_count"] = len(pdf.pages)
                if pdf.pages:
                    p0 = pdf.pages[0]
                    result["first_page_table_count"] = len(p0.extract_tables() or [])
                    text = p0.extract_text() or ""
                    result["first_page_word_count"] = len(text.split())
                    result["has_images"] = bool(p0.images)
        except Exception as exc:
            logger.debug("No se pudieron extraer fingerprints del PDF: %s", exc)
        return result

    def _parse_us_date(self, raw: str, year: int) -> date | None:
        """
        Parsea fechas en formato MM/DD (EE.UU.) añadiendo el año del período.
        Ejemplo: "11/04" con year=2024 → date(2024, 11, 4).
        """
        from datetime import datetime
        raw = raw.strip()
        if raw.count("/") == 1:
            raw = f"{raw}/{year}"
        try:
            return datetime.strptime(raw, "%m/%d/%Y").date()
        except ValueError:
            return None
