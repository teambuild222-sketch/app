"""Communities API + linked group chat conversations."""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.community_chat import add_member_to_community_chat, ensure_community_conversation
from app.deps import CurrentUser, DbSession, OptionalCurrentUser
from app.models import Community, CommunityMember
from app.push import notify_users
from app.club_verification import is_club_verified
from app.schemas import CommunityCreate, CommunityDto, JoinFormFieldDto, OkResponse

router = APIRouter(prefix="/api/communities", tags=["communities"])


@router.get("", response_model=list[CommunityDto])
async def list_communities(current_user: CurrentUser, db: DbSession) -> list[CommunityDto]:
    result = await db.execute(
        select(Community, CommunityMember)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .where(CommunityMember.user_id == current_user.id)
        .order_by(Community.created_at.desc())
    )
    rows = result.all()
    counts = await _member_counts(db, [c.id for c, _ in rows])
    return [
        _to_dto(community, membership.role, counts.get(community.id, 0))  # type: ignore[arg-type]
        for community, membership in rows
    ]


@router.get("/by-creator/{user_id}", response_model=list[CommunityDto])
async def communities_by_creator(
    user_id: str, _viewer: OptionalCurrentUser, db: DbSession
) -> list[CommunityDto]:
    result = await db.execute(
        select(Community).where(Community.created_by == user_id).order_by(Community.created_at.desc())
    )
    communities = result.scalars().all()
    counts = await _member_counts(db, [c.id for c in communities])
    return [
        _to_dto(c, "admin" if c.created_by == user_id else "member", counts.get(c.id, 0))
        for c in communities
    ]


@router.post("", response_model=CommunityDto, status_code=status.HTTP_201_CREATED)
async def create_community(body: CommunityCreate, current_user: CurrentUser, db: DbSession) -> CommunityDto:
    existing = await db.execute(
        select(func.count())
        .select_from(Community)
        .where(Community.created_by == current_user.id)
    )
    if int(existing.scalar_one()) >= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You can only create one community for now",
        )

    community = Community(
        name=body.name.strip(),
        avatar_url=body.avatarUrl or "",
        created_by=current_user.id,
    )
    db.add(community)
    await db.flush()
    db.add(CommunityMember(community_id=community.id, user_id=current_user.id, role="admin"))
    member_ids = [uid for uid in body.memberIds if uid != current_user.id]
    for uid in member_ids:
        db.add(CommunityMember(community_id=community.id, user_id=uid, role="member"))

    await ensure_community_conversation(db, community, member_ids)
    await db.commit()
    await db.refresh(community)
    return _to_dto(community, "admin", 1 + len(member_ids))


@router.post("/{community_id}/join", response_model=OkResponse)
async def join_community(community_id: str, current_user: CurrentUser, db: DbSession) -> OkResponse:
    community = await _get_community(db, community_id)
    if community.created_by == current_user.id:
        return OkResponse(ok=True)

    existing = await db.execute(
        select(CommunityMember).where(
            CommunityMember.community_id == community.id,
            CommunityMember.user_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none() is None:
        db.add(CommunityMember(community_id=community.id, user_id=current_user.id, role="member"))
        await add_member_to_community_chat(db, community, current_user.id)
        await db.commit()
        await notify_users(
            db,
            [community.created_by],
            title=community.name,
            body=f"{current_user.full_name or current_user.username} joined your club",
            data={"type": "club_join", "communityId": community.id, "userId": current_user.id},
        )
    return OkResponse(ok=True)


@router.delete("/{community_id}/join", response_model=OkResponse)
async def leave_community(community_id: str, current_user: CurrentUser, db: DbSession) -> OkResponse:
    result = await db.execute(
        select(CommunityMember).where(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == current_user.id,
        )
    )
    row = result.scalar_one_or_none()
    if row and row.role != "admin":
        await db.delete(row)
        await db.commit()
    return OkResponse(ok=True)


async def _get_community(db: DbSession, community_id: str) -> Community:
    result = await db.execute(select(Community).where(Community.id == community_id))
    community = result.scalar_one_or_none()
    if community is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Community not found")
    return community


async def _member_counts(db: DbSession, community_ids: list[str]) -> dict[str, int]:
    if not community_ids:
        return {}
    count_result = await db.execute(
        select(CommunityMember.community_id, func.count())
        .where(CommunityMember.community_id.in_(community_ids))
        .group_by(CommunityMember.community_id)
    )
    return {cid: int(n) for cid, n in count_result.all()}


def _to_dto(community: Community, role: str, member_count: int) -> CommunityDto:
    fields = []
    if role == "admin":
        fields = [JoinFormFieldDto.model_validate(item) for item in (community.join_form_fields or [])]
    return CommunityDto(
        id=community.id,
        name=community.name,
        avatarUrl=community.avatar_url,
        memberCount=member_count,
        role=role,  # type: ignore[arg-type]
        creatorId=community.created_by,
        conversationId=community.conversation_id,
        createdAt=community.created_at,
        verified=is_club_verified(community),
        joinFormFields=fields,
    )
