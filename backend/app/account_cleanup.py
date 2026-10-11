"""Hard-delete a user and owned content (App Store account-deletion requirement)."""
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.content_removal import purge_messages
from app.models import (
    Affinity,
    Community,
    CommunityMember,
    Conversation,
    ConversationMember,
    DabUp,
    EmailVerification,
    Event,
    EventAttendee,
    Follow,
    Message,
    MessageReaction,
    Notification,
    NotionConnection,
    NotionJoinRow,
    NotionOAuthState,
    PasswordReset,
    PeopleList,
    Post,
    PostComment,
    PostLike,
    RevokedToken,
    User,
    UserBlock,
    UserDeviceToken,
    UserReport,
)


async def delete_user_account(db: AsyncSession, user: User) -> None:
    uid = user.id

    # --- Owned events → posts → likes (same cascade as DELETE /api/events) ---
    event_ids = (
        await db.execute(select(Event.id).where(Event.organizer_id == uid))
    ).scalars().all()
    if event_ids:
        await db.execute(delete(NotionJoinRow).where(NotionJoinRow.event_id.in_(event_ids)))
        post_ids = (
            await db.execute(select(Post.id).where(Post.event_id.in_(event_ids)))
        ).scalars().all()
        if post_ids:
            await purge_messages(db, Message.shared_post_id.in_(post_ids))
            await db.execute(delete(PostLike).where(PostLike.post_id.in_(post_ids)))
            await db.execute(delete(PostComment).where(PostComment.post_id.in_(post_ids)))
            await db.execute(delete(Post).where(Post.id.in_(post_ids)))
        await db.execute(delete(Event).where(Event.id.in_(event_ids)))

    # --- Posts authored on someone else's events ---
    authored = (
        await db.execute(select(Post.id).where(Post.author_id == uid))
    ).scalars().all()
    if authored:
        await purge_messages(db, Message.shared_post_id.in_(authored))
        await db.execute(delete(PostLike).where(PostLike.post_id.in_(authored)))
        await db.execute(delete(PostComment).where(PostComment.post_id.in_(authored)))
        await db.execute(delete(Post).where(Post.id.in_(authored)))

    await db.execute(delete(PostLike).where(PostLike.user_id == uid))
    await db.execute(delete(PostComment).where(PostComment.author_id == uid))
    await db.execute(delete(Notification).where(Notification.user_id == uid))
    await db.execute(delete(Affinity).where(Affinity.user_id == uid))
    await db.execute(
        delete(Follow).where((Follow.follower_id == uid) | (Follow.followee_id == uid))
    )

    # --- Chat ---
    msg_ids = (
        await db.execute(select(Message.id).where(Message.author_id == uid))
    ).scalars().all()
    if msg_ids:
        await db.execute(delete(MessageReaction).where(MessageReaction.message_id.in_(msg_ids)))
    await db.execute(delete(MessageReaction).where(MessageReaction.user_id == uid))
    await db.execute(delete(Message).where(Message.author_id == uid))
    await db.execute(delete(ConversationMember).where(ConversationMember.user_id == uid))

    # Drop conversations that no longer have members
    orphan_ids = (
        await db.execute(
            select(Conversation.id)
            .outerjoin(
                ConversationMember,
                ConversationMember.conversation_id == Conversation.id,
            )
            .group_by(Conversation.id)
            .having(func.count(ConversationMember.user_id) == 0)
        )
    ).scalars().all()
    if orphan_ids:
        orphan_msgs = (
            await db.execute(select(Message.id).where(Message.conversation_id.in_(orphan_ids)))
        ).scalars().all()
        if orphan_msgs:
            await db.execute(
                delete(MessageReaction).where(MessageReaction.message_id.in_(orphan_msgs))
            )
        await db.execute(delete(Message).where(Message.conversation_id.in_(orphan_ids)))
        await db.execute(delete(Conversation).where(Conversation.id.in_(orphan_ids)))

    await db.execute(delete(EventAttendee).where(EventAttendee.user_id == uid))
    await db.execute(
        Community.__table__.update().where(Community.verified_by == uid).values(verified_by=None)
    )
    await db.execute(
        delete(DabUp).where((DabUp.requester_id == uid) | (DabUp.target_id == uid))
    )
    await db.execute(delete(PeopleList).where(PeopleList.user_id == uid))
    await db.execute(delete(UserDeviceToken).where(UserDeviceToken.user_id == uid))

    owned_communities = (
        await db.execute(select(Community.id).where(Community.created_by == uid))
    ).scalars().all()
    if owned_communities:
        await db.execute(delete(NotionJoinRow).where(NotionJoinRow.club_id.in_(owned_communities)))
        await db.execute(delete(NotionOAuthState).where(NotionOAuthState.club_id.in_(owned_communities)))
        await db.execute(delete(NotionConnection).where(NotionConnection.club_id.in_(owned_communities)))
        await db.execute(
            delete(CommunityMember).where(CommunityMember.community_id.in_(owned_communities))
        )
        await db.execute(delete(Community).where(Community.id.in_(owned_communities)))
    await db.execute(delete(NotionJoinRow).where(NotionJoinRow.user_id == uid))
    await db.execute(delete(NotionOAuthState).where(NotionOAuthState.user_id == uid))
    await db.execute(delete(CommunityMember).where(CommunityMember.user_id == uid))

    await db.execute(delete(PasswordReset).where(PasswordReset.user_id == uid))
    await db.execute(delete(EmailVerification).where(EmailVerification.user_id == uid))
    await db.execute(delete(RevokedToken).where(RevokedToken.user_id == uid))
    await db.execute(
        delete(UserBlock).where((UserBlock.blocker_id == uid) | (UserBlock.blocked_id == uid))
    )
    await db.execute(
        delete(UserReport).where(
            (UserReport.reporter_id == uid)
            | ((UserReport.target_type == "user") & (UserReport.target_id == uid))
        )
    )

    await db.execute(delete(User).where(User.id == uid))
    await db.commit()
