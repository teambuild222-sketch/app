"""GET /api/users/:id/public — minimal public profile for rendering an event
host (name/avatar/username) without exposing email or auth-only fields.

Not part of the original API_CONTRACT.md — added to unblock the frontend's
Explore map from resolving a real host's identity for events created via the
live API (see backend/PHASE2.md for context)."""
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import case, func, or_, select

from app.blocks import blocked_ids_for
from app.deps import CurrentUser, DbSession
from app.models import Event, User
from app.schemas import PublicUserProfile

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[PublicUserProfile])
async def list_users(
    current_user: CurrentUser,
    db: DbSession,
    q: str | None = Query(default=None, description="Search by username or full name"),
    limit: int = Query(default=30, le=50),
) -> list[PublicUserProfile]:
    """Directory for starting a new chat (Chat Phase) — excludes the caller.
    Not paginated beyond `limit`; fine at this scale (see backend/PHASE3.md's
    scaling notes), revisit if the user base grows past a few thousand."""
    query = select(User).where(User.id != current_user.id, User.is_suspended.is_(False))
    hidden = await blocked_ids_for(db, current_user.id)
    if hidden:
        query = query.where(User.id.notin_(hidden))
    term = (q or "").strip().lstrip("@").lower()
    if term:
        like = f"%{term}%"
        query = query.where(or_(func.lower(User.username).like(like), func.lower(User.full_name).like(like)))

    if term:
        # Exact / prefix username matches first, then everything else by name.
        rank = case(
            (func.lower(User.username) == term, 0),
            (func.lower(User.username).like(f"{term}%"), 1),
            else_=2,
        )
        query = query.order_by(rank, User.full_name)
    else:
        query = query.order_by(User.full_name)

    result = await db.execute(query.limit(limit))
    users = result.scalars().all()
    return [
        PublicUserProfile(
            id=u.id, username=u.username, fullName=u.full_name, avatarUrl=u.avatar_url,
            bio=u.bio, location=u.location, eventsHosted=0,
        )
        for u in users
    ]


@router.get("/{user_id}/public", response_model=PublicUserProfile)
async def get_public_user(user_id: str, db: DbSession) -> PublicUserProfile:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    count_result = await db.execute(
        select(func.count()).select_from(Event).where(Event.organizer_id == user_id)
    )
    events_hosted = count_result.scalar_one()

    return PublicUserProfile(
        id=user.id,
        username=user.username,
        fullName=user.full_name,
        avatarUrl=user.avatar_url,
        bio=user.bio,
        location=user.location,
        eventsHosted=events_hosted,
    )
