"""GET/POST/DELETE /api/events â€” matches API_CONTRACT.md's Events section."""
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.affinity import record_interaction
from app.deps import CurrentUser, DbSession
from app.event_chat import ensure_event_conversation
from app.geo import bounding_box, haversine_km
from app.models import Conversation, Event, EventAttendee, PeopleList, Post, PostComment, PostLike
from app.push import notify_users
from app.schemas import EventCreate, EventDto, JoinEventResponse, JoinedEventsResponse

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventDto])
async def list_events(
    db: DbSession,
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    radiusKm: float | None = Query(default=None, ge=0),
    mainCategory: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[EventDto]:
    query = select(Event)
    if mainCategory:
        query = query.where(Event.main_category == mainCategory)

    radius_search = lat is not None and lng is not None and radiusKm is not None
    if radius_search:
        # Cheap, index-friendly bounding box in SQL first (uses ix_events_lat_lng);
        # the exact great-circle check below then trims the box's corners.
        min_lat, max_lat, min_lng, max_lng = bounding_box(lat, lng, radiusKm)
        query = query.where(Event.lat.between(min_lat, max_lat))
        if min_lng is not None and max_lng is not None:
            query = query.where(Event.lng.between(min_lng, max_lng))

    query = query.order_by(Event.created_at.desc())
    if not radius_search:
        # Without the post-filter, SQL can paginate directly.
        if offset:
            query = query.offset(offset)
        if limit is not None:
            query = query.limit(limit)

    events = (await db.execute(query)).scalars().all()

    if radius_search:
        events = [e for e in events if haversine_km(lat, lng, e.lat, e.lng) <= radiusKm]
        end = offset + limit if limit is not None else None
        events = events[offset:end]

    return [_to_dto(e) for e in events]


@router.get("/joined/mine", response_model=JoinedEventsResponse)
async def my_joined_events(current_user: CurrentUser, db: DbSession) -> JoinedEventsResponse:
    result = await db.execute(select(EventAttendee.event_id).where(EventAttendee.user_id == current_user.id))
    return JoinedEventsResponse(eventIds=list(result.scalars().all()))


@router.get("/{event_id}", response_model=EventDto)
async def get_event(event_id: str, db: DbSession) -> EventDto:
    event = await _load_event(db, event_id)
    return _to_dto(event)


@router.post("/{event_id}/join", response_model=JoinEventResponse)
async def join_event(event_id: str, current_user: CurrentUser, db: DbSession) -> JoinEventResponse:
    event = await _load_event(db, event_id)
    if event.organizer_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organizer is already hosting")

    if event.game_access == "invite":
        invited = set(event.invited_member_ids or [])
        if current_user.id not in invited:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invite only")

    existing = await db.execute(
        select(EventAttendee).where(
            EventAttendee.event_id == event_id,
            EventAttendee.user_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        conv = await ensure_event_conversation(db, event, current_user.id)
        await db.commit()
        post = await _primary_post(db, event_id)
        return JoinEventResponse(
            joined=True,
            attendees=event.attendees,
            slotsFilled=post.slots_filled if post else None,
            conversationId=conv.id,
        )

    post = await _primary_post(db, event_id)
    if post and post.registration_type == "limited" and post.slots_total is not None:
        if post.slots_filled >= post.slots_total:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Event is full")

    db.add(EventAttendee(event_id=event_id, user_id=current_user.id))
    event.attendees = max(event.attendees, 0) + 1
    if post:
        post.slots_filled += 1

    await record_interaction(
        db,
        current_user.id,
        event.category,
        event.main_category,
        "join",
        author_id=event.organizer_id,
    )
    conv = await ensure_event_conversation(db, event, current_user.id)
    await db.commit()
    await db.refresh(event)
    if post:
        await db.refresh(post)
    await notify_users(
        db,
        [event.organizer_id],
        title=event.title,
        body=f"{current_user.full_name or current_user.username} joined your event",
        data={"type": "event_join", "eventId": event.id, "userId": current_user.id},
    )
    return JoinEventResponse(
        joined=True,
        attendees=event.attendees,
        slotsFilled=post.slots_filled if post else None,
        conversationId=conv.id,
    )


@router.get("/{event_id}/conversation")
async def get_event_conversation(
    event_id: str, current_user: CurrentUser, db: DbSession
) -> dict:
    event = await _load_event(db, event_id)
    result = await db.execute(select(Conversation).where(Conversation.event_id == event_id))
    conv = result.scalar_one_or_none()
    if conv is None:
        conv = await ensure_event_conversation(db, event, current_user.id)
        await db.commit()
    return {"conversationId": conv.id, "ok": True}


@router.delete("/{event_id}/join", response_model=JoinEventResponse)
async def leave_event(event_id: str, current_user: CurrentUser, db: DbSession) -> JoinEventResponse:
    event = await _load_event(db, event_id)
    result = await db.execute(
        select(EventAttendee).where(
            EventAttendee.event_id == event_id,
            EventAttendee.user_id == current_user.id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return JoinEventResponse(joined=False, attendees=event.attendees, slotsFilled=None)

    await db.delete(row)
    event.attendees = max(0, event.attendees - 1)
    post = await _primary_post(db, event_id)
    if post and post.slots_filled > 0:
        post.slots_filled -= 1
    await db.commit()
    await db.refresh(event)
    if post:
        await db.refresh(post)
    return JoinEventResponse(
        joined=False,
        attendees=event.attendees,
        slotsFilled=post.slots_filled if post else None,
    )


@router.post("", response_model=EventDto, status_code=status.HTTP_201_CREATED)
async def create_event(body: EventCreate, current_user: CurrentUser, db: DbSession) -> EventDto:
    invited_ids = list(body.invitedMemberIds or [])
    if body.inviteListIds:
        lists_result = await db.execute(
            select(PeopleList).where(
                PeopleList.user_id == current_user.id,
                PeopleList.id.in_(body.inviteListIds),
            )
        )
        for people_list in lists_result.scalars().all():
            invited_ids.extend(people_list.member_ids)
        invited_ids = list(dict.fromkeys(invited_ids))

    event = Event(
        title=body.title,
        category=body.category,
        main_category=body.mainCategory,
        date=body.date,
        time=body.time,
        venue=body.venue,
        location=body.location,
        description=body.description,
        lat=body.coordinates[0],
        lng=body.coordinates[1],
        attendees=body.attendees,
        image=body.image,
        organizer_id=current_user.id,  # never trust client-supplied organizerId
        game_access=body.gameAccess,
        invite_list_ids=body.inviteListIds,
        invited_member_ids=invited_ids,
        starts_at=body.startsAt,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return _to_dto(event)


@router.delete("/{event_id}")
async def delete_event(event_id: str, current_user: CurrentUser, db: DbSession) -> dict:
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the organizer can delete this event")

    # No DB-level cascade (SQLite FK pragmas aren't enabled here), so delete
    # the backing post(s) + their likes explicitly, matching the client's
    # deletePublishedPost symmetry (see PHASE3 plan).
    post_ids = (
        (await db.execute(select(Post.id).where(Post.event_id == event_id))).scalars().all()
    )
    if post_ids:
        await db.execute(PostLike.__table__.delete().where(PostLike.post_id.in_(post_ids)))
        await db.execute(PostComment.__table__.delete().where(PostComment.post_id.in_(post_ids)))
        await db.execute(Post.__table__.delete().where(Post.id.in_(post_ids)))

    await db.execute(EventAttendee.__table__.delete().where(EventAttendee.event_id == event_id))

    await db.delete(event)
    await db.commit()
    return {"ok": True}


async def _load_event(db: DbSession, event_id: str) -> Event:
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


async def _primary_post(db: DbSession, event_id: str) -> Post | None:
    result = await db.execute(
        select(Post).where(Post.event_id == event_id).order_by(Post.created_at.asc()).limit(1)
    )
    return result.scalar_one_or_none()


def _to_dto(event: Event) -> EventDto:
    return EventDto(
        id=event.id,
        title=event.title,
        category=event.category,
        mainCategory=event.main_category,  # type: ignore[arg-type]
        date=event.date,
        time=event.time,
        venue=event.venue,
        location=event.location,
        description=event.description,
        coordinates=(event.lat, event.lng),
        attendees=event.attendees,
        image=event.image,
        organizerId=event.organizer_id,
        gameAccess=event.game_access,  # type: ignore[arg-type]
        inviteListIds=event.invite_list_ids,
        invitedMemberIds=event.invited_member_ids,
        startsAt=event.starts_at,
    )
