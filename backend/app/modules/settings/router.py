from __future__ import annotations

import datetime
import io
import json
import uuid
import zipfile

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.account import Account
from app.models.audit import AuditEvent
from app.models.budget import Budget
from app.models.category import Category
from app.models.category_rule import CategoryRule
from app.models.goal import Goal, GoalContribution
from app.models.recurring import RecurringExpense
from app.models.statement_preview import StatementPreview
from app.models.tag import Tag
from app.models.transaction import Transaction
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.modules.auth.deps import get_current_user
from app.modules.settings.schemas import SettingsOut, SettingsUpdate

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])

_IMPORT_MAX_BYTES = 25 * 1024 * 1024
_IMPORT_MAX_ROWS = 5000

_IMPORT_ALLOWED = {
    "accounts": frozenset({
        "name", "account_type", "currency", "balance", "institution_id",
        "is_active", "is_investment", "notes",
    }),
    "categories": frozenset({"name", "color", "icon", "parent_id"}),
    "tags": frozenset({"name", "color"}),
    "budgets": frozenset({"amount", "month", "alert_at_percent", "category_id"}),
    "goals": frozenset({"name", "target_amount", "current_amount", "currency", "target_date"}),
    "goal_contributions": frozenset({"goal_id", "amount", "date", "note"}),
    "category_rules": frozenset({"pattern", "field", "operator", "target_category_id", "priority"}),
    "recurring_expenses": frozenset({
        "name", "amount", "currency", "movement_type", "frequency",
        "next_date", "category_id", "active",
    }),
}


def _serialize(val):
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.isoformat()
    if isinstance(val, uuid.UUID):
        return str(val)
    return val


def _row_to_dict(row, model) -> dict:
    return {col.key: _serialize(getattr(row, col.key)) for col in model.__table__.columns}


@router.get("", response_model=SettingsOut)
async def get_settings(current_user: User = Depends(get_current_user)) -> SettingsOut:
    return SettingsOut(
        email=current_user.email,
        full_name=current_user.full_name,
        preferences=current_user.preferences or {},
    )


@router.patch("", response_model=SettingsOut)
async def update_settings(
    body: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SettingsOut:
    if body.full_name is not None:
        current_user.full_name = body.full_name
    if body.preferences is not None:
        merged = dict(current_user.preferences or {})
        merged.update(body.preferences)
        current_user.preferences = merged
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return SettingsOut(
        email=current_user.email,
        full_name=current_user.full_name,
        preferences=current_user.preferences or {},
    )


@router.get("/backup")
async def export_user_backup(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Exporta todos los datos del usuario como ZIP con data.json."""
    uid = current_user.id
    data: dict[str, list[dict]] = {}

    for model, key in [
        (Account, "accounts"),
        (Category, "categories"),
        (Tag, "tags"),
        (Budget, "budgets"),
        (Goal, "goals"),
        (GoalContribution, "goal_contributions"),
        (CategoryRule, "category_rules"),
        (RecurringExpense, "recurring_expenses"),
        (UploadedFile, "uploaded_files"),
        (StatementPreview, "statement_previews"),
        (AuditEvent, "audit_events"),
    ]:
        rows = await db.execute(select(model).where(model.user_id == uid))
        data[key] = [_row_to_dict(r, model) for r in rows.scalars().all()]

    tx_rows = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == uid)
        .order_by(Transaction.date.desc())
        .limit(10000)
    )
    data["transactions"] = [_row_to_dict(r, Transaction) for r in tx_rows.scalars().all()]

    meta = {
        "version": "1.0",
        "exported_at": datetime.datetime.now(datetime.UTC).isoformat(),
        "user_email": current_user.email,
        "counts": {k: len(v) for k, v in data.items()},
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.json", json.dumps(data, default=_serialize, ensure_ascii=False, indent=2))
        zf.writestr("meta.json", json.dumps(meta, default=str, ensure_ascii=False, indent=2))
    buf.seek(0)

    filename = f"finanzas-backup-{uid}-{datetime.datetime.now(datetime.UTC).strftime('%Y%m%d-%H%M%S')}.zip"
    from starlette.responses import StreamingResponse
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/backup/import")
async def import_user_backup(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Importa datos desde un archivo ZIP de respaldo (solo inserta, no sobreescribe)."""
    content = await file.read(_IMPORT_MAX_BYTES + 1)
    if len(content) > _IMPORT_MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Archivo demasiado grande (max 25MB)")

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
        if "data.json" not in zf.namelist():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta data.json en el ZIP")
        raw = json.loads(zf.read("data.json"))
    except (zipfile.BadZipFile, json.JSONDecodeError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"ZIP invalido: {e}") from e

    uid = current_user.id
    imported: dict[str, int] = {}

    for model_cls, key, fk_field in [
        (Account, "accounts", "user_id"),
        (Category, "categories", "user_id"),
        (Tag, "tags", "user_id"),
        (Budget, "budgets", "user_id"),
        (Goal, "goals", "user_id"),
        (CategoryRule, "category_rules", "user_id"),
        (RecurringExpense, "recurring_expenses", "user_id"),
    ]:
        rows = raw.get(key, [])
        allowed = _IMPORT_ALLOWED.get(key, frozenset())
        count = 0
        for d in rows:
            if not isinstance(d, dict):
                continue
            payload = {k: v for k, v in d.items() if k in allowed}
            payload[fk_field] = uid
            db.add(model_cls(id=uuid.uuid4(), **payload))
            count += 1
        imported[key] = count

    await db.flush()
    return {"imported": imported, "message": "Importacion completada"}
