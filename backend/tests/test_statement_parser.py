from __future__ import annotations

from pathlib import Path

import pytest

from app.modules.statements import parser


def test_detects_known_banks() -> None:
    assert parser._detect_bank("Banco Itaú Chile") == "itau"
    assert parser._detect_bank("BANCO BICE cartola") == "bice"
    assert parser._detect_bank("Movimientos Prex") == "prex"
    assert parser._detect_bank("TD Bank statement") == "td-bank"
    assert parser._detect_bank("Charles Schwab brokerage") == "charles-schwab"
    assert parser._detect_bank("Alpaca account") == "alpaca"
    assert parser._detect_bank("sin marca conocida") == "fallback"


def test_parses_itau_bice_two_amount_columns_with_balance() -> None:
    text = """
    Banco Itaú
    01/05/2026 Compra Supermercado 12.500 - 987.500
    02/05/2026 Abono Sueldo - 1.250.000 2.237.500
    """

    rows = parser._parse_rows(text, "itau")

    assert rows == [
        {"date": "2026-05-01", "description": "Compra Supermercado", "amount": "12500", "movement_type": "expense"},
        {"date": "2026-05-02", "description": "Abono Sueldo", "amount": "1250000", "movement_type": "income"},
    ]


def test_parses_prex_signed_amounts() -> None:
    text = """
    Prex
    05/05/2026 Comercio ABC -$ 8.500
    06/05/2026 Recarga $ 20.000
    """

    rows = parser._parse_rows(text, "prex")

    assert rows == [
        {"date": "2026-05-05", "description": "Comercio ABC", "amount": "8500", "movement_type": "expense"},
        {"date": "2026-05-06", "description": "Recarga", "amount": "20000", "movement_type": "income"},
    ]


def test_fallback_preserves_decimal_amounts() -> None:
    text = """
    TD Bank
    05/05/2026 Coffee Shop -8.50
    06/05/2026 Deposit 1200.25
    """

    rows = parser._parse_rows(text, "fallback")

    assert rows == [
        {"date": "2026-05-05", "description": "Coffee Shop", "amount": "8.50", "movement_type": "expense"},
        {"date": "2026-05-06", "description": "Deposit", "amount": "1200.25", "movement_type": "income"},
    ]


def test_parse_statement_pdf_includes_bank_and_extraction_method(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_extract_text(_path: Path) -> tuple[str, parser.Literal["text", "ocr"]]:
        return "Banco BICE\n03-05-2026 Restaurante 15.990 - 100.000", "ocr"

    monkeypatch.setattr(parser, "_extract_text", fake_extract_text)

    result = parser.parse_statement_pdf(Path("cartola.pdf"))

    assert result["bank_detected"] == "bice:ocr"
    assert result["extraction_method"] == "ocr"
    assert result["rows"][0]["amount"] == "15990"


def test_extract_text_raises_clear_error_when_ocr_returns_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(parser, "_has_enough_text", lambda _text: False)
    monkeypatch.setattr(parser, "_extract_text_with_ocr", lambda _path: "")

    class FakePdf:
        pages = []

        def __enter__(self) -> "FakePdf":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

    monkeypatch.setattr(parser.pdfplumber, "open", lambda _path: FakePdf())

    with pytest.raises(parser.StatementParseError, match="OCR no devolvió contenido"):
        parser._extract_text(Path("empty.pdf"))
