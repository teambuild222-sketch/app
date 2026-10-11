"""Dab ups — mutual connections.

POST /api/dab-ups/request          send (or auto-accept a crossing request)
POST /api/dab-ups/{userId}/accept  confirm an incoming request
POST /api/dab-ups/{userId}/deny    decline an incoming request
GET  /api/dab-ups/mine             ids I'm dabbed up with
GET  /api/dab-ups/{userId}         none | pending (I asked) | incoming (they asked) | dabbed_up
"""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from app.blocks import is_blocked_between
from app.deps import CurrentUser, DbSession
from app.models import DabUp, Notification, User
from app.push import notify_users
from app.schemas import DabUpRequestBody, DabUpStatusResponse, DabbedUpIdsResponse

router = APIRouter(prefix="/api/dab-ups", tags=["social"])


async def _rows_between(db: DbSession, a: str, b: str) -> list[DabUp]:
    result = await db.execute(
        select(DabUp).where(
            or_(
                (DabUp.requester_id == a) & (DabUp.target_id == b),
                (DabUp.requester_id == b) & (DabUp.target_id == a),
            )
        )
    )
    return list(result.scalars().all())


async def _resolve_request_notifications(db: DbSession, recipient_id: str, sender_id: str, outcome: str) -> None:
    """Stamps the recipient's 'dab_up_request' feed rows so the Confirm/Deny buttons don't reappear."""
    rows = (
        await db.execute(
            select(Notification)
            .where(Notification.user_id == recipient_id)
            .order_by(Notification.created_at.desc())
            .limit(200)
        )
    ).scalars().all()
    for n in rows:
        data = n.data or {}
        if data.get("type") == "dab_up_request" and data.get("userId") == sender_id and not data.get("status"):
            n.data = {**data, "status": outcome}


async def _accept(db: DbSession, current_user: User, requester_id: str, rows: list[DabUp]) -> DabUpStatusResponse:
    inbound = next((r for r in rows if r.requester_id == requester_id and r.target_id == current_user.id), None)
    outbound = next((r for r in rows if r.requester_id == current_user.id and r.target_id == requester_id), None)
    if inbound is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No dab-up request from this user")
    inbound.status = "dabbed_up"
    if outbound:
        outbound.status = "dabbed_up"
    else:
        db.add(DabUp(requester_id=current_user.id, target_id=requester_id, status="dabbed_up"))
    await _resolve_request_notifications(db, current_user.id, requester_id, "accepted")
    await db.commit()
    await notify_users(
        db,
        [requester_id],
        title="You're dabbed up! 🤝",
        body=f"{current_user.full_name or current_user.username} accepted your dab-up",
        data={"type": "dab_up", "userId": current_user.id},
    )
    return DabUpStatusResponse(status="dabbed_up")


@router.post("/request", response_model=DabUpStatusResponse)
async def request_dab_up(body: DabUpRequestBody, current_user: CurrentUser, db: DbSession) -> DabUpStatusResponse:
    target_id = body.userId.strip()
    if target_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot dab up with yourself")

    if await db.get(User, target_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if await is_blocked_between(db, current_user.id, target_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can't dab up with this user")

    rows = await _rows_between(db, current_user.id, target_id)
    if any(r.status == "dabbed_up" for r in rows):
        return DabUpStatusResponse(status="dabbed_up")

    inbound = next((r for r in rows if r.requester_id == target_id and r.target_id == current_user.id), None)
    if inbound and inbound.status == "pending":
        return await _accept(db, current_user, target_id, rows)

    outbound = next((r for r in rows if r.requester_id == current_user.id and r.target_id == target_id), None)
    if outbound:
        return DabUpStatusResponse(status="pending" if outbound.status == "pending" else "dabbed_up")

    db.add(DabUp(requester_id=current_user.id, target_id=target_id, status="pending"))
    await db.commit()
    await notify_users(
        db,
        [target_id],
        title="New dab-up request",
        body=f"{current_user.full_name or current_user.username} wants to dab up with you",
        data={"type": "dab_up_request", "userId": current_user.id},
    )
    return DabUpStatusResponse(status="pending")


@router.post("/{user_id}/accept", response_model=DabUpStatusResponse)
async def accept_dab_up(user_id: str, current_user: CurrentUser, db: DbSession) -> DabUpStatusResponse:
    rows = await _rows_between(db, current_user.id, user_id)
    if any(r.status == "dabbed_up" for r in rows):
        return DabUpStatusResponse(status="dabbed_up")
    return await _accept(db, current_user, user_id, rows)


@router.post("/{user_id}/deny", response_model=DabUpStatusResponse)
async def deny_dab_up(user_id: str, current_user: CurrentUser, db: DbSession) -> DabUpStatusResponse:
    rows = await _rows_between(db, current_user.id, user_id)
    inbound = next(
        (r for r in rows if r.requester_id == user_id and r.target_id == current_user.id and r.status == "pending"),
        None,
    )
    if inbound is not None:
        await db.delete(inbound)
    await _resolve_request_notifications(db, current_user.id, user_id, "denied")
    await db.commit()
    return DabUpStatusResponse(status="none")


@router.get("/mine", response_model=DabbedUpIdsResponse)
async def my_dabbed_up_ids(current_user: CurrentUser, db: DbSession) -> DabbedUpIdsResponse:
    result = await db.execute(
        select(DabUp).where(
            DabUp.status == "dabbed_up",
            or_(DabUp.requester_id == current_user.id, DabUp.target_id == current_user.id),
        )
    )
    ids: list[str] = []
    for row in result.scalars().all():
        other = row.target_id if row.requester_id == current_user.id else row.requester_id
        if other != current_user.id:
            ids.append(other)
    return DabbedUpIdsResponse(userIds=list(dict.fromkeys(ids)))


@router.get("/{user_id}", response_model=DabUpStatusResponse)
async def dab_up_status(user_id: str, current_user: CurrentUser, db: DbSession) -> DabUpStatusResponse:
    if user_id == current_user.id:
        return DabUpStatusResponse(status="none")

    rows = await _rows_between(db, current_user.id, user_id)
    if any(r.status == "dabbed_up" for r in rows):
        return DabUpStatusResponse(status="dabbed_up")
    if any(r.requester_id == current_user.id and r.status == "pending" for r in rows):
        return DabUpStatusResponse(status="pending")
    if any(r.requester_id == user_id and r.status == "pending" for r in rows):
        return DabUpStatusResponse(status="incoming")
    return DabUpStatusResponse(status="none")
