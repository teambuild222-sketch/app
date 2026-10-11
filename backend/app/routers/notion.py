"""Notion OAuth + join-sheet + webhook for verified clubs only."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.club_access import load_connection, require_club_admin, require_verified_club_admin
from app.club_verification import is_club_verified, normalize_join_fields
from app.config import get_settings
from app.deps import CurrentUser, DbSession
from app.models import Community, NotionConnection, NotionJoinRow, NotionOAuthState
from app.notion_client import (
    NotionAuthError,
    authorize_url,
    exchange_code,
    verify_webhook_signature,
)
from app.notion_crypto import encrypt_secret
from app.notion_sync import (
    connection_public_status,
    list_shared_databases,
    sync_database_properties,
    valid_access_token,
    write_join_to_notion,
)
from app.schemas import (
    JoinFormFieldDto,
    JoinFormFieldsUpdate,
    NotionDatabaseDto,
    NotionDatabaseSelect,
    NotionOAuthStartDto,
    NotionStatusDto,
    NotionWebhookAck,
    OkResponse,
)

logger = logging.getLogger("simsor.notion")
router = APIRouter(tags=["notion"])
OAUTH_TTL = timedelta(minutes=10)


def _fields(community: Community) -> list[JoinFormFieldDto]:
    return [JoinFormFieldDto.model_validate(item) for item in (community.join_form_fields or [])]


def _configured() -> None:
    settings = get_settings()
    if not settings.notion_client_id or not settings.notion_client_secret or not settings.notion_redirect_uri:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Notion is not configured")


@router.get("/api/communities/{community_id}/notion", response_model=NotionStatusDto)
async def notion_status(community_id: str, current_user: CurrentUser, db: DbSession) -> NotionStatusDto:
    community = await require_club_admin(db, community_id, current_user)
    connection = await load_connection(db, community.id)
    databases: list[NotionDatabaseDto] = []
    if is_club_verified(community) and connection and connection.status == "connected":
        try:
            databases = [NotionDatabaseDto(**row) for row in await list_shared_databases(db, connection)]
        except Exception:
            logger.info("notion_search_failed club_id=%s", community.id)
    return NotionStatusDto(
        communityId=community.id,
        verified=is_club_verified(community),
        status=connection_public_status(connection, is_club_verified(community)),
        workspaceName=connection.workspace_name if connection else "",
        workspaceIcon=connection.workspace_icon if connection else "",
        databaseId=connection.database_id if connection else "",
        databaseTitle=connection.database_title if connection else "",
        lastError=(connection.last_error if connection else "")[:80],
        fields=_fields(community),
        databases=databases,
    )


@router.post("/api/communities/{community_id}/notion/oauth/start", response_model=NotionOAuthStartDto)
async def oauth_start(community_id: str, current_user: CurrentUser, db: DbSession) -> NotionOAuthStartDto:
    _configured()
    await require_verified_club_admin(db, community_id, current_user)
    settings = get_settings()
    state = secrets.token_urlsafe(24)
    db.add(
        NotionOAuthState(
            state=state,
            club_id=community_id,
            user_id=current_user.id,
            expires_at=datetime.now(timezone.utc) + OAUTH_TTL,
        )
    )
    await db.commit()
    return NotionOAuthStartDto(
        url=authorize_url(
            client_id=settings.notion_client_id,
            redirect_uri=settings.notion_redirect_uri,
            state=state,
        ),
        state=state,
    )


@router.get("/api/notion/oauth/callback")
async def oauth_callback(
    db: DbSession,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    settings = get_settings()
    frontend = (settings.public_app_url or "http://localhost:5173").rstrip("/")

    def bounce(query: dict[str, str]) -> RedirectResponse:
        return RedirectResponse(f"{frontend}/?{urlencode(query)}")

    if error or not code or not state:
        return bounce({"notion": "error"})

    row = await db.get(NotionOAuthState, state)
    if row is None:
        return bounce({"notion": "error", "reason": "state"})
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
    club_id = row.club_id
    user_id = row.user_id
    await db.delete(row)
    if expires < datetime.now(timezone.utc):
        await db.commit()
        return bounce({"notion": "error", "reason": "expired"})

    community = await db.get(Community, club_id)
    if community is None or not is_club_verified(community):
        await db.commit()
        return bounce({"notion": "error", "reason": "unverified"})

    try:
        payload = await exchange_code(code, settings.notion_redirect_uri)
    except NotionAuthError:
        await db.commit()
        return bounce({"notion": "error", "reason": "token"})

    access = str(payload.get("access_token") or "")
    refresh = str(payload.get("refresh_token") or "")
    if not access:
        await db.commit()
        return bounce({"notion": "error", "reason": "token"})

    result = await db.execute(select(NotionConnection).where(NotionConnection.club_id == club_id))
    connection = result.scalar_one_or_none()
    if connection is None:
        connection = NotionConnection(club_id=club_id, connected_by=user_id)
        db.add(connection)
    connection.access_token_enc = encrypt_secret(access)
    connection.refresh_token_enc = encrypt_secret(refresh)
    connection.workspace_id = str(payload.get("workspace_id") or "")
    connection.workspace_name = str(payload.get("workspace_name") or "")
    connection.workspace_icon = str(payload.get("workspace_icon") or "")
    connection.bot_id = str(payload.get("bot_id") or "")
    connection.status = "connected"
    connection.last_error = ""
    connection.connected_by = user_id
    expires_in = payload.get("expires_in")
    if isinstance(expires_in, (int, float)) and expires_in > 0:
        connection.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in) - 60)
    await db.commit()
    logger.info("notion_connected club_id=%s", club_id)
    return bounce({"notion": "connected", "club": club_id})


@router.post("/api/communities/{community_id}/notion/database", response_model=NotionStatusDto)
async def select_database(
    community_id: str, body: NotionDatabaseSelect, current_user: CurrentUser, db: DbSession
) -> NotionStatusDto:
    community = await require_verified_club_admin(db, community_id, current_user)
    connection = await load_connection(db, community.id)
    if connection is None or connection.status != "connected":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Connect Notion first")
    token = await valid_access_token(db, connection)
    if not token:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Notion needs reconnect")
    databases = await list_shared_databases(db, connection)
    match = next((row for row in databases if row["id"] == body.databaseId), None)
    if match is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Database is not shared with this connection")
    connection.database_id = match["id"]
    connection.database_title = match["title"]
    try:
        await sync_database_properties(connection, token, list(community.join_form_fields or []))
    except Exception:
        logger.info("notion_property_sync_failed club_id=%s", community.id)
    await db.commit()
    return await notion_status(community_id, current_user, db)


@router.put("/api/communities/{community_id}/join-form", response_model=NotionStatusDto)
async def update_join_form(
    community_id: str, body: JoinFormFieldsUpdate, current_user: CurrentUser, db: DbSession
) -> NotionStatusDto:
    community = await require_verified_club_admin(db, community_id, current_user)
    community.join_form_fields = normalize_join_fields([item.model_dump() for item in body.fields])
    connection = await load_connection(db, community.id)
    if connection and connection.status == "connected" and connection.database_id:
        token = await valid_access_token(db, connection)
        if token:
            try:
                await sync_database_properties(connection, token, list(community.join_form_fields))
            except Exception:
                logger.info("notion_property_sync_failed club_id=%s", community.id)
    await db.commit()
    return await notion_status(community_id, current_user, db)


@router.post("/api/communities/{community_id}/notion/sync", response_model=OkResponse)
async def sync_now(community_id: str, current_user: CurrentUser, db: DbSession) -> OkResponse:
    community = await require_verified_club_admin(db, community_id, current_user)
    rows = (
        await db.execute(
            select(NotionJoinRow).where(
                NotionJoinRow.club_id == community.id,
                NotionJoinRow.status != "synced",
            )
        )
    ).scalars().all()
    for row in rows:
        from app.models import Event

        event = await db.get(Event, row.event_id)
        await write_join_to_notion(
            db,
            community=community,
            event_id=row.event_id,
            event_title=event.title if event else "",
            user_id=row.user_id,
            answers=dict(row.answers or {}),
        )
    await db.commit()
    return OkResponse(ok=True)


@router.delete("/api/communities/{community_id}/notion", response_model=OkResponse)
async def disconnect(community_id: str, current_user: CurrentUser, db: DbSession) -> OkResponse:
    await require_verified_club_admin(db, community_id, current_user)
    connection = await load_connection(db, community_id)
    if connection is not None:
        await db.delete(connection)
    await db.execute(NotionOAuthState.__table__.delete().where(NotionOAuthState.club_id == community_id))
    await db.execute(NotionJoinRow.__table__.delete().where(NotionJoinRow.club_id == community_id))
    await db.commit()
    logger.info("notion_disconnected club_id=%s", community_id)
    return OkResponse(ok=True)


@router.post("/api/notion/webhook", response_model=NotionWebhookAck)
async def webhook(request: Request) -> NotionWebhookAck:
    import json

    raw = await request.body()
    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except ValueError:
        payload = {}
    settings = get_settings()
    if isinstance(payload, dict) and payload.get("verification_token") and not request.headers.get("X-Notion-Signature"):
        logger.info("notion_webhook_handshake")
        return NotionWebhookAck(ok=True)
    if settings.notion_webhook_secret:
        signature = request.headers.get("X-Notion-Signature", "")
        if not verify_webhook_signature(raw, signature, settings.notion_webhook_secret):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")
    event_id = payload.get("id") if isinstance(payload, dict) else None
    logger.info("notion_webhook_received event_id=%s", event_id)
    return NotionWebhookAck(ok=True)
