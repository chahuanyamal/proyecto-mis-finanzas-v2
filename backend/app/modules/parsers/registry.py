"""Registry de parsers: auto-detecta el banco por puntaje de confianza."""
from app.modules.parsers.alpaca import AlpacaParser
from app.modules.parsers.base import BaseParser
from app.modules.parsers.bice import BiceParser
from app.modules.parsers.generic import GenericParser
from app.modules.parsers.itau import ItauParser
from app.modules.parsers.prex import PrexParser
from app.modules.parsers.schwab import SchwabParser
from app.modules.parsers.td_bank import TdBankParser
from app.modules.parsers.ugly_cash import UglyCashParser


class ParserRegistry:
    def __init__(self):
        self._parsers: list[BaseParser] = [
            ItauParser(),
            BiceParser(),
            TdBankParser(),
            SchwabParser(),
            AlpacaParser(),
            PrexParser(),
            UglyCashParser(),
            GenericParser(),  # Siempre último, confianza mínima 0.3
        ]

    def score_candidates(self, content: bytes, filename: str, text: str = "") -> list[tuple[BaseParser, float]]:
        """Retorna todos los parsers ordenados por confianza descendente."""
        if not text:
            try:
                import io

                import pdfplumber
                with pdfplumber.open(io.BytesIO(content)) as pdf:
                    text = "\n".join(page.extract_text() or "" for page in pdf.pages[:3])
            except Exception:
                text = ""

        text_lower = text.lower()
        scored = []
        for parser in self._parsers:
            score = parser.can_parse(content, filename, text)
            # Penalización cruzada: si el texto contiene firmas de OTRO banco
            # con alta certeza, este parser pierde score (evita falsos positivos
            # cuando una marca ajena aparece accidentalmente en el PDF).
            penalty = 0.0
            for neg in parser.negative_signatures():
                if neg in text_lower:
                    penalty = max(penalty, 0.4)
            scored.append((parser, max(0.0, score - penalty)))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored

    def get(self, key: str) -> BaseParser | None:
        return next((parser for parser in self._parsers if parser.key == key), None)

    def list_options(self) -> list[BaseParser]:
        return list(self._parsers)

    def detect(self, content: bytes, filename: str) -> tuple[BaseParser, float]:
        """Detecta el parser más apropiado y retorna (parser, confidence)."""
        scored = self.score_candidates(content, filename)
        best_parser, best_score = scored[0]
        return best_parser, best_score
