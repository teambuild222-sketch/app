"""official club verification + Notion join-form write path

Revision ID: 0014
Revises: 0013
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("communities", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("communities", sa.Column("verified_by", sa.String(length=32), nullable=True))
    op.add_column(
        "communities",
        sa.Column("verification_note", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column("communities", sa.Column("join_form_fields", sa.JSON(), nullable=False, server_default="[]"))
    op.create_foreign_key(
        "fk_communities_verified_by",
        "communities",
        "users",
        ["verified_by"],
        ["id"],
    )

    op.add_column("events", sa.Column("community_id", sa.String(length=32), nullable=True))
    op.create_index("ix_events_community_id", "events", ["community_id"])

    op.add_column("event_attendees", sa.Column("form_answers", sa.JSON(), nullable=False, server_default="{}"))

    op.create_table(
        "notion_connections",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("club_id", sa.String(length=32), sa.ForeignKey("communities.id"), nullable=False),
        sa.Column("workspace_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("workspace_name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("workspace_icon", sa.Text(), nullable=False, server_default=""),
        sa.Column("bot_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("access_token_enc", sa.Text(), nullable=False, server_default=""),
        sa.Column("refresh_token_enc", sa.Text(), nullable=False, server_default=""),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="connected"),
        sa.Column("database_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("database_title", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("last_error", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("connected_by", sa.String(length=32), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_notion_connections_club_id", "notion_connections", ["club_id"], unique=True)

    op.create_table(
        "notion_oauth_states",
        sa.Column("state", sa.String(length=64), primary_key=True),
        sa.Column("club_id", sa.String(length=32), sa.ForeignKey("communities.id"), nullable=False),
        sa.Column("user_id", sa.String(length=32), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "notion_join_rows",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("club_id", sa.String(length=32), sa.ForeignKey("communities.id"), nullable=False),
        sa.Column("event_id", sa.String(length=32), sa.ForeignKey("events.id"), nullable=False),
        sa.Column("user_id", sa.String(length=32), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("notion_page_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("answers", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("event_id", "user_id", name="uq_notion_join_event_user"),
    )
    op.create_index("ix_notion_join_rows_club_id", "notion_join_rows", ["club_id"])
    op.create_index("ix_notion_join_rows_event_id", "notion_join_rows", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_notion_join_rows_event_id", table_name="notion_join_rows")
    op.drop_index("ix_notion_join_rows_club_id", table_name="notion_join_rows")
    op.drop_table("notion_join_rows")
    op.drop_table("notion_oauth_states")
    op.drop_index("ix_notion_connections_club_id", table_name="notion_connections")
    op.drop_table("notion_connections")
    op.drop_column("event_attendees", "form_answers")
    op.drop_index("ix_events_community_id", table_name="events")
    op.drop_column("events", "community_id")
    op.drop_constraint("fk_communities_verified_by", "communities", type_="foreignkey")
    op.drop_column("communities", "join_form_fields")
    op.drop_column("communities", "verification_note")
    op.drop_column("communities", "verified_by")
    op.drop_column("communities", "verified_at")
