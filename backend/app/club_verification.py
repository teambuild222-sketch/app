"""Official-club verification.

The team reviews a club in person, then marks it verified in /api/admin.
This module computes a checklist so reviewers can see what's already in place;
it does not auto-verify. Only `verified_at` unlocks Notion.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.models import Community, NotionConnection

MIN_MEMBERS = 2

DEFAULT_JOIN_FIELDS: list[dict[str, Any]] = [
    {"id": "fld_name", "key": "Name", "type": "title", "required": True},
    {"id": "fld_email", "key": "Email", "type": "email", "required": True},
    {"id": "fld_phone", "key": "Phone", "type": "phone", "required": False},
    {"id": "fld_notes", "key": "Notes", "type": "text", "required": False},
]

ALLOWED_FIELD_TYPES = frozenset(
    {"title", "text", "email", "phone", "number", "date", "url", "checkbox", "select"}
)


def evaluate_requirements(
    *,
    name: str,
    avatar_url: str,
    member_count: int,
    has_chat: bool,
) -> list[dict[str, Any]]:
    return [
        {"id": "name", "label": "Club has a public name", "met": bool((name or "").strip())},
        {"id": "avatar", "label": "Club has a profile photo", "met": bool((avatar_url or "").strip())},
        {
            "id": "members",
            "label": f"Club has at least {MIN_MEMBERS} members",
            "met": member_count >= MIN_MEMBERS,
        },
        {"id": "chat", "label": "Club chat is set up", "met": bool(has_chat)},
    ]


def is_club_verified(community: Community) -> bool:
    return community.verified_at is not None


def apply_verification(
    community: Community,
    *,
    admin_id: str,
    verified: bool,
    note: str = "",
    connection: NotionConnection | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    community.verification_note = (note or "").strip()
    if verified:
        community.verified_at = now
        community.verified_by = admin_id
        if not community.join_form_fields:
            community.join_form_fields = [dict(field) for field in DEFAULT_JOIN_FIELDS]
        if connection is not None and connection.status == "paused":
            connection.status = "connected" if connection.access_token_enc else "needs_reconnect"
            connection.last_error = ""
        return

    community.verified_at = None
    community.verified_by = None
    if connection is not None and connection.status == "connected":
        connection.status = "paused"


def normalize_join_fields(raw: list[Any] | None) -> list[dict[str, Any]]:
    """Keep only editable sheet columns. Always exactly one `title` field."""
    cleaned: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    has_title = False
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()[:80]
        if not key or key.lower() in seen_keys:
            continue
        field_type = str(item.get("type") or "text").strip().lower()
        if field_type not in ALLOWED_FIELD_TYPES:
            field_type = "text"
        if field_type == "title":
            if has_title:
                field_type = "text"
            else:
                has_title = True
        field_id = str(item.get("id") or "").strip() or f"fld_{uuid.uuid4().hex[:10]}"
        cleaned.append(
            {
                "id": field_id,
                "key": key,
                "type": field_type,
                "required": bool(item.get("required")),
            }
        )
        seen_keys.add(key.lower())

    if not has_title:
        cleaned.insert(0, dict(DEFAULT_JOIN_FIELDS[0]))
    if not cleaned:
        return [dict(field) for field in DEFAULT_JOIN_FIELDS]
    return cleaned
