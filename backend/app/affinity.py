"""Server-side port of the client's affinity/interest scoring inputs.

Previously lived entirely in frontend/src/components/HomeFeed/feedAlgorithm.ts
as a localStorage store (`simsor-feed-affinity-v1`), bumped only by dwell time
and a handful of Home feed interactions. Phase 3 moves the data here (so it's
shared across devices) and adds three new reasons from Explore/Discover clicks
per the product ask: "the more I click into a certain type of event or
category there, the more that type should start showing up in my feed."

Weights are fixed server-side and never trusted from the client — same
principle as "never trust client-supplied organizerId" in routers/events.py.
`like` and `repost` are included here but deliberately excluded from the
`AffinityReason` schema type, so routers/posts.py can call
`record_interaction` directly as a side effect of a real like/repost action,
while the public POST /api/affinity/track endpoint can't be used to claim an
unearned like or repost bump.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Affinity

REASON_WEIGHTS: dict[str, float] = {
    "like": 10,
    "repost": 12,
    "join": 16,
    "view_location": 6,
    "open_profile": 5,
    "explore_subfilter": 6,
    "explore_pin_open": 10,
    "discover_tile_open": 8,
}

# Dwell time contributes 1 point/second, capped the same way the old client
# store capped it (min(seconds, 20)).
DWELL_MAX_SECONDS = 20.0
DWELL_POINTS_PER_SECOND = 1.0

# An exact-category bump also nudges the post's main-category bucket, matching
# the old store's `categories[main] += points * 0.4`.
MAIN_CATEGORY_BLEND = 0.4


async def _increment(db: AsyncSession, user_id: str, kind: str, key: str, delta: float) -> None:
    if delta <= 0 or not key:
        return
    result = await db.execute(
        select(Affinity).where(Affinity.user_id == user_id, Affinity.kind == kind, Affinity.key == key)
    )
    row = result.scalar_one_or_none()
    if row is None:
        db.add(Affinity(user_id=user_id, kind=kind, key=key, score=delta))
    else:
        row.score += delta


async def bump_category(db: AsyncSession, user_id: str, category: str, main_category: str, points: float) -> None:
    """Bumps the exact category plus a blended share of its main category."""
    await _increment(db, user_id, "category", category, points)
    if main_category and main_category != category:
        await _increment(db, user_id, "category", main_category, points * MAIN_CATEGORY_BLEND)


async def bump_author(db: AsyncSession, user_id: str, author_id: str, points: float) -> None:
    await _increment(db, user_id, "author", author_id, points)


async def record_interaction(
    db: AsyncSession,
    user_id: str,
    category: str,
    main_category: str,
    reason: str,
    *,
    seconds: float | None = None,
    author_id: str | None = None,
) -> None:
    """Looks up the fixed weight for `reason` and applies it. Unknown reasons
    are ignored rather than raising, so a client/server version mismatch never
    500s a background tracking call."""
    if reason == "dwell":
        points = min(max(seconds or 0, 0), DWELL_MAX_SECONDS) * DWELL_POINTS_PER_SECOND
    else:
        points = REASON_WEIGHTS.get(reason, 0)

    if points <= 0:
        return

    await bump_category(db, user_id, category, main_category, points)
    if author_id:
        await bump_author(db, user_id, author_id, points)
