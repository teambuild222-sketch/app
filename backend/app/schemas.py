"""Pydantic request/response models. Field names/casing mirror
frontend/src/api/types.ts exactly (camelCase) so no mapping layer is needed."""
from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

MainCategory = Literal["Sports", "Entertainment"]
GameAccess = Literal["public", "invite"]
PostType = Literal["poster", "text", "video"]
PostVisibility = Literal["public", "private"]
RegistrationType = Literal["open", "limited"]
AffinityReason = Literal[
    "dwell",
    "join",
    "view_location",
    "open_profile",
    "explore_subfilter",
    "explore_pin_open",
    "discover_tile_open",
]


class UserProfile(BaseModel):
    id: str
    username: str
    fullName: str
    bio: str = ""
    location: str = ""
    avatarUrl: str = ""
    sports: list[str] = Field(default_factory=list)
    entertainment: list[str] = Field(default_factory=list)
    # Own-account only (never on PublicUserProfile).
    email: str | None = None
    emailVerified: bool = False

    model_config = {"from_attributes": True}


class AuthSession(BaseModel):
    token: str
    user: UserProfile


class LoginBody(BaseModel):
    username: str
    password: str


class SignupBody(BaseModel):
    username: str
    password: str
    fullName: str
    email: EmailStr | None = None

    @field_validator("username")
    @classmethod
    def username_min_length(cls, v: str) -> str:
        if len(v.strip()) < 3:
            raise ValueError("username must be at least 3 characters")
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 3:
            raise ValueError("password must be at least 3 characters")
        return v


class EventDto(BaseModel):
    """Mirrors `EventDto` in frontend/src/api/types.ts exactly."""

    id: str
    title: str
    category: str
    mainCategory: MainCategory
    date: str = ""
    time: str = ""
    venue: str = ""
    location: str = ""
    description: str = ""
    coordinates: tuple[float, float]
    attendees: int = 0
    image: str = ""
    organizerId: str
    gameAccess: GameAccess | None = None
    inviteListIds: list[str] = Field(default_factory=list)
    invitedMemberIds: list[str] = Field(default_factory=list)
    # Real start time, added in Phase 3 (see Event.starts_at). Optional so
    # older rows without it don't break the response.
    startsAt: datetime | None = None

    model_config = {"from_attributes": True}


class EventCreate(BaseModel):
    """Body for POST /api/events — event fields without `id` (per API_CONTRACT.md).

    `organizerId`, if sent, is ignored: the server always sets it from the
    authenticated user to prevent impersonation.
    """

    title: str
    category: str
    mainCategory: MainCategory
    date: str = ""
    time: str = ""
    venue: str = ""
    location: str = ""
    description: str = ""
    coordinates: tuple[float, float]
    attendees: int = 0
    image: str = ""
    organizerId: str | None = None
    gameAccess: GameAccess | None = None
    inviteListIds: list[str] = Field(default_factory=list)
    invitedMemberIds: list[str] = Field(default_factory=list)
    startsAt: datetime | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title is required")
        return v.strip()

    @field_validator("startsAt")
    @classmethod
    def starts_not_before_today(cls, v: datetime | None) -> datetime | None:
        if v is None:
            return v
        start = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        if start.date() < datetime.now(timezone.utc).date():
            raise ValueError("Event date cannot be in the past")
        return v

    @model_validator(mode="after")
    def calendar_date_not_before_today(self) -> "EventCreate":
        raw = (self.date or "").strip()
        if len(raw) >= 10 and raw[4] == "-" and raw[7] == "-":
            try:
                chosen = date.fromisoformat(raw[:10])
            except ValueError:
                return self
            if chosen < datetime.now(timezone.utc).date():
                raise ValueError("Event date cannot be in the past")
        return self


class PublicUserProfile(BaseModel):
    """Minimal public profile for rendering an event's host in the UI.
    Deliberately excludes email and anything private."""

    id: str
    username: str
    fullName: str
    avatarUrl: str = ""
    bio: str = ""
    location: str = ""
    eventsHosted: int = 0

    model_config = {"from_attributes": True}


class ProfilePatch(BaseModel):
    """Any subset of UserProfile fields — matches the PATCH /api/me contract."""

    fullName: str | None = None
    bio: str | None = None
    location: str | None = None
    avatarUrl: str | None = None
    sports: list[str] | None = None
    entertainment: list[str] | None = None


class PostDto(BaseModel):
    """Mirrors `HomeFeedPost` in frontend/src/components/HomeFeed/homeFeed.ts.
    Event-derived fields (eventTitle, category, mainCategory, coordinates, ...)
    are hydrated from a join against `events`, not stored on the post itself."""

    id: str
    type: PostType
    authorId: str
    caption: str = ""
    image: str | None = None
    videoUrl: str | None = None
    visibility: PostVisibility
    isReshared: bool = False
    originalHostId: str | None = None
    eventId: str
    eventTitle: str
    category: str
    mainCategory: MainCategory
    eventDateISO: str | None = None
    eventDateLabel: str = ""
    eventLocation: str = ""
    coordinates: tuple[float, float]
    createdAt: datetime
    likes: int = 0
    likedByMe: bool = False
    comments: int = 0
    registrationType: RegistrationType | None = None
    slotsTotal: int | None = None
    slotsFilled: int | None = None
    registrationDeadlineISO: str | None = None


class PostCreate(BaseModel):
    """Body for POST /api/posts. `eventId` must reference an event already
    created via POST /api/events. `authorId` is never accepted from the client
    — always the authenticated user, same rule as `Event.organizerId`."""

    eventId: str
    type: PostType = "text"
    caption: str = ""
    image: str | None = None
    videoUrl: str | None = None
    visibility: PostVisibility = "public"
    isReshared: bool = False
    originalHostId: str | None = None
    registrationType: RegistrationType | None = None
    slotsTotal: int | None = None
    registrationDeadline: datetime | None = None


class LikeResponse(BaseModel):
    liked: bool
    likes: int


class FollowingList(BaseModel):
    userIds: list[str] = Field(default_factory=list)


class AffinityTrackBody(BaseModel):
    category: str
    mainCategory: MainCategory
    reason: AffinityReason
    # Only used for reason='dwell' — raw seconds, clamped server-side (never
    # trust the client's own weighting) to the same 20s cap the old client-only
    # affinity store used.
    seconds: float | None = None
    # Optional: also bump author-affinity for this interaction (e.g. opening a
    # specific event's pin/tile has an associated host; a bare subfilter chip
    # click doesn't).
    authorId: str | None = None


class AffinityMine(BaseModel):
    categories: dict[str, float] = Field(default_factory=dict)
    authors: dict[str, float] = Field(default_factory=dict)


class UploadResponse(BaseModel):
    url: str
    type: Literal["image", "video"]


# --- Chat (Supabase Realtime phase) ---
# DM + user-created group chats only — event group chats and communities stay
# on the client (`eventChats.ts` / `communitiesStore.ts`).

ConversationType = Literal["dm", "group"]
MessageKind = Literal["text", "image", "video", "post"]


class ChatMemberDto(BaseModel):
    id: str
    name: str
    avatarUrl: str = ""
    role: Literal["admin", "member"] = "member"


class SharedPostPreview(BaseModel):
    """Mirrors the frontend's `SharedPostRef` — a lightweight snapshot of the
    post at share time, not a live join, so a later post edit/delete doesn't
    retroactively change what was actually shared."""

    postId: str
    caption: str = ""
    eventTitle: str = ""
    image: str | None = None
    videoUrl: str | None = None
    authorName: str = ""
    authorAvatar: str = ""
    postType: PostType = "text"


class ChatReactionDto(BaseModel):
    emoji: str
    userId: str
    userName: str


class MessageDto(BaseModel):
    id: str
    conversationId: str
    authorId: str
    kind: MessageKind
    text: str | None = None
    mediaUrl: str | None = None
    sharedPost: SharedPostPreview | None = None
    reactions: list[ChatReactionDto] = Field(default_factory=list)
    createdAt: datetime


class ConversationDto(BaseModel):
    id: str
    type: ConversationType
    name: str
    avatarUrl: str = ""
    adminId: str | None = None
    members: list[ChatMemberDto] = Field(default_factory=list)
    lastMessage: MessageDto | None = None
    unread: int = 0
    pinned: bool = False
    muted: bool = False
    createdAt: datetime
    updatedAt: datetime


class ConversationCreate(BaseModel):
    type: ConversationType
    memberIds: list[str] = Field(default_factory=list)
    name: str = ""

    @field_validator("memberIds")
    @classmethod
    def at_least_one_member(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("memberIds must include at least one other user")
        return v


class MessageCreate(BaseModel):
    kind: MessageKind = "text"
    text: str | None = None
    mediaUrl: str | None = None
    sharedPostId: str | None = None

    @field_validator("text")
    @classmethod
    def strip_text(cls, v: str | None) -> str | None:
        return v.strip() if v else v


class ConversationPrefsPatch(BaseModel):
    pinned: bool | None = None
    muted: bool | None = None
    hidden: bool | None = None


class ReactionBody(BaseModel):
    emoji: str


class GroupMemberAdd(BaseModel):
    userId: str


class OkResponse(BaseModel):
    ok: bool = True


class ForgotPasswordBody(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    ok: bool = True
    # Only present in development when RESEND_API_KEY is unset — for local testing.
    resetToken: str | None = None


class ResetPasswordBody(BaseModel):
    token: str
    newPassword: str

    @field_validator("newPassword")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("password must be at least 6 characters")
        return v


class ChangePasswordBody(BaseModel):
    currentPassword: str
    newPassword: str

    @field_validator("newPassword")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("password must be at least 6 characters")
        return v


class PasswordChangedResponse(BaseModel):
    ok: bool = True
    # Fresh session token — every other device was signed out.
    token: str


class VerifyEmailBody(BaseModel):
    token: str


class VerificationResponse(BaseModel):
    ok: bool = True
    alreadyVerified: bool = False
    # Only present in development when RESEND_API_KEY is unset — for local testing.
    verificationToken: str | None = None


ReportTargetType = Literal["user", "post", "message", "event"]
ReportStatus = Literal["open", "reviewing", "resolved", "dismissed"]
ModerationAction = Literal["none", "remove_content", "suspend_user"]


class ReportBody(BaseModel):
    targetType: ReportTargetType
    targetId: str = Field(min_length=1, max_length=64)
    reason: str = Field(default="other", max_length=80)
    details: str = Field(default="", max_length=2000)


class AdminReportDto(BaseModel):
    id: str
    reporterId: str
    reporterUsername: str | None = None
    targetType: ReportTargetType
    targetId: str
    reason: str
    details: str = ""
    status: ReportStatus
    resolutionNote: str = ""
    resolvedBy: str | None = None
    resolvedAt: datetime | None = None
    createdAt: datetime


class AdminReportUpdate(BaseModel):
    status: ReportStatus = "resolved"
    note: str = Field(default="", max_length=2000)
    action: ModerationAction = "none"


class AdminUserUpdate(BaseModel):
    suspended: bool


class AdminStatsDto(BaseModel):
    users: int
    suspendedUsers: int
    openReports: int
    reviewingReports: int
    events: int
    posts: int


class ReportResponse(BaseModel):
    id: str
    ok: bool = True


class BlockStatus(BaseModel):
    blocked: bool


DabUpStatusLiteral = Literal["none", "pending", "incoming", "dabbed_up"]


class DabUpRequestBody(BaseModel):
    userId: str


class DabUpStatusResponse(BaseModel):
    status: DabUpStatusLiteral


class PeopleListDto(BaseModel):
    id: str
    name: str
    memberIds: list[str] = Field(default_factory=list)
    updatedAt: int


class PeopleListCreate(BaseModel):
    name: str = "✨"
    memberIds: list[str] = Field(default_factory=list)


class PeopleListPatch(BaseModel):
    name: str | None = None
    memberIds: list[str] | None = None


class JoinedEventsResponse(BaseModel):
    eventIds: list[str]


class JoinEventResponse(BaseModel):
    joined: bool
    attendees: int
    slotsFilled: int | None = None
    conversationId: str | None = None


CommunityRole = Literal["admin", "member"]


class DabbedUpIdsResponse(BaseModel):
    userIds: list[str]


class CommunityDto(BaseModel):
    id: str
    name: str
    avatarUrl: str = ""
    memberCount: int = 0
    role: CommunityRole = "member"
    creatorId: str
    conversationId: str | None = None
    createdAt: datetime | None = None


class CommunityCreate(BaseModel):
    name: str
    avatarUrl: str = ""
    memberIds: list[str] = Field(default_factory=list)


class DeviceTokenBody(BaseModel):
    platform: Literal["ios", "android", "web"]
    token: str = Field(min_length=1, max_length=4096)


class MeStatsDto(BaseModel):
    dabUps: int
    following: int
    followers: int
    eventsJoined: int
    eventsHosted: int


class GoogleAuthBody(BaseModel):
    idToken: str


class AppleAuthBody(BaseModel):
    idToken: str
    fullName: str | None = None


class NotificationDto(BaseModel):
    id: str
    title: str
    body: str
    data: dict = Field(default_factory=dict)
    read: bool = False
    createdAt: datetime


class NotificationsResponse(BaseModel):
    items: list[NotificationDto]
    unread: int


class CommentDto(BaseModel):
    id: str
    postId: str
    authorId: str
    authorName: str = ""
    authorUsername: str = ""
    authorAvatar: str = ""
    text: str
    createdAt: datetime


class CommentCreate(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("comment can't be empty")
        return v[:1000]
