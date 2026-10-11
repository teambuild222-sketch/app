"""GET/PATCH/DELETE /api/me — the authenticated user's own profile."""
from fastapi import APIRouter, Query
from sqlalchemy import case, delete, func, or_, select

from app.account_cleanup import delete_user_account
from app.deps import CurrentUser, DbSession
from app.mappers import to_profile as _to_profile
from app.models import DabUp, Event, EventAttendee, Follow, UserDeviceToken
from app.schemas import DeviceTokenBody, MeStatsDto, OkResponse, ProfilePatch, UserProfile

router = APIRouter(prefix="/api/me", tags=["profile"])


@router.get("", response_model=UserProfile)
async def get_me(current_user: CurrentUser) -> UserProfile:
    return _to_profile(current_user)


@router.patch("", response_model=UserProfile)
async def update_me(patch: ProfilePatch, current_user: CurrentUser, db: DbSession) -> UserProfile:
    updates = patch.model_dump(exclude_unset=True, exclude_none=True)

    if "fullName" in updates:
        current_user.full_name = updates["fullName"]
    if "bio" in updates:
        current_user.bio = updates["bio"]
    if "location" in updates:
        current_user.location = updates["location"]
    if "avatarUrl" in updates:
        current_user.avatar_url = updates["avatarUrl"]
    if "sports" in updates:
        current_user.sports = updates["sports"]
    if "entertainment" in updates:
        current_user.entertainment = updates["entertainment"]

    await db.commit()
    await db.refresh(current_user)
    return _to_profile(current_user)


@router.get("/stats", response_model=MeStatsDto)
async def my_stats(current_user: CurrentUser, db: DbSession) -> MeStatsDto:
    return await compute_user_stats(db, current_user.id)


async def compute_user_stats(db: DbSession, uid: str) -> MeStatsDto:
    peer = case((DabUp.requester_id == uid, DabUp.target_id), else_=DabUp.requester_id)
    dab = (
        await db.execute(
            select(func.count(func.distinct(peer)))
            .select_from(DabUp)
            .where(DabUp.status == "dabbed_up")
            .where(or_(DabUp.requester_id == uid, DabUp.target_id == uid))
        )
    ).scalar_one()
    following = (
        await db.execute(select(func.count()).select_from(Follow).where(Follow.follower_id == uid))
    ).scalar_one()
    followers = (
        await db.execute(select(func.count()).select_from(Follow).where(Follow.followee_id == uid))
    ).scalar_one()
    joined = (
        await db.execute(select(func.count()).select_from(EventAttendee).where(EventAttendee.user_id == uid))
    ).scalar_one()
    hosted = (
        await db.execute(select(func.count()).select_from(Event).where(Event.organizer_id == uid))
    ).scalar_one()
    return MeStatsDto(
        dabUps=int(dab),
        following=int(following),
        followers=int(followers),
        eventsJoined=int(joined),
        eventsHosted=int(hosted),
    )


@router.post("/device-token", response_model=OkResponse)
async def register_device_token(
    body: DeviceTokenBody, current_user: CurrentUser, db: DbSession
) -> OkResponse:
    """Stores the device's push registration token (FCM). One token per user+platform.

    A physical device token can only belong to one account at a time: if it was
    previously registered to someone else (shared phone / re-login), that stale
    registration is removed so pushes never leak to the previous user.
    """
    await db.execute(
        delete(UserDeviceToken).where(
            UserDeviceToken.token == body.token,
            UserDeviceToken.user_id != current_user.id,
        )
    )
    existing = await db.execute(
        select(UserDeviceToken).where(
            UserDeviceToken.user_id == current_user.id,
            UserDeviceToken.platform == body.platform,
        )
    )
    row = existing.scalar_one_or_none()
    if row is None:
        db.add(UserDeviceToken(user_id=current_user.id, platform=body.platform, token=body.token))
    else:
        row.token = body.token
    await db.commit()
    return OkResponse(ok=True)


@router.delete("/device-token", response_model=OkResponse)
async def unregister_device_token(
    current_user: CurrentUser,
    db: DbSession,
    platform: str | None = Query(default=None, description="ios | android | web — omit to remove all"),
) -> OkResponse:
    """Call on logout so a signed-out device stops receiving this user's pushes."""
    stmt = delete(UserDeviceToken).where(UserDeviceToken.user_id == current_user.id)
    if platform:
        stmt = stmt.where(UserDeviceToken.platform == platform)
    await db.execute(stmt)
    await db.commit()
    return OkResponse(ok=True)


@router.delete("", response_model=OkResponse)
async def delete_me(current_user: CurrentUser, db: DbSession) -> OkResponse:
    """Hard-delete account + owned content (App Store requirement)."""
    await delete_user_account(db, current_user)
    return OkResponse(ok=True)
