"""Módulo AI: sugerencias de categorización para transacciones sin categoría."""
from __future__ import annotations

import re
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.category_rule import CategoryRule
from app.models.transaction import Transaction
from app.models.user import User


class AiCategorizationService:
    def __init__(self, db: AsyncSession, user: User):
        self.db = db
        self.user = user

    async def suggest_categories(self, top_n: int = 20) -> list[dict]:
        rules_result = await self.db.execute(
            select(CategoryRule)
            .where(CategoryRule.user_id == self.user.id)
            .order_by(CategoryRule.priority.desc())
        )
        rules = list(rules_result.scalars().all())

        categories_result = await self.db.execute(
            select(Category)
            .where((Category.user_id == self.user.id) | (Category.user_id.is_(None)))
        )
        categories = {c.id: c for c in categories_result.scalars().all()}

        transactions_result = await self.db.execute(
            select(Transaction)
            .join(Category)
            .where(Transaction.user_id == self.user.id, Transaction.category_id.is_not(None))
            .order_by(Transaction.date.desc())
            .limit(2000)
        )
        classified = transactions_result.scalars().all()

        keyword_map: dict[str, tuple[str, int]] = {}
        for tx in classified:
            desc_lower = tx.description.lower()
            words = re.findall(r"\b[a-záéíóúñ]{4,}\b", desc_lower)
            for word in words:
                if word in ("para", "transfer", "pago", "banco", "cuenta", "debito", "credito"):
                    continue
                current = keyword_map.get(word, ("", 0))
                keyword_map[word] = (tx.category_id, current[1] + 1)

        uncat_result = await self.db.execute(
            select(Transaction)
            .join(Category)
            .where(
                Transaction.user_id == self.user.id,
                Transaction.category_id.is_(None),
            )
            .order_by(Transaction.date.desc())
            .limit(100)
        )
        uncategorized = list(uncat_result.scalars().all())

        suggestions = []
        for tx in uncategorized:
            best_category_id = None
            best_score = 0

            for rule in rules:
                field_val = getattr(tx, rule.field, "") or ""
                if rule.operator == "contains" and rule.pattern.lower() in field_val.lower():
                    score = 10
                elif rule.operator == "starts_with" and field_val.lower().startswith(rule.pattern.lower()):
                    score = 8
                elif rule.operator == "equals" and field_val.lower() == rule.pattern.lower():
                    score = 12
                else:
                    score = 0
                if score > best_score:
                    best_score = score
                    best_category_id = rule.target_category_id

            if best_category_id is None:
                desc_lower = tx.description.lower()
                words = re.findall(r"\b[a-záéíóúñ]{4,}\b", desc_lower)
                scores: dict[str, int] = defaultdict(int)
                for word in words:
                    if word in ("para", "transfer", "pago", "banco", "cuenta", "debito", "credito"):
                        continue
                    cat_id, cnt = keyword_map.get(word, (None, 0))
                    if cat_id:
                        scores[cat_id] += cnt
                if scores:
                    best_category_id = max(scores, key=lambda k: scores[k])
                    best_score = scores[best_category_id] * 0.5

            if best_category_id:
                cat = categories.get(best_category_id)
                suggestions.append({
                    "transaction_id": str(tx.id),
                    "date": tx.date.isoformat(),
                    "description": tx.description,
                    "amount": str(tx.amount),
                    "movement_type": tx.movement_type,
                    "suggested_category_id": str(best_category_id),
                    "suggested_category_name": cat.name if cat else None,
                    "confidence": min(best_score / 20, 1.0) if best_score else 0.0,
                })

        return suggestions[:top_n]

    async def apply_suggestion(self, transaction_id: str, category_id: str) -> bool:
        result = await self.db.execute(
            select(Transaction)
            .where(Transaction.id == transaction_id, Transaction.user_id == self.user.id)
        )
        tx = result.scalar_one_or_none()
        if tx is None:
            return False
        tx.category_id = category_id
        await self.db.commit()
        return True

    async def apply_bulk(self, suggestions: list[dict]) -> dict[str, int]:
        updated = 0
        for s in suggestions:
            ok = await self.apply_suggestion(s["transaction_id"], s["suggested_category_id"])
            if ok:
                updated += 1
        return {"updated": updated}

# ─────────────────────────────────────────────────────────────────────────────
# Asistente conversacional: configuración por usuario + cliente LLM
# OpenAI-compatible (Ollama / OpenRouter / NVIDIA NIM / custom).
# ─────────────────────────────────────────────────────────────────────────────
import datetime  # noqa: E402
import httpx  # noqa: E402
from sqlalchemy import func  # noqa: E402
from app.models.account import Account  # noqa: E402

_DEFAULT_PROVIDERS = {
    "ollama": "http://localhost:11434/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "nvidia": "https://integrate.api.nvidia.com/v1",
}


def get_ai_config(user: User) -> dict:
    ai = dict((user.preferences or {}).get("ai") or {})
    return {
        "provider": ai.get("provider", "ollama"),
        "base_url": ai.get("base_url", ""),
        "model": ai.get("model", ""),
        "token": ai.get("token", ""),
    }


def resolved_base_url(cfg: dict) -> str:
    return (cfg.get("base_url") or _DEFAULT_PROVIDERS.get(cfg.get("provider", ""), "")).rstrip("/")


def is_ai_enabled(cfg: dict) -> bool:
    return bool(resolved_base_url(cfg) and cfg.get("model"))


async def build_finance_context(db: AsyncSession, user: User, currency: str) -> tuple[str, list[str]]:
    today = datetime.date.today()
    month_start = today.replace(day=1)
    used: list[str] = []
    lines = [f"Fecha actual: {today.isoformat()}. Moneda: {currency}."]

    rows = await db.execute(
        select(Transaction.movement_type, func.coalesce(func.sum(Transaction.amount), 0))
        .join(Account)
        .where(Account.user_id == user.id, Transaction.user_id == user.id,
               Transaction.date >= month_start, Transaction.currency == currency,
               Transaction.is_internal_transfer.is_(False), Transaction.is_duplicate.is_(False))
        .group_by(Transaction.movement_type)
    )
    by = {r[0]: Decimal(r[1]) for r in rows.all()}
    inc, exp = by.get("income", Decimal(0)), by.get("expense", Decimal(0))
    lines.append(f"Mes en curso — ingresos: {inc}, gastos: {exp}, neto: {inc - exp}.")
    used.append("totales del mes")

    cat_rows = await db.execute(
        select(Category.name, func.coalesce(func.sum(Transaction.amount), 0))
        .join(Transaction, Transaction.category_id == Category.id)
        .join(Account, Account.id == Transaction.account_id)
        .where(Account.user_id == user.id, Transaction.user_id == user.id,
               Transaction.movement_type == "expense", Transaction.date >= month_start,
               Transaction.currency == currency,
               Transaction.is_internal_transfer.is_(False), Transaction.is_duplicate.is_(False))
        .group_by(Category.name).order_by(func.sum(Transaction.amount).desc()).limit(8)
    )
    cats = [f"{name}: {total}" for name, total in cat_rows.all()]
    if cats:
        lines.append("Gasto por categoría (mes): " + "; ".join(cats) + ".")
        used.append("gasto por categoría")

    acc_rows = await db.execute(select(Account.name, Account.balance, Account.currency).where(Account.user_id == user.id))
    accs = [f"{n} ({c}): {b}" for n, b, c in acc_rows.all()]
    if accs:
        lines.append("Cuentas: " + "; ".join(accs[:12]) + ".")
        used.append("saldos de cuentas")

    return "\n".join(lines), used


async def call_llm(cfg: dict, system: str, question: str, timeout: float = 30.0) -> str:
    base = resolved_base_url(cfg)
    if not base:
        raise ValueError("Proveedor sin endpoint configurado")
    headers = {"Content-Type": "application/json"}
    if cfg.get("token"):
        headers["Authorization"] = f"Bearer {cfg['token']}"
    payload = {
        "model": cfg["model"],
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": question}],
        "temperature": 0.2,
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{base}/chat/completions", json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"].strip()
