"""goal contributions

Revision ID: 0006_goal_contributions
Revises: 0005_revoked_tokens
Create Date: 2026-05-28 00:00:03.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0006_goal_contributions"
down_revision: Union[str, None] = "0005_revoked_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "goal_contributions",
        sa.Column("id", UUID, primary_key=True, default=sa.text("gen_random_uuid()")),
        sa.Column("goal_id", UUID, sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(op.f("ix_goal_contributions_goal_id"), "goal_contributions", ["goal_id"])
    op.create_index(op.f("ix_goal_contributions_user_id"), "goal_contributions", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_goal_contributions_user_id"), table_name="goal_contributions")
    op.drop_index(op.f("ix_goal_contributions_goal_id"), table_name="goal_contributions")
    op.drop_table("goal_contributions")
