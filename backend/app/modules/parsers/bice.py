"""Parser para cartolas de Banco BICE Chile.

Soporta 3 sub-formatos:
  - CC               : Cuenta Corriente en pesos
  - TC Nacional      : Tarjeta de crédito nacional en CLP
  - TC Internacional : Tarjeta de crédito internacional en USD

Estrategia de extracción:
  - CC: texto plano (los PDFs de CC no traen tablas detectables por pdfplumber).
    Saldos: bloque "Resumen del periodo" donde los valores están en la línea
    siguiente a las etiquetas. Transacciones: cada fila empieza con
    DD MMM YYYY (Abonos|Cargos) y termina con $monto; descripción puede
    envolver a líneas siguientes.
  - TC Nacional / Internacional: pdfplumber.extract_tables() devuelve tablas
    limpias con columnas alineadas. Más confiable que regex sobre texto.

Encoding: los PDFs de BICE devuelven '�' (REPLACEMENT CHARACTER) en
lugar de tildes (`Per�odo`, `Categor�a`). Normalizamos antes de matchear.
"""
import io
import re
from decimal import Decimal

import pdfplumber

from app.modules.parsers.base import BaseParser, ParseResult

# Reemplazo robusto del char de reemplazo Unicode y otras anomalías de encoding
# que aparecen en las cartolas BICE.
_BAD_CHARS = {"�": "", "¿": ""}


def _clean(text: str) -> str:
    """Normaliza el texto: quita chars de reemplazo y normaliza espacios."""
    for bad, good in _BAD_CHARS.items():
        text = text.replace(bad, good)
    return text


def _to_decimal(raw: str | None) -> Decimal | None:
    """Decimal flexible: acepta `$1.234`, `1,234.56`, `-682,439`, vacío -> None."""
    if raw is None:
        return None
    s = str(raw).strip().replace("$", "").replace("US", "").replace(" ", "")
    if not s or s in {"-", "--"}:
        return None
    negative = s.startswith("-")
    if negative:
        s = s[1:]
    # Detectar formato:
    #   con punto Y coma → el último es decimal
    #   sólo coma con 3 dígitos al final → coma de miles (CLP US-like)
    #   sólo coma con 1-2 dígitos al final → coma decimal
    #   sólo punto con 3 dígitos al final → punto de miles (CLP)
    #   sólo punto con 1-2 dígitos al final → punto decimal
    if "," in s and "." in s:
        if s.rindex(",") > s.rindex("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        tail = s.rsplit(",", 1)[1]
        s = s.replace(",", "") if len(tail) == 3 else s.replace(",", ".")
    elif "." in s:
        tail = s.rsplit(".", 1)[1]
        if len(tail) == 3:
            s = s.replace(".", "")
    try:
        d = Decimal(s)
    except Exception:
        return None
    return -d if negative else d


class BiceParser(BaseParser):
    key = "bice"
    display_name = "Banco BICE"

    def negative_signatures(self) -> list[str]:
        return [
            "banco itaú",
            "banco itau",
            "itaucorp",
            "banco bci",
            "banco de chile",
            "banco santander",
            "scotiabank",
            "banco falabella",
            "banco estado",
        ]

    def can_parse(self, content: bytes, filename: str, text: str = "") -> float:
        text_lower = _clean(text).lower()
        filename_lower = filename.lower()
        if re.search(r"(?:^|[_\-\s])bice(?:[_\-\s]|$)", filename_lower):
            return 0.95
        if "banco bice" in text_lower:
            return 0.95
        if re.search(r"\bbice\b", text_lower):
            return 0.85
        if "bice" in filename_lower:
            return 0.8
        return 0.0

    SUBFORMATS = [
        {"key": "cc", "label": "Cuenta Corriente"},
        {"key": "tc_nacional", "label": "Tarjeta de Crédito Nacional"},
        {"key": "tc_internacional", "label": "Tarjeta de Crédito Internacional"},
    ]

    def subformats(self) -> list[dict[str, str]]:
        return list(self.SUBFORMATS)

    def _detect_subformat(self, text: str, filename: str = "") -> str:
        t = _clean(text)
        fl = filename.lower()
        # 1) Pistas en el filename (más confiables que el texto)
        if "tc_internacional" in fl or "internacional" in fl:
            return "tc_internacional"
        if "tc_nacional" in fl or "nacional" in fl:
            return "tc_nacional"
        if re.search(r"(?:^|[_\-])cc(?:[_\-]|$)", fl):
            return "cc"
        # 2) Pistas en el texto
        if "Estado de Cuenta Internacional" in t or "INFORMACION DE TRANSACCIONES" in t:
            return "tc_internacional"
        if "Estado de Cuenta Nacional" in t or "PERIODO ACTUAL" in t.upper():
            return "tc_nacional"
        if "Cuenta en pesos" in t or "Abonos y cargos" in t or "Saldos diarios" in t:
            return "cc"
        return "cc"

    def _subformat_label(self, key: str) -> str:
        return next((s["label"] for s in self.SUBFORMATS if s["key"] == key), key)

    def parse(
        self,
        content: bytes,
        text: str,
        statement,
        subformat_hint: str | None = None,
    ) -> ParseResult:
        text = _clean(text)
        filename = getattr(statement, "filename", "") or ""
        subformat = subformat_hint or self._detect_subformat(text, filename)
        label = self._subformat_label(subformat)
        result = ParseResult(
            bank_detected=f"Banco BICE — {label}",
            subformat=subformat,
            subformat_label=label,
        )
        result.raw_data = {"parser": self.key, "subformat": subformat}
        if subformat_hint:
            result.raw_data["subformat_forced"] = True

        if subformat == "tc_internacional":
            result.is_liability = True
            return self._parse_tc_internacional(content, text, result)
        if subformat == "tc_nacional":
            result.is_liability = True
            return self._parse_tc_nacional(content, text, result)
        return self._parse_cc(text, result)

    # ================================================================== #
    # CC — Cuenta Corriente en pesos                                      #
    # ================================================================== #

    def _parse_cc(self, text: str, result: ParseResult) -> ParseResult:
        lines = text.splitlines()

        # ---- Período: "14 oct 2025 - 30 oct 2025" --------------------- #
        period_m = re.search(
            r"(\d{1,2}\s+\w{3,4}\s+\d{4})\s*[-–]\s*(\d{1,2}\s+\w{3,4}\s+\d{4})",
            text,
        )
        if period_m:
            result.period_start = self._parse_spanish_date(period_m.group(1))
            result.period_end = self._parse_spanish_date(period_m.group(2))

        # ---- Saldos: bloque "Resumen del periodo" -------------------- #
        # Layout real (NO regex en una línea):
        #   Saldo inicial Sobregiro usado Total abonos
        #   $A           $B               $C
        #   Saldo final  Sobregiro disponible Total cargos
        #   $D           $E                   $F
        for i, ln in enumerate(lines):
            ll = ln.strip()
            if ll.startswith("Saldo inicial") and "Total abonos" in ll and i + 1 < len(lines):
                vals = re.findall(r"-?\$[\d.,]+", lines[i + 1])
                if len(vals) >= 3:
                    result.opening_balance = _to_decimal(vals[0])
                    result.total_credit = _to_decimal(vals[2])
            elif ll.startswith("Saldo final") and "Total cargos" in ll and i + 1 < len(lines):
                vals = re.findall(r"-?\$[\d.,]+", lines[i + 1])
                if len(vals) >= 3:
                    result.closing_balance = _to_decimal(vals[0])
                    result.total_debit = _to_decimal(vals[2])

        # ---- Transacciones: sección "Abonos y cargos" ---------------- #
        section_m = re.search(
            r"Abonos\s+y\s+cargos(.+?)(?:\n\s*Saldos\s+diarios\b|\Z)",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        section_text = section_m.group(1) if section_m else text

        # Una fila empieza con:  <DD MMM YYYY> <Abonos|Cargos> <ref|-> ...
        # y termina con $monto AL FINAL DE LA PRIMERA LÍNEA de la fila.
        start_re = re.compile(
            r"^\s*(\d{1,2}\s+\w{3,4}\s+\d{4})\s+(Abonos|Cargos)\s+(\S+)\s+(.+?)\s+(-?\$[\d.,]+)\s*$"
        )
        noise_re = re.compile(
            r"^(?:P[aá]gina\s+\d+\s+de\s+\d+|©|©|Banco BICE|Fecha\s+Categor|"
            r"Saldos diarios|Resumen del periodo|Tu Ejecutiva|Nombre\s+Email|Sucursal|"
            r"\$\d|--|Sobregiro)",
            re.IGNORECASE,
        )

        rows: list[dict] = []
        current: dict | None = None
        for raw in section_text.splitlines():
            ln = raw.strip()
            if not ln or noise_re.match(ln):
                # ruido de página / encabezados de columna
                continue
            m = start_re.match(ln)
            if m:
                if current:
                    rows.append(current)
                current = {
                    "raw_date": m.group(1),
                    "category": m.group(2),
                    "ref": m.group(3),
                    "desc": m.group(4).strip(),
                    "amount_raw": m.group(5),
                }
            elif current:
                # Línea de continuación: pegar a la descripción
                current["desc"] = f"{current['desc']} {ln}".strip()
        if current:
            rows.append(current)

        for row in rows:
            tx_date = self._parse_spanish_date(row["raw_date"])
            if not tx_date:
                continue
            amount = _to_decimal(row["amount_raw"])
            if amount is None or amount == 0:
                continue
            amount = abs(amount)
            desc = re.sub(r"\s+", " ", row["desc"]).strip()
            if len(desc) < 3:
                continue
            ref = row["ref"] if row["ref"] != "-" else None
            movement_type = "credit" if row["category"].lower() == "abonos" else "debit"

            raw_data: dict = {}
            if ref:
                raw_data["reference_number"] = ref

            # Detectar pago de tarjeta de crédito
            if re.search(r"pago.*tarjeta.*cr[eé]dito|abono.*tarjeta", desc, re.IGNORECASE):
                raw_data["is_credit_card_payment"] = True

            # Detectar transacción FX (ej: "por US$91,16 al tipo de cambio $884,50")
            fx = re.search(
                r"US\$([\d,.]+)\s+al\s+tipo\s+de\s+cambio\s+\$([\d.,]+)",
                desc, re.IGNORECASE,
            )
            if fx:
                fx_amt = _to_decimal(fx.group(1))
                fx_rate = _to_decimal(fx.group(2))
                if fx_amt is not None:
                    raw_data["fx_original_amount"] = str(fx_amt)
                    raw_data["fx_original_currency"] = "USD"
                if fx_rate is not None:
                    raw_data["fx_rate"] = str(fx_rate)

            result.transactions.append({
                "date": tx_date,
                "original_description": desc,
                "normalized_description": desc,
                "amount": amount,
                "currency": "CLP",
                "movement_type": movement_type,
                "raw_data": raw_data,
            })

        return result

    # ================================================================== #
    # TC Nacional — Tarjeta de crédito en CLP (parsing por tablas)         #
    # ================================================================== #

    def _parse_tc_nacional(self, content: bytes, text: str, result: ParseResult) -> ParseResult:
        # ---- Período ------------------------------------------------- #
        period_m = re.search(
            r"Per[ií]?odo Facturado\s+(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})",
            text, re.IGNORECASE,
        )
        if period_m:
            result.period_start = self._parse_clp_date(period_m.group(1))
            result.period_end = self._parse_clp_date(period_m.group(2))

        # NOTA: en TC Nacional NO se setean opening_balance ni closing_balance
        # como anclas de reconciliación porque "Monto Total Facturado a Pagar"
        # NO es un saldo (es el monto a cobrar, distinto eje matemático que
        # el saldo adeudado). Los valores informativos se guardan en raw_data.
        saldo_prev_m = re.search(
            r"Saldo Adeudado Final Per[ií]?odo Anterior\s*\$?\s*(-?[\d,.]+)",
            text, re.IGNORECASE,
        )
        if saldo_prev_m:
            sp = _to_decimal(saldo_prev_m.group(1))
            if sp is not None:
                result.raw_data["saldo_adeudado_prev"] = str(sp)

        tot_m = re.search(
            r"Monto Total Facturado a Pagar\s*\$?\s*(-?[\d,.]+)",
            text, re.IGNORECASE,
        )
        if tot_m:
            tt = _to_decimal(tot_m.group(1))
            if tt is not None:
                result.raw_data["monto_facturado_a_pagar"] = str(tt)

        # TOTAL OPERACIONES — anchor del cuadre neto del período.
        total_op_m = re.search(
            r"1\.\s*TOTAL OPERACIONES\s+(-?[\d,.]+)",
            text, re.IGNORECASE,
        )
        if total_op_m:
            top = _to_decimal(total_op_m.group(1))
            if top is not None:
                result.raw_data["total_operaciones_declarado"] = str(top)

        # ---- Transacciones por tablas -------------------------------- #
        tables_seen = 0
        tables_rejected: list[str] = []
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page_idx, page in enumerate(pdf.pages, start=1):
                    for tbl_idx, table in enumerate(page.extract_tables() or [], start=1):
                        if len(table) < 2:
                            continue
                        tables_seen += 1
                        # Heurística: la tabla de transacciones tiene 8 columnas.
                        # Aceptamos también 7 (variantes que colapsan última col).
                        ncols = max(len(r) for r in table)
                        if ncols < 7:
                            tables_rejected.append(f"p{page_idx}#{tbl_idx} {len(table)}x{ncols}")
                            continue
                        # Esperamos columnas: Lugar | Fecha | CodigoRef | Descripción
                        #                     | MontoOp | MontoTotal | N°Cuota | ValorCuota
                        for row in table:
                            self._parse_tc_nacional_row(row, result)
        except Exception as exc:
            result.warnings.append(f"TC Nacional: error abriendo PDF ({exc.__class__.__name__}).")

        # ---- Fallback: regex sobre texto plano ----------------------- #
        # Si pdfplumber no detectó tablas con ≥7 columnas (PDFs sin líneas
        # de tabla, escaneados re-OCRizados, layouts viejos), intentamos
        # parsear cada fila directamente del texto.
        if not result.transactions:
            self._parse_tc_nacional_text_fallback(text, result)

        # ---- Diagnóstico accionable ---------------------------------- #
        if not result.transactions:
            snippet = "\n".join(
                ln for ln in text.splitlines()[:40] if ln.strip()
            )[:600]
            details = (
                f"tablas detectadas={tables_seen}, "
                f"rechazadas por columnas={len(tables_rejected)}"
                + (f" [{', '.join(tables_rejected[:5])}]" if tables_rejected else "")
            )
            result.warnings.append(
                f"TC Nacional: 0 transacciones extraídas ({details}). "
                f"Muestra de texto:\n{snippet}"
            )

        return result

    _TC_NACIONAL_ROW_RE = re.compile(
        r"^(?P<lugar>.+?)\s+"
        r"(?P<fecha>\d{2}/\d{2}/\d{2,4})\s+"
        r"(?P<ref>\S+)\s+"
        r"(?P<desc>.+?)\s+"
        r"(?P<monto_op>-?[\d.,]+)\s+"
        r"(?P<monto_tot>-?[\d.,]+)\s+"
        r"(?P<cuota>\d{1,2}/\d{1,2})\s+"
        r"(?P<valor>-?[\d.,]+)\s*$"
    )

    def _parse_tc_nacional_text_fallback(self, text: str, result: ParseResult) -> None:
        """Fallback de texto plano para TC Nacional.

        Las filas siguen el layout:
          LUGAR  DD/MM/YY  REF  DESCRIPCIÓN  MONTO_OP  MONTO_TOT  CC/TT  VALOR_CUOTA
        """
        for raw in text.splitlines():
            ln = raw.strip()
            if not ln or len(ln) < 25:
                continue
            if "TOTAL OPERACIONES" in ln.upper():
                continue
            m = self._TC_NACIONAL_ROW_RE.match(ln)
            if not m:
                continue
            tx_date = self._parse_clp_date(m.group("fecha"))
            if not tx_date:
                continue
            monto_op = _to_decimal(m.group("monto_op"))
            valor = _to_decimal(m.group("valor"))
            amount = valor if valor is not None else monto_op
            if amount is None or amount == 0:
                continue
            desc = re.sub(r"\s+", " ", m.group("desc")).strip()
            if not desc or len(desc) < 3:
                continue
            movement_type = "credit" if amount < 0 else "debit"
            cuota = m.group("cuota").split("/")
            raw_data: dict = {
                "lugar": m.group("lugar").strip(),
                "codigo_referencia": m.group("ref").strip(),
            }
            if len(cuota) == 2:
                raw_data["installment_current"] = cuota[0].strip()
                raw_data["installment_total"] = cuota[1].strip()
            if monto_op is not None and valor is not None and monto_op != valor:
                raw_data["monto_operacion_total"] = str(abs(monto_op))
            result.transactions.append({
                "date": tx_date,
                "original_description": desc,
                "normalized_description": desc,
                "amount": abs(amount),
                "currency": "CLP",
                "movement_type": movement_type,
                "raw_data": raw_data,
            })

    def _parse_tc_nacional_row(self, row: list, result: ParseResult) -> None:
        # Esperamos 7-8 celdas. Encontrar la fecha DD/MM/YY en alguna columna.
        cells = [str(c) if c is not None else "" for c in row]
        date_idx = None
        for i, c in enumerate(cells):
            if re.match(r"^\s*\d{2}/\d{2}/\d{2,4}\s*$", c.strip()):
                date_idx = i
                break
        if date_idx is None:
            return
        tx_date = self._parse_clp_date(cells[date_idx].strip())
        if not tx_date:
            return

        # Layout esperado (con date_idx=1):
        #   [0]=lugar  [1]=fecha  [2]=ref  [3]=desc  [4]=monto_op
        #   [5]=monto_total  [6]=n°cuota  [7]=valor_cuota_mensual
        try:
            lugar = cells[date_idx - 1].strip() if date_idx > 0 else ""
            ref = cells[date_idx + 1].strip() if date_idx + 1 < len(cells) else ""
            desc = cells[date_idx + 2].strip() if date_idx + 2 < len(cells) else ""
            monto_op = _to_decimal(cells[date_idx + 3]) if date_idx + 3 < len(cells) else None
            valor_cuota = _to_decimal(cells[-1]) if cells else None
            cuota_info = cells[date_idx + 5].strip() if date_idx + 5 < len(cells) else ""
        except Exception:
            return

        if monto_op is None and valor_cuota is None:
            return
        # Usar valor_cuota como monto del mes (lo que realmente se factura este período).
        # Si no hay cuota, monto_op = valor_cuota.
        amount = valor_cuota if valor_cuota is not None else monto_op
        if amount is None or amount == 0:
            return

        # Limpiar la descripción (quitar saltos de línea internos)
        desc = re.sub(r"\s+", " ", desc).strip()
        if not desc or "TOTAL OPERACIONES" in desc.upper():
            return

        # Signo: negativo = pago (credit), positivo = cargo/compra (debit)
        movement_type = "credit" if amount < 0 else "debit"
        amount = abs(amount)

        cuota_parts = cuota_info.split("/") if "/" in cuota_info else []

        raw_data: dict = {"lugar": lugar, "codigo_referencia": ref}
        if len(cuota_parts) == 2:
            raw_data["installment_current"] = cuota_parts[0].strip()
            raw_data["installment_total"] = cuota_parts[1].strip()
        if monto_op is not None and valor_cuota is not None and monto_op != valor_cuota:
            raw_data["monto_operacion_total"] = str(abs(monto_op))

        result.transactions.append({
            "date": tx_date,
            "original_description": desc,
            "normalized_description": desc,
            "amount": amount,
            "currency": "CLP",
            "movement_type": movement_type,
            "raw_data": raw_data,
        })

    # ================================================================== #
    # TC Internacional — Tarjeta de crédito en USD (parsing por tablas)    #
    # ================================================================== #

    def _parse_tc_internacional(self, content: bytes, text: str, result: ParseResult) -> ParseResult:
        # ---- Período ------------------------------------------------- #
        d_m = re.search(
            r"Per[ií]?odo de Facturaci[oó]?n Desde\s+(\d{2}/\d{2}/\d{4})",
            text, re.IGNORECASE,
        )
        h_m = re.search(
            r"Per[ií]?odo de Facturaci[oó]?n Hasta\s+(\d{2}/\d{2}/\d{4})",
            text, re.IGNORECASE,
        )
        if d_m:
            result.period_start = self._parse_clp_date(d_m.group(1))
        if h_m:
            result.period_end = self._parse_clp_date(h_m.group(1))

        # ---- Saldos --------------------------------------------------- #
        # Saldo Anterior Facturado = opening_balance
        # Abono Realizado = total_credit
        # Deuda Total = closing_balance
        ant_m = re.search(r"Saldo Anterior Facturado\s+US\$\s*(-?[\d,.]+)", text, re.IGNORECASE)
        if ant_m:
            result.opening_balance = _to_decimal(ant_m.group(1))
        ab_m = re.search(r"Abono Realizado\s+US\$\s*(-?[\d,.]+)", text, re.IGNORECASE)
        if ab_m:
            result.total_credit = _to_decimal(ab_m.group(1))
        deuda_m = re.search(r"Deuda Total\s+US\$\s*(-?[\d,.]+)", text, re.IGNORECASE)
        if deuda_m:
            result.closing_balance = _to_decimal(deuda_m.group(1))

        # ---- Subtotales por sección (anchors adicionales) ------------ #
        # "TOTAL DE COMPRAS 307.43" → total_debit
        compras_m = re.search(r"TOTAL DE COMPRAS\s+(-?[\d,.]+)", text, re.IGNORECASE)
        if compras_m:
            result.total_debit = _to_decimal(compras_m.group(1))

        # ---- Transacciones por tablas -------------------------------- #
        # Layout: NumRef | Fecha | Descripción | Ciudad | País | MontoOrigen | MontoUSD
        try:
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                current_section = "debit"  # default si no hay encabezado
                for page in pdf.pages:
                    for table in page.extract_tables() or []:
                        if len(table) < 2:
                            continue
                        ncols = max(len(r) for r in table)
                        if ncols < 5:
                            continue
                        for row in table:
                            current_section = self._parse_tc_int_row(
                                row, result, current_section
                            )
        except Exception:
            pass

        return result

    def _parse_tc_int_row(self, row: list, result: ParseResult, current_section: str) -> str:
        cells = [str(c) if c is not None else "" for c in row]
        joined = " | ".join(cells).upper()

        # Cambio de sección (encabezados de subtotal)
        if "TOTAL DE PAGOS" in joined:
            return "credit"
        if "TOTAL DE COMPRAS" in joined:
            return "debit"
        if "COMISIONES" in joined and ("ABONOS" in joined or "CARGOS" in joined):
            # Sección mixta: el signo del monto manda; default debit.
            return "mixed"

        # Buscar fecha DD/MM/YY
        date_idx = None
        for i, c in enumerate(cells):
            if re.match(r"^\s*\d{2}/\d{2}/\d{2,4}\s*$", c.strip()):
                date_idx = i
                break
        if date_idx is None:
            return current_section
        tx_date = self._parse_clp_date(cells[date_idx].strip())
        if not tx_date:
            return current_section

        # Monto USD = última celda no vacía con número
        amount_usd = None
        amount_origin = None
        for c in reversed(cells):
            d = _to_decimal(c)
            if d is not None:
                amount_usd = d
                break
        if amount_usd is None or amount_usd == 0:
            return current_section
        # Monto origen = penúltima celda no vacía con número (si existe)
        seen_first = False
        for c in reversed(cells):
            d = _to_decimal(c)
            if d is not None:
                if not seen_first:
                    seen_first = True
                    continue
                amount_origin = d
                break

        # Decidir tipo de movimiento
        if current_section == "credit":
            movement_type = "credit"
        elif current_section == "mixed":
            movement_type = "credit" if amount_usd < 0 else "debit"
        else:
            movement_type = "credit" if amount_usd < 0 else "debit"

        # Descripción: celdas entre fecha y los montos
        desc_cells = cells[date_idx + 1:]
        # Quitar celdas numéricas del final (montos)
        while desc_cells and _to_decimal(desc_cells[-1]) is not None:
            desc_cells.pop()
        desc = re.sub(r"\s+", " ", " ".join(c for c in desc_cells if c).strip())
        if not desc:
            return current_section

        ref = cells[date_idx - 1].strip() if date_idx > 0 else ""

        raw_data: dict = {}
        if ref:
            raw_data["reference_number"] = ref
        if amount_origin is not None and amount_origin != amount_usd:
            raw_data["amount_origin"] = str(abs(amount_origin))

        result.transactions.append({
            "date": tx_date,
            "original_description": desc,
            "normalized_description": desc,
            "amount": abs(amount_usd),
            "currency": "USD",
            "movement_type": movement_type,
            "raw_data": raw_data,
        })
        return current_section
