"""add target_tag_id to category_rules (auto-tagging)

Revision ID: 0011_rule_target_tag
Revises: 0010_composite_indexes
Create Date: 2026-05-30 00:00:11.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_rule_target_tag"
down_revision: str | None = "0010_composite_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("category_rules", sa.Column("target_tag_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_category_rules_target_tag_id",
        "category_rules", "tags",
        ["target_tag_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_category_rules_target_tag_id", "category_rules", type_="foreignkey")
    op.drop_column("category_rules", "target_tag_id")
