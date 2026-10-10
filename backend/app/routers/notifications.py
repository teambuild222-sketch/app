"""GET /api/notifications, POST /api/notifications/read — in-app notification feed.

Rows are written by `app.push.notify_users` (follows, joins, dab-ups, likes,
comments, moderation notices), so the bell works even without FCM."""
from datetime import datetime, timezone

from fastapi import APIRouter, Query
from sqlalchemy import func, select, update

from app.deps import CurrentUser, DbSession
from app.models import Notification
from app.schemas import NotificationDto, NotificationsResponse

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _to_dto(n: Notification) -> NotificationDto:
    return NotificationDto(
        id=n.id,
        title=n.title,
        body=n.body,
        data=n.data or {},
        read=n.read_at is not None,
        createdAt=n.created_at,
    )


@router.get("", response_model=NotificationsResponse)
async def list_notifications(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=40, ge=1, le=100),
) -> NotificationsResponse:
    rows = (
        await db.execute(
            select(Notification)
            .where(Notification.user_id == current_user.id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    unread = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        )
    ).scalar_one()
    return NotificationsResponse(items=[_to_dto(n) for n in rows], unread=unread)


@router.post("/read")
async def mark_all_read(current_user: CurrentUser, db: DbSession) -> dict:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"ok": True}
