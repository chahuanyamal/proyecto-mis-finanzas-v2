"""Tests para el servicio AI de categorización."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.modules.ai.service import AiCategorizationService


@pytest.fixture
def mock_db():
    return AsyncMock()


@pytest.fixture
def mock_user():
    user = MagicMock()
    user.id = "user-123"
    return user


@pytest.mark.asyncio
async def test_suggest_categories_returns_list(mock_db, mock_user):
    service = AiCategorizationService(mock_db, mock_user)

    with patch.object(service, "suggest_categories", new_callable=AsyncMock) as mock:
        mock.return_value = [
            {
                "transaction_id": "tx-1",
                "date": "2026-01-15",
                "description": "Compra supermercado",
                "amount": "45000",
                "movement_type": "expense",
                "suggested_category_id": "cat-1",
                "suggested_category_name": "Supermercado",
                "confidence": 0.85,
            }
        ]
        result = await service.suggest_categories(top_n=5)
        assert len(result) == 1
        assert result[0]["suggested_category_name"] == "Supermercado"


@pytest.mark.asyncio
async def test_apply_suggestion_updates_transaction(mock_db, mock_user):
    service = AiCategorizationService(mock_db, mock_user)

    mock_tx = MagicMock()
    mock_tx.id = "tx-1"
    mock_tx.category_id = None

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_tx

    mock_db.execute.return_value = mock_result

    ok = await service.apply_suggestion("tx-1", "cat-new")
    assert ok is True
    assert mock_tx.category_id == "cat-new"