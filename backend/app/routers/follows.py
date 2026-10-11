"""POST/DELETE /api/follows/:userId + GET /api/follows/mine — Phase 3.

Ports the client's `simsor-following-v1` localStorage store
(frontend/src/components/HomeFeed/feedAlgorithm.ts) to a real, shared graph."""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.blocks import is_blocked_between
from app.deps import CurrentUser, DbSession
from app.models import Follow, User
from app.push import notify_users
from app.schemas import FollowingList

router = APIRouter(prefix="/api/follows", tags=["follows"])


@router.get("/mine", response_model=FollowingList)
async def get_my_following(current_user: CurrentUser, db: DbSession) -> FollowingList:
    result = await db.execute(select(Follow.followee_id).where(Follow.follower_id == current_user.id))
    return FollowingList(userIds=list(result.scalars().all()))


@router.post("/{user_id}", status_code=status.HTTP_201_CREATED)
async def follow_user(user_id: str, current_user: CurrentUser, db: DbSession) -> dict:
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't follow yourself")

    target = await db.execute(select(User).where(User.id == user_id))
    if target.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if await is_blocked_between(db, current_user.id, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can't follow this user")

    existing = await db.execute(
        select(Follow).where(Follow.follower_id == current_user.id, Follow.followee_id == user_id)
    )
    if existing.scalar_one_or_none() is None:
        db.add(Follow(follower_id=current_user.id, followee_id=user_id))
        await db.commit()
        await notify_users(
            db,
            [user_id],
            title="New booster",
            body=f"{current_user.full_name or current_user.username} started boosting you",
            data={"type": "follow", "userId": current_user.id},
        )

    return {"ok": True, "following": True}


@router.delete("/{user_id}")
async def unfollow_user(user_id: str, current_user: CurrentUser, db: DbSession) -> dict:
    existing = await db.execute(
        select(Follow).where(Follow.follower_id == current_user.id, Follow.followee_id == user_id)
    )
    row = existing.scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.commit()

    return {"ok": True, "following": False}
