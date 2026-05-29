"""Tests para el parser OFX."""
from __future__ import annotations

import datetime
from decimal import Decimal

import pytest

from app.modules.parsers.ofx import (
    parse_ofx,
    _parse_ofx_amount,
    _parse_ofx_date,
    OfxParseResult,
)


def test_parse_ofx_date_valid():
    assert _parse_ofx_date("20260115") == datetime.date(2026, 1, 15)
    assert _parse_ofx_date("2026-01-15") == datetime.date(2026, 1, 15)


def test_parse_ofx_date_invalid():
    assert _parse_ofx_date("invalid") is None
    assert _parse_ofx_date("") is None


def test_parse_ofx_amount_positive():
    assert _parse_ofx_amount("1500.00") == Decimal("1500.00")
    assert _parse_ofx_amount("$1,500.00") == Decimal("1500.00")


def test_parse_ofx_amount_negative():
    assert _parse_ofx_amount("-1500.00") == Decimal("-1500.00")
    assert _parse_ofx_amount("(1500.00)") == Decimal("-1500.00")


def test_parse_ofx_sgml_basic():
    content = b"""OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260115
<TRNAMT>150000.00
<NAME>Sueldo
<MEMO>Pago mensual
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260120
<TRNAMT>-45000.00
<NAME>Supermercado
</STMTTRN>
</BANKTRANLIST>
<BANKACCTFROM>
<ACCTID>12345678
<BANKID>001
</BANKACCTFROM>
<LEDGERBAL>
<BALAMT>500000.00
<DTASOF>20260131
</LEDGERBAL>
</OFX>"""
    result = parse_ofx(content)
    assert result.bank_detected == "ofx:001"
    assert result.account_id == "12345678"
    assert len(result.transactions) == 2
    assert result.transactions[0]["movement_type"] == "income"
    assert result.transactions[0]["amount"] == Decimal("150000.00")
    assert result.transactions[1]["movement_type"] == "expense"


def test_parse_ofx_xml_basic():
    content = b"""<?xml version="1.0" encoding="UTF-8"?>
<OFX>
<STMTTRNRS>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260115
<TRNAMT>200000.00
<NAME>Transferencia entrante
</STMTTRN>
</STMTTRN>
<BANKACCTFROM>
<ACCTID>87654321
<BANKID>BICE
</BANKACCTFROM>
<LEDGERBAL>
<BALAMT>1000000.00
</LEDGERBAL>
</STMTTRNRS>
</OFX>"""
    result = parse_ofx(content)
    assert len(result.transactions) == 1
    assert result.closing_balance == Decimal("1000000.00")


def test_parse_ofx_empty_transactions():
    content = b"""OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKACCTFROM><ACCTID>123</ACCTID></BANKACCTFROM>
</OFX>"""
    result = parse_ofx(content)
    assert len(result.transactions) == 0
    assert result.account_id == "123"