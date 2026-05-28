from __future__ import annotations

import datetime
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Literal, TypedDict

import pdfplumber
import pytesseract


MovementType = Literal["income", "expense"]


class ParsedRow(TypedDict):
    date: str
    description: str
    amount: str
    movement_type: MovementType


class ParseResult(TypedDict):
    bank_detected: str
    extraction_method: Literal["text", "ocr"]
    rows: list[ParsedRow]


class StatementParseError(RuntimeError):
    pass


_GENERIC_LINE_RE = re.compile(r"(?P<date>\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(?P<description>.+?)\s+(?P<amount>-?\$?\s?[\d\.,]+)\s*$")
_AMOUNT_TOKEN_RE = re.compile(r"^-?\$?[\d\.,]+-?$|^-$|^\(-?\$?[\d\.,]+\)$")


def parse_statement_pdf(path: Path) -> ParseResult:
    text, method = _extract_text(path)
    bank = _detect_bank(text)
    rows = _parse_rows(text, bank)
    return {"bank_detected": f"{bank}:{method}", "extraction_method": method, "rows": rows}


def _extract_text(path: Path) -> tuple[str, Literal["text", "ocr"]]:
    text_parts: list[str] = []
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                text_parts.append(page.extract_text() or "")
    except Exception as exc:
        raise StatementParseError(f"No se pudo abrir el PDF con pdfplumber: {exc}") from exc
    text = "\n".join(text_parts).strip()
    if _has_enough_text(text):
        return text, "text"
    ocr_text = _extract_text_with_ocr(path)
    if not ocr_text:
        raise StatementParseError("El PDF no contiene texto extraíble y OCR no devolvió contenido")
    return ocr_text, "ocr"


def _extract_text_with_ocr(path: Path) -> str:
    text_parts: list[str] = []
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                image = page.to_image(resolution=200).original
                text_parts.append(pytesseract.image_to_string(image, lang="spa+eng", timeout=30))
    except pytesseract.TesseractError as exc:
        raise StatementParseError(f"OCR falló con Tesseract: {exc}") from exc
    except RuntimeError as exc:
        raise StatementParseError(f"OCR excedió el tiempo máximo por página: {exc}") from exc
    except Exception as exc:
        raise StatementParseError(f"OCR no pudo procesar el PDF: {exc}") from exc
    return "\n".join(text_parts).strip()


def _has_enough_text(text: str) -> bool:
    digits = sum(char.isdigit() for char in text)
    return len(text) >= 80 and digits >= 10


def _detect_bank(text: str) -> str:
    normalized = _normalize_text(text)
    if "itau" in normalized or "itau" in normalized.replace("ú", "u"):
        return "itau"
    if "bice" in normalized:
        return "bice"
    if "prex" in normalized:
        return "prex"
    if "uglycash" in normalized or "ugly cash" in normalized:
        return "uglycash"
    if "td bank" in normalized:
        return "td-bank"
    if "charles schwab" in normalized or "schwab" in normalized:
        return "charles-schwab"
    if "alpaca" in normalized:
        return "alpaca"
    return "fallback"


def _parse_rows(text: str, bank: str) -> list[ParsedRow]:
    if bank in {"itau", "bice"}:
        rows = _parse_two_amount_columns(text)
        if rows:
            return rows
    if bank == "prex":
        rows = _parse_signed_amount_rows(text)
        if rows:
            return rows
    return _parse_signed_amount_rows(text)


def _parse_two_amount_columns(text: str) -> list[ParsedRow]:
    rows: list[ParsedRow] = []
    for line in text.splitlines():
        parts = _clean_line(line).split(" ")
        if len(parts) < 4:
            continue
        date = _parse_date(parts[0])
        if date is None:
            continue
        amount_tokens: list[str] = []
        while parts[1:] and _AMOUNT_TOKEN_RE.match(parts[-1]) and len(amount_tokens) < 3:
            amount_tokens.insert(0, parts.pop())
        if len(amount_tokens) < 2:
            continue
        charge = _parse_amount(amount_tokens[0])
        credit = _parse_amount(amount_tokens[1])
        description = " ".join(parts[1:])
        if not description:
            continue
        if credit is not None and credit > 0:
            rows.append(_row(date, description, credit, "income"))
        elif charge is not None and charge > 0:
            rows.append(_row(date, description, charge, "expense"))
    return rows


def _parse_signed_amount_rows(text: str) -> list[ParsedRow]:
    rows: list[ParsedRow] = []
    for line in text.splitlines():
        match = _GENERIC_LINE_RE.search(_clean_line(line))
        if not match:
            continue
        date = _parse_date(match.group("date"))
        amount = _parse_amount(match.group("amount"))
        if date is None or amount is None:
            continue
        rows.append(_row(date, match.group("description"), abs(amount), "income" if amount > 0 else "expense"))
    return rows


def _row(date: datetime.date, description: str, amount: Decimal, movement_type: MovementType) -> ParsedRow:
    return {"date": date.isoformat(), "description": description.strip()[:500], "amount": str(amount), "movement_type": movement_type}


def _parse_date(value: str) -> datetime.date | None:
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(value: str) -> Decimal | None:
    cleaned = value.strip().replace("$", "").replace(" ", "")
    if not cleaned or cleaned == "-":
        return None
    is_negative = cleaned.startswith("-") or cleaned.endswith("-") or cleaned.startswith("(") and cleaned.endswith(")")
    cleaned = cleaned.strip("-()")
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        parts = cleaned.split(",")
        cleaned = "".join(parts) if len(parts[-1]) == 3 else cleaned.replace(",", ".")
    elif "." in cleaned:
        parts = cleaned.split(".")
        cleaned = "".join(parts) if len(parts) > 2 or len(parts[-1]) == 3 else cleaned
    else:
        cleaned = cleaned.replace(",", "")
    try:
        amount = Decimal(cleaned)
    except InvalidOperation:
        return None
    return -amount if is_negative else amount


def _clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.strip())


def _normalize_text(text: str) -> str:
    return text.lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
