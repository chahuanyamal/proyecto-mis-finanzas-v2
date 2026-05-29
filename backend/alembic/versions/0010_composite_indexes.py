"""add composite indexes

Revision ID: 0010_composite_indexes
Revises: 0009_notifications
Create Date: 2026-05-29
"""
from __future__ import annotations

from alembic import op

revision = "0010_composite_indexes"
down_revision = "0009_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_transactions_user_date", "transactions", ["user_id", "date"])
    op.create_index("ix_transactions_user_category", "transactions", ["user_id", "category_id"])
    op.create_index("ix_transactions_account_date", "transactions", ["account_id", "date"])
    op.create_index("ix_transactions_user_movement", "transactions", ["user_id", "movement_type"])


def downgrade() -> None:
    op.drop_index("ix_transactions_user_movement", table_name="transactions")
    op.drop_index("ix_transactions_account_date", table_name="transactions")
    op.drop_index("ix_transactions_user_category", table_name="transactions")
    op.drop_index("ix_transactions_user_date", table_name="transactions")
