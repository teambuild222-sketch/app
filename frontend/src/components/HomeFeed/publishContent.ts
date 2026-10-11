import {
  appendExploreEvent,
  removeExploreEvent,
  getCurrentViewerId,
  type ExploreEvent,
  type GameAccess,
} from '../ExplorePage/exploreEvents';
import { resolveMemberIdsFromLists } from './audienceLists';
import {
  type HomeFeedPost,
  type HomeMainCategory,
  type HomePostType,
  type RegistrationType,
  ME_AUTHOR_ID,
  getCurrentUserOrganizer,
} from './homeFeed';
import { ensureEventChat } from '../common/eventChats';
import { isBackendEnabled } from '../../api/client';
import { createEventRemote, deleteEventRemote } from '../../api/eventsApi';
import { isEventJoined, toggleEventJoinRemote } from '../../api/joinsApi';
import { createPost, deletePost } from '../../api/postsApi';
import type { EventDto, PostCreatePayload } from '../../api/types';
import { mapPostDtoToHomeFeedPost } from './homeFeed';

const USER_POSTS_KEY = 'simsor-user-posts-v1';
export const USER_POSTS_CHANGED_EVENT = 'simsor-user-posts-changed';

export type CreateMedia = { type: 'image' | 'video'; url: string } | null;

/** Raw payload emitted by the Create Event modal. */
export type CreateEventPayload = {
  id: string;
  title: string;
  category: string;
  mainCategory: HomeMainCategory;
  gameAccess: GameAccess;
  date: string; // yyyy-mm-dd
  time: string; // HH:mm
  venue: string;
  location: string;
  description: string;
  coordinates: [number, number];
  attendees: number;
  image: string; // category cover for the map event
  media?: CreateMedia;
  registrationType?: RegistrationType;
  slotsTotal?: number;
  registrationDeadline?: string; // yyyy-mm-ddTHH:mm (local)
  /** When true (default), host gets a group chat on publish. */
  createGroupChat?: boolean;
  /** Selected people lists for invite-only events. */
  inviteListIds?: string[];
  /** Official verified club this event belongs to. */
  communityId?: string;
};

/* ---------- User post storage ---------- */

export function loadUserPosts(): HomeFeedPost[] {
  try {
    const raw = localStorage.getItem(USER_POSTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HomeFeedPost[]) : [];
  } catch {
    return [];
  }
}

export function addUserPost(post: HomeFeedPost): void {
  const next = [post, ...loadUserPosts()];
  localStorage.setItem(USER_POSTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(USER_POSTS_CHANGED_EVENT));
}

/** True for posts created by the current user via Create Event. */
export function isUserCreatedPost(post: HomeFeedPost): boolean {
  if (isBackendEnabled()) return post.authorId === getCurrentViewerId();
  return post.id.startsWith('user-') && post.authorId === ME_AUTHOR_ID;
}

export function deleteUserPost(postId: string): void {
  const next = loadUserPosts().filter((p) => p.id !== postId);
  localStorage.setItem(USER_POSTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(USER_POSTS_CHANGED_EVENT));
}

/* ---------- Join / RSVP tracking (current user) ---------- */

const JOINED_KEY = 'simsor-joined-v1';

function getJoined(): string[] {
  try {
    const raw = localStorage.getItem(JOINED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function isJoined(eventId: string): boolean {
  if (isBackendEnabled()) return isEventJoined(eventId);
  return getJoined().includes(eventId);
}

/** Join / leave an event; returns the new joined state. */
export function toggleJoin(eventId: string): boolean {
  const joined = getJoined();
  const has = joined.includes(eventId);
  const next = has ? joined.filter((id) => id !== eventId) : [...joined, eventId];
  localStorage.setItem(JOINED_KEY, JSON.stringify(next));
  return !has;
}

/** Async join/leave when the live API is enabled. */
export async function toggleJoinAsync(eventId: string): Promise<boolean> {
  if (isBackendEnabled()) return toggleEventJoinRemote(eventId);
  return toggleJoin(eventId);
}

/* ---------- Date helpers ---------- */

export function formatEventDateTime(date: string, time: string) {
  const start = new Date(`${date}T${time}`);
  const valid = !Number.isNaN(start.getTime());

  const dateLabel = valid
    ? start.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })
    : date;
  const timeLabel = valid
    ? start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : time;

  return {
    dateLabel,
    timeLabel,
    iso: valid ? start.toISOString() : `${date}T${time}:00`,
    combinedLabel: `${dateLabel} · ${timeLabel}`,
  };
}

/* ---------- Builders ---------- */

function buildExploreEvent(data: CreateEventPayload): ExploreEvent {
  const { dateLabel, timeLabel } = formatEventDateTime(data.date, data.time);
  const inviteListIds =
    data.gameAccess === 'invite' && data.inviteListIds?.length ? data.inviteListIds : undefined;
  const invitedMemberIds = inviteListIds?.length
    ? resolveMemberIdsFromLists(inviteListIds)
    : undefined;

  return {
    id: data.id,
    title: data.title,
    category: data.category,
    mainCategory: data.mainCategory,
    date: dateLabel,
    time: timeLabel,
    venue: data.venue,
    location: data.location || data.venue,
    description: data.description,
    coordinates: data.coordinates,
    attendees: data.attendees ?? 1,
    image: data.image,
    organizerId: ME_AUTHOR_ID,
    gameAccess: data.gameAccess,
    inviteListIds,
    invitedMemberIds,
  };
}

function buildHomePost(data: CreateEventPayload, eventIdOverride?: string): HomeFeedPost {
  const eventId = eventIdOverride ?? data.id;
  const { iso, combinedLabel } = formatEventDateTime(data.date, data.time);
  const media = data.media ?? null;

  let type: HomePostType = 'text';
  let image: string | undefined;
  let videoUrl: string | undefined;
  if (media?.type === 'image') {
    type = 'poster';
    image = media.url;
  } else if (media?.type === 'video') {
    type = 'video';
    videoUrl = media.url;
  }

  const caption =
    data.description.trim() ||
    `I'm hosting ${data.title} at ${data.venue}. Come join! 🎉`;

  const isLimited = data.registrationType === 'limited';
  const deadline = data.registrationDeadline
    ? new Date(data.registrationDeadline)
    : null;
  const registrationDeadlineISO =
    deadline && !Number.isNaN(deadline.getTime()) ? deadline.toISOString() : undefined;

  return {
    id: `user-${eventId}`,
    type,
    authorId: ME_AUTHOR_ID,
    caption,
    image,
    videoUrl,
    visibility: data.gameAccess === 'public' ? 'public' : 'private',
    isReshared: false,
    eventId,
    eventTitle: data.title,
    category: data.category,
    mainCategory: data.mainCategory,
    eventDateISO: iso,
    eventDateLabel: combinedLabel,
    eventLocation: data.venue,
    coordinates: data.coordinates,
    postedAgo: 'now',
    likes: 0,
    comments: 0,
    registrationType: isLimited ? 'limited' : 'open',
    slotsTotal: isLimited ? data.slotsTotal : undefined,
    slotsFilled: isLimited ? 0 : undefined,
    registrationDeadlineISO: isLimited ? registrationDeadlineISO : undefined,
  };
}

/**
 * Publish a created event to BOTH surfaces:
 *  - Explore map (persisted event)
 *  - Home feed (a post authored by the current user)
 * Location (coordinates) is mandatory upstream in the modal.
 */
export function publishEvent(data: CreateEventPayload): {
  event: ExploreEvent;
  post: HomeFeedPost;
} {
  const event = buildExploreEvent(data);
  const post = buildHomePost(data);
  appendExploreEvent(event);
  addUserPost(post);

  if (data.createGroupChat !== false) {
    const me = getCurrentUserOrganizer();
    ensureEventChat({
      eventId: event.id,
      title: event.title,
      category: event.category,
      avatar: me.avatar,
      hostName: me.name,
      hostId: me.id,
    });
  }

  return { event, post };
}

function buildPostCreatePayload(data: CreateEventPayload, eventId: string): PostCreatePayload {
  const media = data.media ?? null;
  const caption =
    data.description.trim() || `I'm hosting ${data.title} at ${data.venue}. Come join! 🎉`;
  const isLimited = data.registrationType === 'limited';

  return {
    eventId,
    type: media?.type === 'image' ? 'poster' : media?.type === 'video' ? 'video' : 'text',
    caption,
    image: media?.type === 'image' ? media.url : undefined,
    videoUrl: media?.type === 'video' ? media.url : undefined,
    visibility: data.gameAccess === 'public' ? 'public' : 'private',
    registrationType: isLimited ? 'limited' : null,
    slotsTotal: isLimited ? data.slotsTotal ?? null : null,
    registrationDeadline: isLimited && data.registrationDeadline ? data.registrationDeadline : null,
  };
}

/**
 * Publish path used when a live backend created the map event (the event
 * itself is already persisted server-side — see eventsApi.createEventRemote).
 * Also creates the real, shared Post backing it (Phase 3) so it shows up for
 * every viewer via GET /api/posts, not just this browser's localStorage. No
 * local exploreEvents write either, since the Explore map re-fetches from the
 * API as the source of truth in that mode. Uses the server's real event id,
 * not the client-side placeholder from the Create Event form.
 */
export async function publishEventRemote(
  data: CreateEventPayload,
  remoteEvent: EventDto,
): Promise<{ post: HomeFeedPost }> {
  const remotePost = await createPost(buildPostCreatePayload(data, remoteEvent.id));
  const post = mapPostDtoToHomeFeedPost(remotePost);

  if (data.createGroupChat !== false) {
    const me = getCurrentUserOrganizer();
    ensureEventChat({
      eventId: remoteEvent.id,
      title: remoteEvent.title,
      category: remoteEvent.category,
      avatar: me.avatar,
      hostName: me.name,
      hostId: me.id,
    });
  }

  return { post };
}

/** Where a freshly published event landed, so callers can focus the map on it. */
export type PublishedEventRef = {
  id: string;
  mainCategory: HomeMainCategory;
  coordinates: [number, number];
};

/**
 * The one entry point for the Create Event modal, whichever screen opened it.
 * Against a live backend the map event is persisted server-side and the Home
 * post is built around the server's event id; otherwise both surfaces are
 * written locally. Routing every caller through here keeps a map event from
 * existing only in localStorage while the map itself reads from the API.
 */
export async function submitCreateEvent(data: CreateEventPayload): Promise<PublishedEventRef> {
  if (!isBackendEnabled()) {
    const { event } = publishEvent(data);
    return { id: event.id, mainCategory: event.mainCategory, coordinates: event.coordinates };
  }

  const { dateLabel, timeLabel, iso: startsAt } = formatEventDateTime(data.date, data.time);
  const inviteListIds =
    data.gameAccess === 'invite' && data.inviteListIds?.length ? data.inviteListIds : undefined;
  const invitedMemberIds = inviteListIds?.length
    ? resolveMemberIdsFromLists(inviteListIds)
    : undefined;

  const remoteEvent = await createEventRemote({
    title: data.title,
    category: data.category,
    mainCategory: data.mainCategory,
    date: dateLabel,
    time: timeLabel,
    venue: data.venue,
    location: data.location || data.venue,
    description: data.description,
    coordinates: data.coordinates,
    attendees: data.attendees ?? 1,
    image: data.image,
    gameAccess: data.gameAccess,
    inviteListIds,
    invitedMemberIds,
    startsAt,
    communityId: data.communityId,
  });

  await publishEventRemote(data, remoteEvent);
  return {
    id: remoteEvent.id,
    mainCategory: remoteEvent.mainCategory,
    coordinates: remoteEvent.coordinates,
  };
}

/** Remove a user-created post and its linked map event. */
export async function deletePublishedPost(post: HomeFeedPost): Promise<boolean> {
  if (!isUserCreatedPost(post)) return false;

  if (isBackendEnabled()) {
    await deletePost(post.id);
    await deleteEventRemote(post.eventId).catch(() => {});
    return true;
  }

  deleteUserPost(post.id);
  removeExploreEvent(post.eventId);
  return true;
}
