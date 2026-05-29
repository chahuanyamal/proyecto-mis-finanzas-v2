"""Parser para archivos OFX (Open Financial Exchange) y QFX (Quicken).
Soporta OFX 1.x (SGML) y OFX 2.x (XML).
"""
from __future__ import annotations

import datetime
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Literal, TypedDict

from app.core.logging import get_logger

logger = get_logger(__name__)


class OfxTransactionDict(TypedDict, total=False):
    date: datetime.date
    description: str
    amount: Decimal
    movement_type: Literal["income", "expense"]
    currency: str
    check_num: str | None
    type: str
    fitid: str | None
    memo: str | None


@dataclass
class OfxParseResult:
    bank_detected: str
    account_id: str | None
    account_type: str | None
    currency: str
    period_start: datetime.date | None = None
    period_end: datetime.date | None = None
    opening_balance: Decimal | None = None
    closing_balance: Decimal | None = None
    transactions: list[OfxTransactionDict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def parse_ofx(content: bytes) -> OfxParseResult:
    text = content.decode("utf-8", errors="replace").strip()
    if text.startswith("<?xml") or "<OFX>" in text.upper():
        return _parse_xml(text)
    return _parse_sgml(text)


def _parse_xml(text: str) -> OfxParseResult:
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise ValueError(f"OFX XML inválido: {exc}") from exc

    ns: dict[str, str] = {}
    for event, elem in ET.iterwalk(root, events=("start",)):
        if event == "start" and elem.tag.endswith("}OFX"):
            ns = {child.tag.split("}")[0].strip("{"): "}" + child.tag.split("}")[0].strip("{") + "}" for child in elem if "}" in child.tag}
            break

    def find(root_elem: ET.Element, tag: str) -> str | None:
        for elem in root_elem.iter():
            if elem.tag.endswith(f"} {tag}".strip()) or elem.tag == tag:
                return elem.text and elem.text.strip() or None
        return None

    stmt_trnrs = root.findall(".//{*}STMTTRNRS") or root.findall(".//STMTTRNRS")
    stmt_trn = root.findall(".//{*}STMTTRN") or root.findall(".//STMTTRN")

    bank_msgs_rq = root.find(".//{*}BANKMSGSRQSV1") or root.find(".//BANKMSGSRQSV1")
    cc_msgs_rq = root.find(".//{*}CCSTMTRS") or root.find(".//CCSTMTRS")

    account_id = None
    account_type = None
    currency = "CLP"
    bank_id = None
    closing_balance = None
    closing_date = None
    opening_balance = None

    if stmt_trnrs:
        bank_acct_from = stmt_trnrs[0].find(".//{*}BANKACCTFROM") or stmt_trnrs[0].find(".//BANKACCTFROM")
        if bank_acct_from is not None:
            account_id = bank_acct_from.findtext("{*}ACCTID") or bank_acct_from.findtext("ACCTID")
            account_type = bank_acct_from.findtext("{*}ACCTTYPE") or bank_acct_from.findtext("ACCTTYPE")
            bank_id = bank_acct_from.findtext("{*}BANKID") or bank_acct_from.findtext("BANKID")
        cc_acct_from = stmt_trnrs[0].find(".//{*}CCACCTFROM") or stmt_trnrs[0].find(".//CCACCTFROM")
        if cc_acct_from is not None:
            account_id = cc_acct_from.findtext("{*}ACCTID") or cc_acct_from.findtext("ACCTID")
            account_type = "CREDITCARD"
            bank_id = cc_acct_from.findtext("{*}BANKID") or cc_acct_from.findtext("BANKID")
        ledger_bal = stmt_trnrs[0].find(".//{*}LEDGERBAL") or stmt_trnrs[0].find(".//LEDGERBAL")
        if ledger_bal is not None:
            closing_balance = ledger_bal.findtext("{*}BALAMT") or ledger_bal.findtext("BALAMT")
            closing_date = ledger_bal.findtext("{*}DTASOF") or ledger_bal.findtext("DTASOF")

    elif cc_msgs_rq or bank_msgs_rq:
        target = cc_msgs_rq or bank_msgs_rq
        account_id = target.findtext("{*}CCACCTFROM/{*}ACCTID") or target.findtext("CCACCTFROM/ACCTID")
        if not account_id:
            account_id = target.findtext("{*}BANKACCTFROM/{*}ACCTID") or target.findtext("BANKACCTFROM/ACCTID")
        account_type = target.findtext("{*}CCACCTFROM/{*}ACCTTYPE") or target.findtext("CCACCTFROM/ACCTTYPE")

    transactions: list[OfxTransactionDict] = []

    for elem in root.iter():
        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        if tag == "STMTTRN":
            t = _parse_ofx_transaction(elem)
            if t:
                transactions.append(t)

    period_start = None
    period_end = None
    if transactions:
        dates = [t["date"] for t in transactions]
        period_start = min(dates)
        period_end = max(dates)

    parsed_closing = _parse_ofx_amount(closing_balance) if closing_balance else None

    return OfxParseResult(
        bank_detected=f"ofx:{bank_id or 'generic'}",
        account_id=account_id,
        account_type=account_type,
        currency=currency,
        period_start=period_start,
        period_end=period_end,
        opening_balance=opening_balance,
        closing_balance=parsed_closing,
        transactions=transactions,
        warnings=[],
    )


def _parse_sgml(text: str) -> OfxParseResult:
    def get(tag: str) -> str | None:
        pattern = rf"<{tag}>(.*?)</{tag}>"
        m = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        return m.group(1).strip() if m else None

    def get_inline(tag: str) -> str | None:
        pattern = rf"<{tag}>(.*?)(?=<[A-Z]|$)"
        m = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        return m.group(1).strip() if m else None

    account_id = get("ACCTID")
    bank_id = get("BANKID")
    account_type = get("ACCTTYPE")
    if not account_type:
        account_type = "CHECKING"

    currency = get("CURDEF") or "CLP"

    closing_bal_str = get("BALAMT")
    closing_date_str = get("DTASOF")
    closing_balance = _parse_ofx_amount(closing_bal_str) if closing_bal_str else None

    period_start: datetime.date | None = None
    period_end: datetime.date | None = None
    transactions: list[OfxTransactionDict] = []

    stmt_trn_pattern = re.compile(
        r"<STMTTRN>(.*?)</STMTTRN>",
        re.DOTALL | re.IGNORECASE,
    )
    for m in stmt_trn_pattern.finditer(text):
        block = m.group(1)
        t = _parse_sgml_transaction(block)
        if t:
            transactions.append(t)

    if transactions:
        dates = [tx["date"] for tx in transactions]
        period_start = min(dates)
        period_end = max(dates)

    bank_id_clean = bank_id or "generic"
    return OfxParseResult(
        bank_detected=f"ofx:{bank_id_clean}",
        account_id=account_id,
        account_type=account_type,
        currency=currency,
        period_start=period_start,
        period_end=period_end,
        opening_balance=None,
        closing_balance=closing_balance,
        transactions=transactions,
        warnings=[],
    )


def _parse_sgml_transaction(block: str) -> OfxTransactionDict | None:
    def get_val(tag: str) -> str | None:
        m = re.search(rf"<{tag}>(.*?)(?=<[A-Z]|$)", block, re.DOTALL | re.IGNORECASE)
        return m.group(1).strip() if m else None

    dtposted_str = get_val("DTPOSTED")
    amount_str = get_val("TRNAMT")
    trntype = get_val("TRNTYPE")
    name = get_val("NAME")
    memo = get_val("MEMO")
    fitid = get_val("FITID")
    check_num = get_val("CHECKNUM")

    if not dtposted_str or not amount_str:
        return None

    date = _parse_ofx_date(dtposted_str)
    if date is None:
        logger.warning("OFX: fecha inválida %s", dtposted_str)
        return None

    amount = _parse_ofx_amount(amount_str)
    if amount is None:
        logger.warning("OFX: monto inválido %s", amount_str)
        return None

    movement_type: Literal["income", "expense"] = "expense"
    if trntype:
        t = trntype.upper()
        if t in ("CREDIT", "DEP", "INT", "DIV", "PAYMENT"):
            movement_type = "income"
        elif t in ("DEBIT", "CHECK", "ATM", "POS", "EFT", "PAY"):
            movement_type = "expense"

    description = (name or "") + (f" - {memo}" if memo else "")
    description = description.strip()[:500]

    return OfxTransactionDict(
        date=date,
        description=description,
        amount=abs(amount),
        movement_type=movement_type,
        currency="CLP",
        check_num=check_num,
        type=trntype or "OTHER",
        fitid=fitid,
        memo=memo,
    )


def _parse_ofx_transaction(elem: ET.Element) -> OfxTransactionDict | None:
    def child_text(tag: str) -> str | None:
        for e in elem.iter():
            if e.tag.endswith(f"} {tag}".strip()) or e.tag == tag:
                return e.text and e.text.strip() or None
        return None

    dtposted_str = child_text("DTPOSTED")
    amount_str = child_text("TRNAMT")
    trntype = child_text("TRNTYPE")
    name = child_text("NAME")
    memo = child_text("MEMO")
    fitid = child_text("FITID")
    check_num = child_text("CHECKNUM")

    if not dtposted_str or not amount_str:
        return None

    date = _parse_ofx_date(dtposted_str)
    if date is None:
        return None

    amount = _parse_ofx_amount(amount_str)
    if amount is None:
        return None

    movement_type: Literal["income", "expense"] = "expense"
    if trntype:
        t = trntype.upper()
        if t in ("CREDIT", "DEP", "INT", "DIV", "PAYMENT"):
            movement_type = "income"

    description = (name or "") + (f" - {memo}" if memo else "")
    description = description.strip()[:500]

    return OfxTransactionDict(
        date=date,
        description=description,
        amount=abs(amount),
        movement_type=movement_type,
        currency="CLP",
        check_num=check_num,
        type=trntype or "OTHER",
        fitid=fitid,
        memo=memo,
    )


def _parse_ofx_date(value: str) -> datetime.date | None:
    value = value.strip()
    if not value:
        return None
    year_str = value[:4]
    month_str = value[4:6]
    day_str = value[6:8]
    try:
        return datetime.date(int(year_str), int(month_str), int(day_str))
    except (ValueError, IndexError):
        pass
    for fmt in ("%Y%m%d", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.datetime.strptime(value[:10], fmt).date()
        except ValueError:
            continue
    return None


def _parse_ofx_amount(value: str | None) -> Decimal | None:
    if value is None:
        return None
    cleaned = value.strip().replace("$", "").replace(",", "").replace(" ", "")
    negative = cleaned.startswith("-") or (cleaned.startswith("(") and cleaned.endswith(")"))
    cleaned = cleaned.strip("-()")
    if not cleaned:
        return None
    try:
        result = Decimal(cleaned)
    except InvalidOperation:
        return None
    return -result if negative else result