"""add user_id to transactions

Revision ID: 0003_add_user_id_to_transactions
Revises: 0002_statement_previews
Create Date: 2026-05-28 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0003_add_user_id_to_transactions"
down_revision: Union[str, None] = "0002_statement_previews"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Se añade nullable para poder rellenar filas existentes antes de exigir
    # NOT NULL.
    op.add_column("transactions", sa.Column("user_id", UUID, nullable=True))
    # Backfill: cada transacción hereda el dueño de su cuenta.
    op.execute(
        "UPDATE transactions SET user_id = accounts.user_id "
        "FROM accounts WHERE transactions.account_id = accounts.id "
        "AND transactions.user_id IS NULL"
    )
    op.create_index(op.f("ix_transactions_user_id"), "transactions", ["user_id"])
    op.create_foreign_key(
        "fk_transactions_user_id_users",
        "transactions",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # El modelo declara user_id obligatorio; reflejarlo en el esquema.
    op.alter_column("transactions", "user_id", nullable=False)


def downgrade() -> None:
    op.drop_constraint("fk_transactions_user_id_users", "transactions", type_="foreignkey")
    op.drop_index(op.f("ix_transactions_user_id"), table_name="transactions")
    op.drop_column("transactions", "user_id")
