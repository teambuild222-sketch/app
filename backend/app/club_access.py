"""Server-side gates for official-club Notion endpoints."""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.club_verification import is_club_verified
from app.models import Community, CommunityMember, NotionConnection, User


async def load_community(db: AsyncSession, community_id: str) -> Community:
    community = await db.get(Community, community_id)
    if community is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    return community


async def require_club_admin(db: AsyncSession, community_id: str, user: User) -> Community:
    community = await load_community(db, community_id)
    if community.created_by == user.id:
        return community
    result = await db.execute(
        select(CommunityMember).where(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == user.id,
            CommunityMember.role == "admin",
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Club admin access required")
    return community


async def require_verified_club_admin(db: AsyncSession, community_id: str, user: User) -> Community:
    community = await require_club_admin(db, community_id, user)
    if not is_club_verified(community):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only verified clubs can use Notion",
        )
    return community


async def load_connection(db: AsyncSession, club_id: str) -> NotionConnection | None:
    result = await db.execute(select(NotionConnection).where(NotionConnection.club_id == club_id))
    return result.scalar_one_or_none()
