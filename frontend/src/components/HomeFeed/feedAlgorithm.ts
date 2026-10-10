import {
  type HomeFeedPost,
  isEventPast,
  hoursSincePosted,
  DEFAULT_FOLLOWING,
  isMe,
} from './homeFeed';
import { isBackendEnabled } from '../../api/client';
import { fetchMyFollowing, followUser, unfollowUser } from '../../api/followApi';
import { fetchMyAffinity, trackAffinity } from '../../api/affinityApi';
import type { AffinityReason } from '../../api/types';

/* ============================================================
   SIMSOR Home feed ranking
   ------------------------------------------------------------
   Instagram-style feed: posts from people you follow come first
   (freshest at the top). Everything else is ranked into a
   "Suggested for you" section using a lightweight relevance
   score built from:
     - explicit interests (profile Sports/Entertainment tags)
     - learned affinity from dwell time (how long you actually
       looked at posts of a category / creator)
     - interactions (likes, opening the location)
     - popularity + recency, with a penalty for past events
   All state is persisted in localStorage (no backend needed).
   ============================================================ */

const FOLLOWING_KEY = 'simsor-following-v1';
const AFFINITY_KEY = 'simsor-feed-affinity-v1';
const SEED_FLAG_KEY = 'simsor-following-seeded-v1';

export const FEED_CHANGED_EVENT = 'simsor-feed-changed';

type AffinityStore = {
  categories: Record<string, number>;
  authors: Record<string, number>;
};

export type FeedReason =
  | { kind: 'following' }
  | { kind: 'interest'; label: string }
  | { kind: 'affinity'; label: string }
  | { kind: 'popular' };

export type RankedPost = {
  post: HomeFeedPost;
  score: number;
  reason: FeedReason;
};

export type BuiltFeed = {
  following: HomeFeedPost[];
  suggested: RankedPost[];
  hasFollowing: boolean;
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* ---------- Follow graph ---------- */

function getLocalFollowing(): string[] {
  // Seed a couple of follows once so the "Following" feed isn't empty.
  if (!localStorage.getItem(SEED_FLAG_KEY)) {
    localStorage.setItem(SEED_FLAG_KEY, '1');
    if (!localStorage.getItem(FOLLOWING_KEY)) {
      localStorage.setItem(FOLLOWING_KEY, JSON.stringify(DEFAULT_FOLLOWING));
    }
  }
  return readJSON<string[]>(FOLLOWING_KEY, []);
}

// Backend-mode follow list, kept as a stale-while-revalidate cache so the
// rest of this file (isFollowing / isFollowedPost / buildFeed) can stay
// synchronous even though the real data now comes from a network call.
// `null` means "never fetched yet"; a background refresh is kicked off on
// first read and the result is applied via FEED_CHANGED_EVENT once it lands.
let remoteFollowingCache: string[] | null = null;
let followingRefreshInFlight: Promise<void> | null = null;

function refreshFollowingFromBackend(): Promise<void> {
  if (followingRefreshInFlight) return followingRefreshInFlight;
  followingRefreshInFlight = fetchMyFollowing()
    .then((ids) => {
      remoteFollowingCache = ids;
      window.dispatchEvent(new CustomEvent(FEED_CHANGED_EVENT));
    })
    .catch(() => {
      remoteFollowingCache = remoteFollowingCache ?? [];
    })
    .finally(() => {
      followingRefreshInFlight = null;
    });
  return followingRefreshInFlight;
}

export function getFollowing(): string[] {
  if (!isBackendEnabled()) return getLocalFollowing();
  if (remoteFollowingCache === null) {
    void refreshFollowingFromBackend();
    return [];
  }
  return remoteFollowingCache;
}

export function isFollowing(authorId: string): boolean {
  return getFollowing().includes(authorId);
}

/** Optimistically toggles + fires the real request in the background when a
 * backend is configured, reverting the cache if the request fails. Returns
 * the new state synchronously either way so existing call sites (button
 * label, etc.) don't need to become async. */
export function toggleFollow(authorId: string): boolean {
  if (isBackendEnabled()) {
    const current = remoteFollowingCache ?? [];
    const willFollow = !current.includes(authorId);
    remoteFollowingCache = willFollow
      ? [...current, authorId]
      : current.filter((id) => id !== authorId);
    window.dispatchEvent(new CustomEvent(FEED_CHANGED_EVENT));

    const request = willFollow ? followUser(authorId) : unfollowUser(authorId);
    request.catch(() => {
      remoteFollowingCache = current;
      window.dispatchEvent(new CustomEvent(FEED_CHANGED_EVENT));
    });
    return willFollow;
  }

  const current = getLocalFollowing();
  const next = current.includes(authorId)
    ? current.filter((id) => id !== authorId)
    : [...current, authorId];
  localStorage.setItem(FOLLOWING_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(FEED_CHANGED_EVENT));
  return next.includes(authorId);
}

/** A post "belongs" to the following feed if it's yours, or you follow the author/reshared host. */
export function isFollowedPost(post: HomeFeedPost): boolean {
  if (isMe(post.authorId)) return true;
  if (isFollowing(post.authorId)) return true;
  if (post.isReshared && post.originalHostId) return isFollowing(post.originalHostId);
  return false;
}

/* ---------- Interests (from profile) ---------- */

export function getUserInterests(): Set<string> {
  const sports = readJSON<string[]>('simsor-sports', ['Cricket', 'Football']);
  const ent = readJSON<string[]>('simsor-ent', ['Music']);
  return new Set([...sports, ...ent].map((s) => s.toLowerCase()));
}

/* ---------- Affinity (learned from behaviour) ---------- */

function getLocalAffinity(): AffinityStore {
  return readJSON<AffinityStore>(AFFINITY_KEY, { categories: {}, authors: {} });
}

function saveLocalAffinity(store: AffinityStore) {
  localStorage.setItem(AFFINITY_KEY, JSON.stringify(store));
}

type BumpTarget = { category: string; mainCategory: 'Sports' | 'Entertainment'; authorId?: string };

function bump(store: AffinityStore, target: BumpTarget, points: number) {
  const cat = target.category.toLowerCase();
  store.categories[cat] = (store.categories[cat] ?? 0) + points;
  store.categories[target.mainCategory.toLowerCase()] =
    (store.categories[target.mainCategory.toLowerCase()] ?? 0) + points * 0.4;
  if (target.authorId) {
    store.authors[target.authorId] = (store.authors[target.authorId] ?? 0) + points;
  }
}

// Same stale-while-revalidate pattern as the follow graph above — real
// affinity now lives server-side (see backend/app/affinity.py) but scoring
// in `scoreSuggested` below needs to stay synchronous.
let remoteAffinityCache: AffinityStore | null = null;
let affinityRefreshInFlight: Promise<void> | null = null;

function refreshAffinityFromBackend(): Promise<void> {
  if (affinityRefreshInFlight) return affinityRefreshInFlight;
  affinityRefreshInFlight = fetchMyAffinity()
    .then((data) => {
      remoteAffinityCache = { categories: { ...data.categories }, authors: { ...data.authors } };
      window.dispatchEvent(new CustomEvent(FEED_CHANGED_EVENT));
    })
    .catch(() => {
      remoteAffinityCache = remoteAffinityCache ?? { categories: {}, authors: {} };
    })
    .finally(() => {
      affinityRefreshInFlight = null;
    });
  return affinityRefreshInFlight;
}

function getAffinity(): AffinityStore {
  if (!isBackendEnabled()) return getLocalAffinity();
  if (remoteAffinityCache === null) {
    void refreshAffinityFromBackend();
    return { categories: {}, authors: {} };
  }
  return remoteAffinityCache;
}

/** Record how many ms the user actually spent looking at a post. */
export function recordDwell(post: HomeFeedPost, ms: number) {
  if (ms < 600) return; // ignore quick scroll-bys
  const seconds = Math.min(ms / 1000, 20); // cap a single view's weight

  if (isBackendEnabled()) {
    bumpRemoteCache(post, seconds);
    void trackAffinity({
      category: post.category,
      mainCategory: post.mainCategory,
      reason: 'dwell',
      seconds,
      authorId: post.authorId,
    }).catch(() => {});
    return;
  }

  const store = getLocalAffinity();
  bump(store, post, seconds);
  saveLocalAffinity(store);
  // Dwell shouldn't reorder the feed mid-scroll; consumers re-read on next visit.
}

/**
 * Interactions the client can report. In backend mode, 'like' and 'repost'
 * are deliberately never sent here — those bump affinity automatically
 * server-side as a side effect of the real POST /api/posts/:id/like and
 * POST /api/posts (isReshared) calls (see HomePostCard.tsx). They're kept in
 * this union only so mock mode (no backend) can still bump its local
 * affinity store for them exactly as before.
 */
export type InteractionType = 'like' | 'location' | 'openProfile' | 'repost' | 'join';

const INTERACTION_POINTS: Record<InteractionType, number> = {
  like: 10,
  location: 6,
  openProfile: 5,
  repost: 12,
  join: 16,
};

const INTERACTION_TO_REASON: Partial<Record<InteractionType, AffinityReason>> = {
  location: 'view_location',
  openProfile: 'open_profile',
  join: 'join',
};

function bumpRemoteCache(post: HomeFeedPost, points: number) {
  const store = remoteAffinityCache ?? { categories: {}, authors: {} };
  bump(store, post, points);
  remoteAffinityCache = store;
}

export function recordInteraction(post: HomeFeedPost, type: InteractionType) {
  if (isBackendEnabled()) {
    const reason = INTERACTION_TO_REASON[type];
    if (!reason) return; // 'like'/'repost': server already handled it, nothing to track here
    bumpRemoteCache(post, INTERACTION_POINTS[type]);
    void trackAffinity({
      category: post.category,
      mainCategory: post.mainCategory,
      reason,
      authorId: post.authorId,
    }).catch(() => {});
    return;
  }

  const store = getLocalAffinity();
  bump(store, post, INTERACTION_POINTS[type]);
  saveLocalAffinity(store);
}

/** Explicit tracking call for Explore/Discover clicks (no post object at that
 * point — just the category being viewed). Fire-and-forget; no-ops in mock
 * mode since there's no shared affinity store to persist to. */
export function trackCategoryInteraction(
  category: string,
  mainCategory: 'Sports' | 'Entertainment',
  reason: Extract<AffinityReason, 'explore_subfilter' | 'explore_pin_open' | 'discover_tile_open'>,
  authorId?: string,
): void {
  if (!isBackendEnabled()) return;
  const store = remoteAffinityCache ?? { categories: {}, authors: {} };
  const points = reason === 'explore_subfilter' ? 6 : reason === 'explore_pin_open' ? 10 : 8;
  bump(store, { category, mainCategory, authorId }, points);
  remoteAffinityCache = store;
  void trackAffinity({ category, mainCategory, reason, authorId }).catch(() => {});
}

/* ---------- Scoring ---------- */

function recencyScore(post: HomeFeedPost): number {
  const hours = hoursSincePosted(post);
  // 0h -> 30, ~72h -> ~0
  return Math.max(0, 30 - (hours / 72) * 30);
}

function scoreSuggested(
  post: HomeFeedPost,
  interests: Set<string>,
  affinity: AffinityStore,
): RankedPost {
  const cat = post.category.toLowerCase();
  const main = post.mainCategory.toLowerCase();

  let score = 0;
  let reason: FeedReason = { kind: 'popular' };

  // Explicit interest match (strongest signal after following).
  const interestHit = interests.has(cat);
  const mainHit = interests.has(main);
  if (interestHit) {
    score += 45;
    reason = { kind: 'interest', label: post.category };
  } else if (mainHit) {
    score += 18;
    reason = { kind: 'interest', label: post.mainCategory };
  }

  // Learned affinity from dwell + interactions.
  const catAffinity = affinity.categories[cat] ?? 0;
  const authorAffinity = affinity.authors[post.authorId] ?? 0;
  const catAffinityScore = Math.min(catAffinity, 60) / 60 * 40;
  const authorAffinityScore = Math.min(authorAffinity, 60) / 60 * 25;
  score += catAffinityScore + authorAffinityScore;

  // If affinity is the dominant signal, surface that as the reason.
  if (!interestHit && catAffinityScore >= 20) {
    reason = { kind: 'affinity', label: post.category };
  }

  // Popularity (likes) + recency.
  score += Math.min(post.likes, 500) / 500 * 12;
  score += recencyScore(post);

  // Past events still show up, but sink down the feed.
  if (isEventPast(post)) score -= 28;

  return { post, score, reason };
}

/* ---------- Feed assembly ---------- */

export function buildFeed(posts: HomeFeedPost[]): BuiltFeed {
  getFollowing(); // ensures default follows are seeded on first load
  const interests = getUserInterests();
  const affinity = getAffinity();

  const followingPosts: HomeFeedPost[] = [];
  const rest: HomeFeedPost[] = [];

  for (const post of posts) {
    if (isFollowedPost(post)) followingPosts.push(post);
    else rest.push(post);
  }

  // Following feed: freshest first (chronological-ish), past events last.
  followingPosts.sort((a, b) => {
    const pastA = isEventPast(a) ? 1 : 0;
    const pastB = isEventPast(b) ? 1 : 0;
    if (pastA !== pastB) return pastA - pastB;
    return hoursSincePosted(a) - hoursSincePosted(b);
  });

  const suggested = rest
    .map((post) => scoreSuggested(post, interests, affinity))
    .sort((a, b) => b.score - a.score);

  return {
    following: followingPosts,
    suggested,
    hasFollowing: followingPosts.length > 0,
  };
}
