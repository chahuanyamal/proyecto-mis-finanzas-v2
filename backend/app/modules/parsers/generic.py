"""Parser genérico de fallback — extrae lo que pueda de cualquier PDF."""
import re

from app.modules.parsers.base import BaseParser, ParseResult


class GenericParser(BaseParser):
    key = "generic"
    display_name = "Genérico"

    def can_parse(self, content: bytes, filename: str, text: str = "") -> float:
        return 0.3  # Siempre es el último recurso

    def parse(self, content: bytes, text: str, statement, subformat_hint: str | None = None) -> ParseResult:
        result = ParseResult(bank_detected="Desconocido")
        result.raw_data = {"parser": "generic", "text_length": len(text)}

        lines = [l.strip() for l in text.split("\n") if l.strip()]
        date_amount_pattern = re.compile(
            r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s+(.+?)\s+([\d.,]+)"
        )

        for line in lines:
            m = date_amount_pattern.search(line)
            if m:
                raw_date, desc, raw_amount = m.groups()
                parsed_date = self._parse_clp_date(raw_date)
                if not parsed_date:
                    continue
                try:
                    amount = self._normalize_amount(raw_amount)
                except Exception:
                    continue

                result.transactions.append({
                    "date": parsed_date,
                    "original_description": desc.strip(),
                    "normalized_description": desc.strip(),
                    "amount": amount,
                    "currency": "CLP",
                    "movement_type": "debit",
                    "raw_data": {"line": line},
                })

        result.warnings.append("Parser genérico: revisar transacciones manualmente")
        return result
