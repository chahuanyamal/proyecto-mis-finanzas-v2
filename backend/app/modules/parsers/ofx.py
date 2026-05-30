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
    # OFX 1.x es SGML (tags hoja sin cerrar) y 2.x es XML. Normalizamos ambos a
    # XML bien formado y parseamos por una sola vía robusta.
    return _parse_xml(_sgml_to_xml(text))


def _local(tag: str) -> str:
    """Nombre local de un tag, ignorando namespace ({ns}TAG → TAG)."""
    return tag.split("}")[-1] if "}" in tag else tag


def _sgml_to_xml(text: str) -> str:
    """Convierte OFX SGML (y limpia el preámbulo OFXHEADER) a XML bien formado.

    - Descarta todo lo anterior a ``<OFX>`` (cabecera ``OFXHEADER:...``).
    - Auto-cierra los tags hoja del estilo ``<TAG>valor`` → ``<TAG>valor</TAG>``.
    - Deja intactos los tags de apertura/cierre de agregados y los ya cerrados.
    """
    idx = text.upper().find("<OFX>")
    if idx > 0:
        text = text[idx:]
    out: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        match = re.match(r"^<(\w+)>(.+)$", stripped)
        # Solo cerramos cuando hay valor y aún no contiene otro tag (no está cerrado).
        if match and "<" not in match.group(2):
            tag, value = match.group(1), match.group(2).strip()
            out.append(f"<{tag}>{value}</{tag}>")
        else:
            out.append(stripped)
    return _balance_tags("\n".join(out))


def _balance_tags(text: str) -> str:
    """Equilibra tags para tolerar OFX malformado (cierres huérfanos/sobrantes).

    Recorre la secuencia de tags manteniendo una pila: descarta cierres sin
    apertura y cierra agregados pendientes, produciendo XML bien formado.
    """
    stack: list[str] = []
    out: list[str] = []
    for tok in re.split(r"(<[^>]+>)", text):
        if not tok.startswith("<"):
            out.append(tok)
            continue
        m = re.match(r"<(/?)(\w+)\s*(/?)>", tok)
        if not m:  # declaración <?xml?>, comentarios, etc.
            out.append(tok)
            continue
        closing, name, selfclose = m.group(1), m.group(2), m.group(3)
        if selfclose:
            out.append(tok)
        elif not closing:
            stack.append(name)
            out.append(tok)
        elif name in stack:
            while stack and stack[-1] != name:
                out.append(f"</{stack.pop()}>")
            stack.pop()
            out.append(tok)
        # cierre huérfano (name no está en la pila): se descarta
    while stack:
        out.append(f"</{stack.pop()}>")
    return "".join(out)


def _find_node(root: ET.Element, name: str) -> ET.Element | None:
    for elem in root.iter():
        if _local(elem.tag) == name:
            return elem
    return None


def _node_text(node: ET.Element, name: str) -> str | None:
    for elem in node.iter():
        if _local(elem.tag) == name:
            return (elem.text or "").strip() or None
    return None


def _parse_xml(text: str) -> OfxParseResult:
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise ValueError(f"OFX inválido: {exc}") from exc

    account_id: str | None = None
    account_type: str | None = None
    bank_id: str | None = None

    for acct_tag, default_type in (("BANKACCTFROM", None), ("CCACCTFROM", "CREDITCARD")):
        node = _find_node(root, acct_tag)
        if node is not None:
            account_id = _node_text(node, "ACCTID")
            account_type = _node_text(node, "ACCTTYPE") or default_type
            bank_id = _node_text(node, "BANKID")
            break

    closing_balance = None
    ledger_bal = _find_node(root, "LEDGERBAL")
    if ledger_bal is not None:
        closing_balance = _parse_ofx_amount(_node_text(ledger_bal, "BALAMT"))

    currency = _node_text(root, "CURDEF") or "CLP"

    transactions: list[OfxTransactionDict] = []
    for elem in root.iter():
        if _local(elem.tag) == "STMTTRN":
            parsed = _parse_ofx_transaction(elem)
            if parsed:
                transactions.append(parsed)

    period_start = None
    period_end = None
    if transactions:
        dates = [t["date"] for t in transactions]
        period_start = min(dates)
        period_end = max(dates)

    return OfxParseResult(
        bank_detected=f"ofx:{bank_id or 'generic'}",
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
            if e.tag.endswith(f"}}{tag}") or e.tag == tag:
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