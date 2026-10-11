"""Map editable join-sheet columns to Notion database properties and pages."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.club_verification import is_club_verified
from app.models import Community, NotionConnection, NotionJoinRow
from app.notion_client import (
    NotionApiError,
    NotionAuthError,
    create_database_page,
    refresh_access_token,
    retrieve_database,
    search_databases,
    update_database_properties,
)
from app.notion_crypto import decrypt_secret, encrypt_secret

logger = logging.getLogger("simsor.notion")

NOTION_PROP: dict[str, dict[str, Any]] = {
    "title": {"title": {}},
    "text": {"rich_text": {}},
    "email": {"email": {}},
    "phone": {"phone_number": {}},
    "number": {"number": {}},
    "date": {"date": {}},
    "url": {"url": {}},
    "checkbox": {"checkbox": {}},
    "select": {"select": {}},
}


def connection_public_status(connection: NotionConnection | None, verified: bool) -> str:
    if not verified:
        return "locked"
    if connection is None:
        return "not_connected"
    if connection.status == "needs_reconnect":
        return "needs_reconnect"
    if connection.status == "paused":
        return "paused"
    if connection.status == "connected" and not connection.database_id:
        return "connected"
    if connection.status == "connected":
        return "connected"
    return connection.status


async def valid_access_token(db: AsyncSession, connection: NotionConnection) -> str | None:
    token = decrypt_secret(connection.access_token_enc)
    expires = connection.token_expires_at
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    still_good = token and (expires is None or expires > datetime.now(timezone.utc).replace(microsecond=0))
    if still_good and expires is None:
        return token
    if still_good and expires is not None and expires > datetime.now(timezone.utc):
        return token

    refresh = decrypt_secret(connection.refresh_token_enc)
    if not refresh:
        connection.status = "needs_reconnect"
        connection.last_error = "reconnect_required"
        return None
    try:
        payload = await refresh_access_token(refresh)
    except NotionAuthError:
        connection.status = "needs_reconnect"
        connection.last_error = "reconnect_required"
        connection.access_token_enc = ""
        connection.refresh_token_enc = ""
        logger.info("notion_refresh_invalid club_id=%s", connection.club_id)
        return None
    except NotionApiError:
        connection.last_error = "refresh_failed"
        logger.info("notion_refresh_failed club_id=%s", connection.club_id)
        return None

    new_access = str(payload.get("access_token") or "")
    new_refresh = str(payload.get("refresh_token") or refresh)
    if not new_access:
        connection.status = "needs_reconnect"
        connection.last_error = "reconnect_required"
        return None
    connection.access_token_enc = encrypt_secret(new_access)
    connection.refresh_token_enc = encrypt_secret(new_refresh)
    expires_in = payload.get("expires_in")
    if isinstance(expires_in, (int, float)) and expires_in > 0:
        connection.token_expires_at = datetime.now(timezone.utc).replace(microsecond=0)
        from datetime import timedelta

        connection.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in) - 60)
    connection.last_error = ""
    connection.status = "connected"
    await db.flush()
    return new_access


def answers_to_properties(fields: list[dict[str, Any]], answers: dict[str, Any]) -> dict[str, Any]:
    props: dict[str, Any] = {}
    for field in fields:
        key = str(field.get("key") or "")
        if not key:
            continue
        raw = answers.get(key)
        if raw is None:
            raw = answers.get(str(field.get("id") or ""))
        text = "" if raw is None else str(raw).strip()
        field_type = str(field.get("type") or "text")
        if field_type == "title":
            props[key] = {"title": [{"text": {"content": text[:2000] or "—"}}]}
        elif field_type == "email":
            props[key] = {"email": text or None}
        elif field_type == "phone":
            props[key] = {"phone_number": text or None}
        elif field_type == "url":
            props[key] = {"url": text or None}
        elif field_type == "number":
            try:
                props[key] = {"number": float(text) if text else None}
            except ValueError:
                props[key] = {"number": None}
        elif field_type == "date":
            props[key] = {"date": {"start": text} if text else None}
        elif field_type == "checkbox":
            props[key] = {"checkbox": text.lower() in {"1", "true", "yes", "on"}}
        elif field_type == "select":
            props[key] = {"select": {"name": text[:100]} if text else None}
        else:
            props[key] = {"rich_text": [{"text": {"content": text[:2000]}}] if text else []}
    return props


def missing_property_payload(existing: dict[str, Any], fields: list[dict[str, Any]]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for field in fields:
        key = str(field.get("key") or "")
        if not key or key in existing:
            continue
        field_type = str(field.get("type") or "text")
        payload[key] = dict(NOTION_PROP.get(field_type) or NOTION_PROP["text"])
    return payload


async def sync_database_properties(connection: NotionConnection, access_token: str, fields: list[dict[str, Any]]) -> None:
    if not connection.database_id:
        return
    database = await retrieve_database(access_token, connection.database_id)
    existing = database.get("properties") if isinstance(database.get("properties"), dict) else {}
    payload = missing_property_payload(existing, fields)
    if payload:
        await update_database_properties(access_token, connection.database_id, payload)
        logger.info("notion_properties_updated club_id=%s count=%s", connection.club_id, len(payload))


async def list_shared_databases(db: AsyncSession, connection: NotionConnection) -> list[dict[str, str]]:
    token = await valid_access_token(db, connection)
    if not token:
        return []
    return await search_databases(token)


async def write_join_to_notion(
    db: AsyncSession,
    *,
    community: Community,
    event_id: str,
    event_title: str,
    user_id: str,
    answers: dict[str, Any],
) -> None:
    if not is_club_verified(community):
        return
    result = await db.execute(select(NotionConnection).where(NotionConnection.club_id == community.id))
    connection = result.scalar_one_or_none()
    if connection is None or connection.status != "connected" or not connection.database_id:
        return

    existing = await db.execute(
        select(NotionJoinRow).where(
            NotionJoinRow.event_id == event_id,
            NotionJoinRow.user_id == user_id,
        )
    )
    row = existing.scalar_one_or_none()
    if row is None:
        row = NotionJoinRow(
            club_id=community.id,
            event_id=event_id,
            user_id=user_id,
            answers=dict(answers),
            status="pending",
        )
        db.add(row)
        await db.flush()
    elif row.status == "synced" and row.notion_page_id:
        return
    else:
        row.answers = dict(answers)
        row.status = "pending"

    token = await valid_access_token(db, connection)
    if not token:
        row.status = "failed"
        return

    payload = dict(answers)
    payload.setdefault("Event", event_title)
    fields = list(community.join_form_fields or [])
    if not any(str(f.get("key")) == "Event" for f in fields):
        fields.append({"id": "fld_event", "key": "Event", "type": "text", "required": False})

    try:
        await sync_database_properties(connection, token, fields)
        created = await create_database_page(
            token, connection.database_id, answers_to_properties(fields, payload)
        )
    except NotionAuthError:
        connection.status = "needs_reconnect"
        connection.last_error = "reconnect_required"
        row.status = "failed"
        logger.info("notion_write_auth_failed club_id=%s", community.id)
        return
    except NotionApiError as exc:
        row.status = "failed"
        connection.last_error = exc.code[:180]
        logger.info("notion_write_failed club_id=%s code=%s", community.id, exc.code)
        return

    row.notion_page_id = str(created.get("id") or "")
    row.status = "synced"
    connection.last_error = ""
    logger.info("notion_join_synced club_id=%s event_id=%s", community.id, event_id)
