"""transaction parity: notes, flags, internal/duplicate, splits

Revision ID: 0005_transaction_parity
Revises: 0004_goals_and_recurring
Create Date: 2026-05-28 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0005_transaction_parity"
down_revision: Union[str, None] = "0004_goals_and_recurring"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("transactions", sa.Column("is_flagged", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("transactions", sa.Column("flag_reason", sa.String(255), nullable=True))
    op.add_column("transactions", sa.Column("is_internal_transfer", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("transactions", sa.Column("is_duplicate", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        "transaction_splits",
        sa.Column("id", UUID, primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("transaction_id", UUID, sa.ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("category_id", UUID, sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("transaction_splits")
    op.drop_column("transactions", "is_duplicate")
    op.drop_column("transactions", "is_internal_transfer")
    op.drop_column("transactions", "flag_reason")
    op.drop_column("transactions", "is_flagged")
    op.drop_column("transactions", "notes")
