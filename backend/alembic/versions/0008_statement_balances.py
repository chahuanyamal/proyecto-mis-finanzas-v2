"""statement balances

Revision ID: 0008_statement_balances
Revises: 0007_audit_events
Create Date: 2026-05-29 00:00:08.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008_statement_balances"
down_revision: Union[str, None] = "0007_audit_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("uploaded_files", sa.Column("opening_balance", sa.Numeric(14, 2), nullable=True))
    op.add_column("uploaded_files", sa.Column("closing_balance", sa.Numeric(14, 2), nullable=True))
    op.add_column("statement_previews", sa.Column("opening_balance", sa.Numeric(14, 2), nullable=True))
    op.add_column("statement_previews", sa.Column("closing_balance", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("statement_previews", "closing_balance")
    op.drop_column("statement_previews", "opening_balance")
    op.drop_column("uploaded_files", "closing_balance")
    op.drop_column("uploaded_files", "opening_balance")
