"""add user_id to categories

Revision ID: 0004_add_user_id_to_categories
Revises: 0003_add_user_id_to_transactions
Create Date: 2026-05-28 00:00:01.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0004_add_user_id_to_categories"
down_revision: Union[str, None] = "0003_add_user_id_to_transactions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: las categorías sembradas quedan con user_id NULL (sistema,
    # compartidas y de solo lectura). Las creadas por usuarios llevan su id.
    op.add_column("categories", sa.Column("user_id", UUID, nullable=True))
    op.create_index(op.f("ix_categories_user_id"), "categories", ["user_id"])
    op.create_foreign_key(
        "fk_categories_user_id_users",
        "categories",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_categories_user_id_users", "categories", type_="foreignkey")
    op.drop_index(op.f("ix_categories_user_id"), table_name="categories")
    op.drop_column("categories", "user_id")
