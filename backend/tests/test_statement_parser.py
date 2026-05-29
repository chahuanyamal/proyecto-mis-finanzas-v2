from __future__ import annotations

import datetime
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

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


def test_parse_statement_pdf_extracts_simple_balances(monkeypatch: pytest.MonkeyPatch) -> None:
    text = """
    Cartola genérica
    Saldo inicial: $ 1.000
    03-05-2026 Deposito 300
    Saldo final: $ 1.300
    """
    monkeypatch.setattr(parser, "_extract_text", lambda _p: (text, "text"))

    result = parser.parse_statement_pdf(Path("cartola.pdf"))

    assert result["opening_balance"] == "1000"
    assert result["closing_balance"] == "1300"


def test_registry_result_preserves_balances(monkeypatch: pytest.MonkeyPatch) -> None:
    result = SimpleNamespace(
        opening_balance=Decimal("1000"),
        closing_balance=Decimal("1300"),
        transactions=[{"date": datetime.date(2026, 5, 1), "description": "Deposito", "amount": Decimal("300"), "movement_type": "credit"}],
    )

    class FakeParser:
        key = "fake"

        def parse(self, *_args: object) -> object:
            return result

    class FakeRegistry:
        def detect(self, *_args: object) -> tuple[FakeParser, float]:
            return FakeParser(), 1.0

    monkeypatch.setattr(Path, "read_bytes", lambda _self: b"pdf")
    monkeypatch.setattr("app.modules.parsers.registry.ParserRegistry", FakeRegistry)

    parsed = parser._parse_with_registry(Path("fake.pdf"), "x" * 500, "text")

    assert parsed is not None
    assert parsed["opening_balance"] == "1000"
    assert parsed["closing_balance"] == "1300"


def test_forced_unknown_parser_raises_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(parser, "_extract_text", lambda _p: ("Banco BICE\n03-05-2026 Restaurante 15.990 - 100.000", "text"))

    with pytest.raises(parser.StatementParseError, match="Parser no soportado"):
        parser.parse_statement_pdf(Path("cartola.pdf"), parser_key="no-existe")


def test_rows_from_result_maps_credit_debit_to_income_expense() -> None:
    # Los parsers bancarios dedicados usan credit/debit y montos positivos;
    # la v2 espera income/expense. Este mapeo es el puente entre ambos.
    result = SimpleNamespace(transactions=[
        {"date": datetime.date(2026, 5, 1), "original_description": "Sueldo", "amount": Decimal("1250000"), "movement_type": "credit"},
        {"date": datetime.date(2026, 5, 2), "original_description": "Supermercado", "amount": Decimal("12500"), "movement_type": "debit"},
        {"date": datetime.date(2026, 5, 3), "original_description": "Reverso", "amount": Decimal("-300"), "movement_type": "debit"},
    ])

    rows = parser._rows_from_result(result)

    assert rows == [
        {"date": "2026-05-01", "description": "Sueldo", "amount": "1250000", "movement_type": "income"},
        {"date": "2026-05-02", "description": "Supermercado", "amount": "12500", "movement_type": "expense"},
        {"date": "2026-05-03", "description": "Reverso", "amount": "300", "movement_type": "expense"},
    ]


def test_rows_from_result_skips_incomplete_rows() -> None:
    result = SimpleNamespace(transactions=[
        {"date": None, "original_description": "sin fecha", "amount": Decimal("100"), "movement_type": "debit"},
        {"date": datetime.date(2026, 5, 1), "original_description": "sin monto", "amount": None, "movement_type": "debit"},
    ])

    assert parser._rows_from_result(result) == []


def test_short_text_skips_registry_and_uses_simple_path(monkeypatch: pytest.MonkeyPatch) -> None:
    # Texto corto (fixtures/tests) → ruta simple determinística, sin registry.
    monkeypatch.setattr(parser, "_extract_text", lambda _p: ("Banco BICE\n03-05-2026 Restaurante 15.990 - 100.000", "text"))

    def _boom(*_args: object, **_kwargs: object) -> object:  # pragma: no cover
        raise AssertionError("el registry no debe usarse con texto corto")

    monkeypatch.setattr(parser, "_parse_with_registry", lambda *a, **k: None)
    result = parser.parse_statement_pdf(Path("cartola.pdf"))
    assert result["bank_detected"] == "bice:text"
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
