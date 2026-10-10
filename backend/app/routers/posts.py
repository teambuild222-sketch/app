"""GET/POST/DELETE /api/posts + POST /api/posts/:id/like — Phase 3.

A post always backs an existing event (created via POST /api/events first);
event-derived display fields are hydrated via a join rather than duplicated,
so they can never drift from the event's own record — see models.py::Post."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.affinity import record_interaction
from app.deps import CurrentUser, DbSession, OptionalCurrentUser
from app.models import Event, Post, PostComment, PostLike, User
from app.push import notify_users, preview
from app.schemas import CommentCreate, CommentDto, LikeResponse, PostCreate, PostDto

router = APIRouter(prefix="/api/posts", tags=["posts"])


@router.get("", response_model=list[PostDto])
async def list_posts(
    db: DbSession,
    current_user: OptionalCurrentUser,
    mainCategory: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[PostDto]:
    query = select(Post, Event).join(Event, Post.event_id == Event.id)
    if mainCategory:
        query = query.where(Event.main_category == mainCategory)

    result = await db.execute(
        query.order_by(Post.created_at.desc()).limit(limit).offset(offset)
    )
    rows = result.all()

    post_ids = [post.id for post, _ in rows]
    likes_by_post = await _likes_count_map(db, post_ids)
    liked_ids = await _liked_post_ids(db, current_user.id, post_ids) if current_user else set()
    comments_by_post = await _comments_count_map(db, post_ids)

    return [
        _to_dto(
            post,
            event,
            likes_by_post.get(post.id, 0),
            post.id in liked_ids,
            comments_by_post.get(post.id, 0),
        )
        for post, event in rows
    ]


@router.post("", response_model=PostDto, status_code=status.HTTP_201_CREATED)
async def create_post(body: PostCreate, current_user: CurrentUser, db: DbSession) -> PostDto:
    result = await db.execute(select(Event).where(Event.id == body.eventId))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    post = Post(
        author_id=current_user.id,  # never trust a client-supplied author
        event_id=event.id,
        type=body.type,
        caption=body.caption,
        image_url=body.image or "",
        video_url=body.videoUrl or "",
        visibility=body.visibility,
        is_reshared=body.isReshared,
        original_host_id=body.originalHostId,
        registration_type=body.registrationType,
        slots_total=body.slotsTotal,
        registration_deadline=body.registrationDeadline,
    )
    db.add(post)

    if body.isReshared and body.originalHostId:
        await record_interaction(
            db,
            current_user.id,
            event.category,
            event.main_category,
            "repost",
            author_id=body.originalHostId,
        )

    await db.commit()
    await db.refresh(post)
    return _to_dto(post, event, likes=0, liked_by_me=False)


@router.get("/{post_id}", response_model=PostDto)
async def get_post(
    post_id: str, db: DbSession, current_user: OptionalCurrentUser
) -> PostDto:
    result = await db.execute(
        select(Post, Event).join(Event, Post.event_id == Event.id).where(Post.id == post_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    post, event = row
    likes = (await _likes_count_map(db, [post.id])).get(post.id, 0)
    liked = False
    if current_user:
        liked = post.id in await _liked_post_ids(db, current_user.id, [post.id])
    comments = (await _comments_count_map(db, [post.id])).get(post.id, 0)
    return _to_dto(post, event, likes, liked, comments)


@router.delete("/{post_id}")
async def delete_post(post_id: str, current_user: CurrentUser, db: DbSession) -> dict:
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()

    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if post.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the author can delete this post")

    await db.execute(PostLike.__table__.delete().where(PostLike.post_id == post_id))
    await db.execute(PostComment.__table__.delete().where(PostComment.post_id == post_id))
    await db.delete(post)
    await db.commit()
    return {"ok": True}


@router.post("/{post_id}/like", response_model=LikeResponse)
async def toggle_like(post_id: str, current_user: CurrentUser, db: DbSession) -> LikeResponse:
    post_result = await db.execute(select(Post).where(Post.id == post_id))
    post = post_result.scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    existing_result = await db.execute(
        select(PostLike).where(PostLike.user_id == current_user.id, PostLike.post_id == post_id)
    )
    existing = existing_result.scalar_one_or_none()

    if existing is None:
        db.add(PostLike(user_id=current_user.id, post_id=post_id))
        liked = True
        # Only bump affinity when turning a like ON, matching the old
        # client-only store's behavior (unliking never subtracted affinity).
        event_result = await db.execute(select(Event).where(Event.id == post.event_id))
        event = event_result.scalar_one_or_none()
        if event is not None:
            await record_interaction(
                db, current_user.id, event.category, event.main_category, "like", author_id=post.author_id
            )
        await db.commit()
        if post.author_id != current_user.id:
            await notify_users(
                db,
                [post.author_id],
                title="New like",
                body=f"{current_user.full_name or current_user.username} liked your post",
                data={"type": "like", "postId": post.id, "userId": current_user.id},
            )
    else:
        await db.delete(existing)
        liked = False

    await db.commit()

    count_result = await db.execute(
        select(func.count()).select_from(PostLike).where(PostLike.post_id == post_id)
    )
    return LikeResponse(liked=liked, likes=count_result.scalar_one())


@router.get("/{post_id}/comments", response_model=list[CommentDto])
async def list_comments(
    post_id: str,
    db: DbSession,
    limit: int = Query(default=100, ge=1, le=200),
) -> list[CommentDto]:
    rows = (
        await db.execute(
            select(PostComment, User)
            .join(User, User.id == PostComment.author_id)
            .where(PostComment.post_id == post_id)
            .order_by(PostComment.created_at.asc())
            .limit(limit)
        )
    ).all()
    return [_comment_dto(c, u) for c, u in rows]


@router.post("/{post_id}/comments", response_model=CommentDto, status_code=status.HTTP_201_CREATED)
async def add_comment(
    post_id: str, body: CommentCreate, current_user: CurrentUser, db: DbSession
) -> CommentDto:
    post = (await db.execute(select(Post).where(Post.id == post_id))).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    comment = PostComment(post_id=post_id, author_id=current_user.id, text=body.text)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    if post.author_id != current_user.id:
        await notify_users(
            db,
            [post.author_id],
            title="New comment",
            body=f"{current_user.full_name or current_user.username}: {preview(body.text)}",
            data={"type": "comment", "postId": post.id, "userId": current_user.id},
        )
    return _comment_dto(comment, current_user)


@router.delete("/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: str, comment_id: str, current_user: CurrentUser, db: DbSession
) -> dict:
    comment = (
        await db.execute(
            select(PostComment).where(PostComment.id == comment_id, PostComment.post_id == post_id)
        )
    ).scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if comment.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the author can delete this comment")
    await db.delete(comment)
    await db.commit()
    return {"ok": True}


def _comment_dto(comment: PostComment, author: User) -> CommentDto:
    return CommentDto(
        id=comment.id,
        postId=comment.post_id,
        authorId=comment.author_id,
        authorName=author.full_name or author.username,
        authorUsername=author.username,
        authorAvatar=author.avatar_url or "",
        text=comment.text,
        createdAt=comment.created_at,
    )


async def _comments_count_map(db: DbSession, post_ids: list[str]) -> dict[str, int]:
    if not post_ids:
        return {}
    result = await db.execute(
        select(PostComment.post_id, func.count())
        .where(PostComment.post_id.in_(post_ids))
        .group_by(PostComment.post_id)
    )
    return dict(result.all())


async def _likes_count_map(db: DbSession, post_ids: list[str]) -> dict[str, int]:
    if not post_ids:
        return {}
    result = await db.execute(
        select(PostLike.post_id, func.count()).where(PostLike.post_id.in_(post_ids)).group_by(PostLike.post_id)
    )
    return dict(result.all())


async def _liked_post_ids(db: DbSession, user_id: str, post_ids: list[str]) -> set[str]:
    if not post_ids:
        return set()
    result = await db.execute(
        select(PostLike.post_id).where(PostLike.user_id == user_id, PostLike.post_id.in_(post_ids))
    )
    return set(result.scalars().all())


def _to_dto(post: Post, event: Event, likes: int, liked_by_me: bool, comments: int = 0) -> PostDto:
    event_date_label = f"{event.date} · {event.time}" if event.date and event.time else (event.date or event.time)
    return PostDto(
        id=post.id,
        type=post.type,  # type: ignore[arg-type]
        authorId=post.author_id,
        caption=post.caption,
        image=post.image_url or None,
        videoUrl=post.video_url or None,
        visibility=post.visibility,  # type: ignore[arg-type]
        isReshared=post.is_reshared,
        originalHostId=post.original_host_id,
        eventId=event.id,
        eventTitle=event.title,
        category=event.category,
        mainCategory=event.main_category,  # type: ignore[arg-type]
        eventDateISO=_isoformat(event.starts_at),
        eventDateLabel=event_date_label,
        eventLocation=event.venue or event.location,
        coordinates=(event.lat, event.lng),
        createdAt=post.created_at,
        likes=likes,
        likedByMe=liked_by_me,
        comments=comments,
        registrationType=post.registration_type,  # type: ignore[arg-type]
        slotsTotal=post.slots_total,
        slotsFilled=post.slots_filled,
        registrationDeadlineISO=_isoformat(post.registration_deadline),
    )


def _isoformat(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()
