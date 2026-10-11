"""DM + group chat — Chat Phase (Supabase Realtime).

Every write here goes through this router and lands in Postgres; live
delivery to other open clients happens separately, via Supabase Realtime's
`postgres_changes` feed off the `messages` / `conversation_members` /
`message_reactions` tables (see alembic 0008 + backend/CHAT_SETUP.md) — this
file never talks to Supabase directly.

Event group chats and communities are out of scope here; they stay on the
client (`eventChats.ts` / `communitiesStore.ts`).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.blocks import blocked_ids_for, is_blocked_between
from app.deps import CurrentUser, DbSession
from app.models import Community, Conversation, ConversationMember, Message, MessageReaction, Post, Event, User
from app.push import notify_users, preview
from app.schemas import (
    ChatMemberDto,
    ChatReactionDto,
    ConversationCreate,
    ConversationDto,
    ConversationPrefsPatch,
    GroupMemberAdd,
    MessageCreate,
    MessageDto,
    ReactionBody,
    SharedPostPreview,
)

router = APIRouter(prefix="/api/conversations", tags=["chat"])
messages_router = APIRouter(prefix="/api/messages", tags=["chat"])


async def _require_membership(db: AsyncSession, conversation_id: str, user_id: str) -> ConversationMember:
    result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return membership


def _display_name(user: User) -> str:
    return user.full_name or user.username


async def _hydrate_reactions(db: AsyncSession, message_ids: list[str]) -> dict[str, list[ChatReactionDto]]:
    if not message_ids:
        return {}
    result = await db.execute(
        select(MessageReaction, User)
        .join(User, MessageReaction.user_id == User.id)
        .where(MessageReaction.message_id.in_(message_ids))
    )
    by_message: dict[str, list[ChatReactionDto]] = {}
    for reaction, user in result.all():
        by_message.setdefault(reaction.message_id, []).append(
            ChatReactionDto(emoji=reaction.emoji, userId=user.id, userName=_display_name(user))
        )
    return by_message


async def _hydrate_shared_posts(db: AsyncSession, post_ids: list[str]) -> dict[str, SharedPostPreview]:
    if not post_ids:
        return {}
    result = await db.execute(
        select(Post, Event, User)
        .join(Event, Post.event_id == Event.id)
        .join(User, Post.author_id == User.id)
        .where(Post.id.in_(post_ids))
    )
    previews: dict[str, SharedPostPreview] = {}
    for post, event, author in result.all():
        previews[post.id] = SharedPostPreview(
            postId=post.id,
            caption=post.caption,
            eventTitle=event.title,
            image=post.image_url or None,
            videoUrl=post.video_url or None,
            authorName=_display_name(author),
            authorAvatar=author.avatar_url,
            postType=post.type,  # type: ignore[arg-type]
        )
    return previews


async def _to_message_dto(db: AsyncSession, message: Message) -> MessageDto:
    reactions_by_message = await _hydrate_reactions(db, [message.id])
    shared_posts = await _hydrate_shared_posts(db, [message.shared_post_id] if message.shared_post_id else [])
    return MessageDto(
        id=message.id,
        conversationId=message.conversation_id,
        authorId=message.author_id,
        kind=message.kind,  # type: ignore[arg-type]
        text=message.text,
        mediaUrl=message.media_url,
        sharedPost=shared_posts.get(message.shared_post_id) if message.shared_post_id else None,
        reactions=reactions_by_message.get(message.id, []),
        createdAt=message.created_at,
    )


async def _to_conversation_dto(
    db: AsyncSession, conversation: Conversation, membership: ConversationMember, viewer_id: str
) -> ConversationDto:
    members_result = await db.execute(
        select(ConversationMember, User)
        .join(User, ConversationMember.user_id == User.id)
        .where(ConversationMember.conversation_id == conversation.id)
    )
    member_rows = members_result.all()
    members = [
        ChatMemberDto(id=user.id, name=_display_name(user), avatarUrl=user.avatar_url, role=cm.role)  # type: ignore[arg-type]
        for cm, user in member_rows
    ]
    admin_id = next((cm.user_id for cm, _ in member_rows if cm.role == "admin"), None)

    if conversation.type == "dm":
        other = next((user for cm, user in member_rows if user.id != viewer_id), None)
        name = _display_name(other) if other else conversation.name
        avatar_url = other.avatar_url if other else conversation.avatar_url
    else:
        name = conversation.name
        other = next((user for cm, user in member_rows if user.id != viewer_id), None)
        avatar_url = conversation.avatar_url or (other.avatar_url if other else "")

    last_message_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    last_message = last_message_result.scalar_one_or_none()
    last_message_dto = await _to_message_dto(db, last_message) if last_message else None

    unread_cutoff = membership.last_read_at or membership.joined_at
    unread_result = await db.execute(
        select(func.count())
        .select_from(Message)
        .where(
            Message.conversation_id == conversation.id,
            Message.author_id != viewer_id,
            Message.created_at > unread_cutoff,
        )
    )
    unread = unread_result.scalar_one()

    return ConversationDto(
        id=conversation.id,
        type=conversation.type,  # type: ignore[arg-type]
        name=name,
        avatarUrl=avatar_url,
        adminId=admin_id,
        members=members,
        lastMessage=last_message_dto,
        unread=unread,
        pinned=membership.pinned,
        muted=membership.muted,
        createdAt=conversation.created_at,
        updatedAt=conversation.updated_at,
    )


@router.get("", response_model=list[ConversationDto])
async def list_conversations(current_user: CurrentUser, db: DbSession) -> list[ConversationDto]:
    result = await db.execute(
        select(Conversation, ConversationMember)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == current_user.id, ConversationMember.hidden.is_(False))
    )
    rows = result.all()
    dtos = [await _to_conversation_dto(db, conv, membership, current_user.id) for conv, membership in rows]

    dtos.sort(
        key=lambda d: (0 if d.pinned else 1, -(d.lastMessage.createdAt if d.lastMessage else d.updatedAt).timestamp())
    )
    return dtos


@router.post("", response_model=ConversationDto, status_code=status.HTTP_201_CREATED)
async def create_conversation(body: ConversationCreate, current_user: CurrentUser, db: DbSession) -> ConversationDto:
    other_ids = [uid for uid in dict.fromkeys(body.memberIds) if uid != current_user.id]
    if not other_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="memberIds must include at least one other user")

    users_result = await db.execute(select(User).where(User.id.in_(other_ids)))
    found_users = {u.id: u for u in users_result.scalars().all()}
    missing = [uid for uid in other_ids if uid not in found_users]
    if missing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User(s) not found: {', '.join(missing)}")

    if body.type == "dm":
        if len(other_ids) != 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A DM must have exactly one other member")
        peer_id = other_ids[0]

        if await is_blocked_between(db, current_user.id, peer_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can't message this user")

        existing_result = await db.execute(
            select(Conversation)
            .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
            .where(Conversation.type == "dm", ConversationMember.user_id == current_user.id)
        )
        candidate_ids = [c.id for c in existing_result.scalars().all()]
        if candidate_ids:
            peer_membership_result = await db.execute(
                select(ConversationMember.conversation_id).where(
                    ConversationMember.conversation_id.in_(candidate_ids),
                    ConversationMember.user_id == peer_id,
                )
            )
            existing_id = peer_membership_result.scalar_one_or_none()
            if existing_id:
                conv_result = await db.execute(select(Conversation).where(Conversation.id == existing_id))
                conversation = conv_result.scalar_one()
                membership = await _require_membership(db, conversation.id, current_user.id)
                if membership.hidden:
                    membership.hidden = False
                    await db.commit()
                return await _to_conversation_dto(db, conversation, membership, current_user.id)

        conversation = Conversation(type="dm", name="", created_by=current_user.id)
        db.add(conversation)
        await db.flush()
        db.add(ConversationMember(conversation_id=conversation.id, user_id=current_user.id, role="member"))
        db.add(ConversationMember(conversation_id=conversation.id, user_id=peer_id, role="member"))

    else:  # group
        if not body.name.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group name is required")
        conversation = Conversation(type="group", name=body.name.strip(), created_by=current_user.id)
        db.add(conversation)
        await db.flush()
        db.add(ConversationMember(conversation_id=conversation.id, user_id=current_user.id, role="admin"))
        for uid in other_ids:
            db.add(ConversationMember(conversation_id=conversation.id, user_id=uid, role="member"))

    await db.commit()
    await db.refresh(conversation)
    membership = await _require_membership(db, conversation.id, current_user.id)
    return await _to_conversation_dto(db, conversation, membership, current_user.id)


@router.get("/{conversation_id}/messages", response_model=list[MessageDto])
async def list_messages(
    conversation_id: str,
    current_user: CurrentUser,
    db: DbSession,
    before: datetime | None = Query(default=None),
    limit: int = Query(default=50, le=100),
) -> list[MessageDto]:
    await _require_membership(db, conversation_id, current_user.id)

    query = select(Message).where(Message.conversation_id == conversation_id)
    if before is not None:
        query = query.where(Message.created_at < before)
    result = await db.execute(query.order_by(Message.created_at.desc()).limit(limit))
    messages = list(reversed(result.scalars().all()))

    ids = [m.id for m in messages]
    reactions_by_message = await _hydrate_reactions(db, ids)
    shared_post_ids = [m.shared_post_id for m in messages if m.shared_post_id]
    shared_posts = await _hydrate_shared_posts(db, shared_post_ids)

    return [
        MessageDto(
            id=m.id,
            conversationId=m.conversation_id,
            authorId=m.author_id,
            kind=m.kind,  # type: ignore[arg-type]
            text=m.text,
            mediaUrl=m.media_url,
            sharedPost=shared_posts.get(m.shared_post_id) if m.shared_post_id else None,
            reactions=reactions_by_message.get(m.id, []),
            createdAt=m.created_at,
        )
        for m in messages
    ]


@router.post("/{conversation_id}/messages", response_model=MessageDto, status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: str, body: MessageCreate, current_user: CurrentUser, db: DbSession
) -> MessageDto:
    conversation_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = conversation_result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    await _require_membership(db, conversation_id, current_user.id)

    if conversation.type == "dm":
        peer_ids = (
            await db.execute(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == conversation_id,
                    ConversationMember.user_id != current_user.id,
                )
            )
        ).scalars().all()
        for peer_id in peer_ids:
            if await is_blocked_between(db, current_user.id, peer_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can't message this user")

    if body.kind == "text" and not (body.text and body.text.strip()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required for a text message")
    if body.kind in ("image", "video") and not body.mediaUrl:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mediaUrl is required for this message kind")
    if body.kind == "post":
        if not body.sharedPostId:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sharedPostId is required to share a post")
        post_result = await db.execute(select(Post).where(Post.id == body.sharedPostId))
        if post_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    message = Message(
        conversation_id=conversation_id,
        author_id=current_user.id,
        kind=body.kind,
        text=body.text,
        media_url=body.mediaUrl,
        shared_post_id=body.sharedPostId,
    )
    db.add(message)
    conversation.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(message)

    await _push_new_message(db, conversation, message, current_user)
    return await _to_message_dto(db, message)


async def _push_new_message(db: AsyncSession, conversation: Conversation, message: Message, sender: User) -> None:
    """Notifies the other (un-muted, un-blocked) members. Never raises into the request."""
    try:
        member_ids = (
            await db.execute(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == conversation.id,
                    ConversationMember.user_id != sender.id,
                    ConversationMember.muted.is_(False),
                )
            )
        ).scalars().all()
        blocked = await blocked_ids_for(db, sender.id)
        recipients = [uid for uid in member_ids if uid not in blocked]
        if not recipients:
            return

        if message.kind == "image":
            snippet = "📷 Photo"
        elif message.kind == "video":
            snippet = "🎬 Video"
        elif message.kind == "post":
            snippet = "Shared a post"
        else:
            snippet = preview(message.text)

        sender_name = _display_name(sender)
        if conversation.type == "dm":
            title, body = sender_name, snippet
        else:
            title, body = conversation.name or "New message", f"{sender_name}: {snippet}"

        data = {"type": "message", "conversationId": conversation.id, "messageId": message.id}
        if conversation.type == "group":
            community = (
                await db.execute(select(Community).where(Community.conversation_id == conversation.id))
            ).scalar_one_or_none()
            # The club creator's posts are announcements: they land in members' notification feed.
            if community is not None and community.created_by == sender.id:
                title, body = community.name, f"{sender_name}: {snippet}"
                data = {**data, "type": "club_update", "communityId": community.id, "userId": sender.id}

        await notify_users(db, recipients, title=title, body=body, data=data)
    except Exception:  # noqa: BLE001 — a push problem must never fail a sent message
        import logging

        logging.getLogger("simsor.push").exception("push for new message failed")


@router.patch("/{conversation_id}/read")
async def mark_read(conversation_id: str, current_user: CurrentUser, db: DbSession) -> dict:
    membership = await _require_membership(db, conversation_id, current_user.id)
    membership.last_read_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.patch("/{conversation_id}/prefs")
async def set_prefs(
    conversation_id: str, body: ConversationPrefsPatch, current_user: CurrentUser, db: DbSession
) -> dict:
    membership = await _require_membership(db, conversation_id, current_user.id)
    if body.pinned is not None:
        membership.pinned = body.pinned
    if body.muted is not None:
        membership.muted = body.muted
    if body.hidden is not None:
        membership.hidden = body.hidden
    await db.commit()
    return {"ok": True, "pinned": membership.pinned, "muted": membership.muted, "hidden": membership.hidden}


@router.post("/{conversation_id}/members", response_model=ConversationDto, status_code=status.HTTP_201_CREATED)
async def add_member(
    conversation_id: str, body: GroupMemberAdd, current_user: CurrentUser, db: DbSession
) -> ConversationDto:
    conversation_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = conversation_result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conversation.type != "group":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only groups have members added")

    membership = await _require_membership(db, conversation_id, current_user.id)
    if membership.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the group admin can add members")

    target_result = await db.execute(select(User).where(User.id == body.userId))
    if target_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id, ConversationMember.user_id == body.userId
        )
    )
    if existing.scalar_one_or_none() is None:
        db.add(ConversationMember(conversation_id=conversation_id, user_id=body.userId, role="member"))
        await db.commit()

    return await _to_conversation_dto(db, conversation, membership, current_user.id)


@router.delete("/{conversation_id}/members/{user_id}")
async def remove_member(conversation_id: str, user_id: str, current_user: CurrentUser, db: DbSession) -> dict:
    conversation_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conversation = conversation_result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conversation.type != "group":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only groups have members removed")

    membership = await _require_membership(db, conversation_id, current_user.id)
    if membership.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the group admin can remove members")
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admins can't remove themselves")

    target_result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id, ConversationMember.user_id == user_id
        )
    )
    target = target_result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That user isn't a member")

    await db.delete(target)
    await db.commit()
    return {"ok": True}


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, current_user: CurrentUser, db: DbSession) -> dict:
    """Soft-delete: hides the conversation for the caller only — it's never
    removed for other members (matches WhatsApp-style "delete chat")."""
    membership = await _require_membership(db, conversation_id, current_user.id)
    membership.hidden = True
    await db.commit()
    return {"ok": True}


@messages_router.post("/{message_id}/reactions", response_model=list[ChatReactionDto])
async def toggle_reaction(message_id: str, body: ReactionBody, current_user: CurrentUser, db: DbSession) -> list[ChatReactionDto]:
    message_result = await db.execute(select(Message).where(Message.id == message_id))
    message = message_result.scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    await _require_membership(db, message.conversation_id, current_user.id)

    existing_result = await db.execute(
        select(MessageReaction).where(
            MessageReaction.message_id == message_id, MessageReaction.user_id == current_user.id
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing and existing.emoji == body.emoji:
        await db.delete(existing)
    elif existing:
        existing.emoji = body.emoji
    else:
        db.add(MessageReaction(message_id=message_id, user_id=current_user.id, emoji=body.emoji))

    await db.commit()
    reactions_by_message = await _hydrate_reactions(db, [message_id])
    return reactions_by_message.get(message_id, [])
