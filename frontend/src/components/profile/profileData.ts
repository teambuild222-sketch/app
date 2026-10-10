/**
 * Profile "backend" data layer (localStorage-based, matching the rest of the app).
 *
 * Covers:
 *  - Dab Ups (mutual connections, was "Connections") with pending → dabbed_up flow
 *  - Boosters (display-layer rename of followers; follow logic untouched)
 *  - XP / reward events → rank tier (see rankConfig.ts)
 *  - Events joined stats (attended only) + per-category breakdown
 *  - Hosting stats (official events + star rating + rating count)
 *  - Achievements earned via official events
 *  - Profile interest tags (user_tags equivalent)
 */

import {
  EVENT_ORGANIZERS,
  ORGANIZER_BY_ID,
  ME_AUTHOR_ID,
  getCurrentUserOrganizer,
  getCurrentViewerId,
  type EventOrganizer,
} from '../ExplorePage/exploreEvents';
import { HOME_FEED_POSTS, type HomeFeedPost, isEventPast } from '../HomeFeed/homeFeed';
import { loadUserPosts } from '../HomeFeed/publishContent';
import { getLiveCachedPosts } from '../HomeFeed/feedSource';
import { getFollowing } from '../HomeFeed/feedAlgorithm';
import { getRankForXp, type RankProgress } from './rankConfig';
import { MAX_PROFILE_TAGS, TAG_BY_ID } from './tagsConfig';
import { isBackendEnabled } from '../../api/client';
import { getServerDabbedUpIds } from '../../api/dabUpsApi';
import { getCachedStats } from '../../api/statsApi';
import { resolveOrganizer } from '../ExplorePage/exploreEvents';

/* ============================================================
   1. DAB UPS (mutual connections)
   ============================================================ */

export type DabUpStatus = 'none' | 'pending' | 'dabbed_up';

// 'connected' kept as a legacy alias for previously stored relationships.
type StoredDabStatus = 'pending' | 'dabbed_up' | 'connected';

const DAB_UPS_KEY = 'simsor-dabups-v1';
export const DAB_UPS_CHANGED_EVENT = 'simsor-dabups-changed';

function loadDabStore(): Record<string, StoredDabStatus> {
  try {
    const raw = localStorage.getItem(DAB_UPS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveDabStore(store: Record<string, StoredDabStatus>): void {
  localStorage.setItem(DAB_UPS_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(DAB_UPS_CHANGED_EVENT));
}

export function getDabUpStatus(userId: string): DabUpStatus {
  const stored = loadDabStore()[userId];
  if (!stored) return 'none';
  // Legacy 'connected' is treated as the canonical 'dabbed_up'.
  return stored === 'pending' ? 'pending' : 'dabbed_up';
}

/**
 * Send a Dab Up request. In this prototype the other member "accepts" shortly
 * after, moving the relationship pending → dabbed_up.
 */
export function sendDabUpRequest(userId: string): void {
  const store = loadDabStore();
  if (store[userId] === 'dabbed_up' || store[userId] === 'connected') return;
  store[userId] = 'pending';
  saveDabStore(store);

  // Simulated mutual accept (demo members always accept).
  window.setTimeout(() => {
    const latest = loadDabStore();
    if (latest[userId] === 'pending') {
      latest[userId] = 'dabbed_up';
      saveDabStore(latest);
    }
  }, 1800);
}

export function removeDabUp(userId: string): void {
  const store = loadDabStore();
  if (!(userId in store)) return;
  delete store[userId];
  saveDabStore(store);
}

export function getDabbedUpIds(): string[] {
  if (isBackendEnabled()) return getServerDabbedUpIds();
  const store = loadDabStore();
  return Object.keys(store).filter((id) => store[id] !== 'pending');
}

export function getDabUpsCount(): number {
  if (isBackendEnabled()) {
    const real = getCachedStats();
    if (real) return real.dabUps;
  }
  return getDabbedUpIds().length;
}

export function getDabbedUpPeople(): EventOrganizer[] {
  if (isBackendEnabled()) return getDabbedUpIds().map((id) => resolveOrganizer(id));
  return getDabbedUpIds()
    .map((id) => ORGANIZER_BY_ID[id])
    .filter(Boolean);
}

/* ============================================================
   2. BOOSTERS (followers rename — display layer only)
   ============================================================ */

/**
 * Prototype rule: everyone you're Dabbed Up with boosts you, plus demo
 * members you boost tend to boost back (stable, deterministic subset).
 */
export function getBoostersCount(): number {
  if (isBackendEnabled()) {
    const real = getCachedStats();
    if (real) return real.followers;
    return 0;
  }
  const dabbed = new Set(getDabbedUpIds());
  const boostBacks = getFollowing().filter((id, index) => {
    if (dabbed.has(id)) return false;
    return index % 2 === 0; // every other boost is reciprocated in the demo
  });
  return dabbed.size + boostBacks.length;
}

export function getBoostingCount(): number {
  if (isBackendEnabled()) {
    const real = getCachedStats();
    if (real) return real.following;
  }
  return getFollowing().length;
}

/* ============================================================
   3. EVENTS JOINED (attended) + CATEGORY BREAKDOWN
   ============================================================ */

const JOINED_KEY = 'simsor-joined-v1';

function getJoinedEventIds(): string[] {
  try {
    const raw = localStorage.getItem(JOINED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function getAllKnownPosts(): HomeFeedPost[] {
  if (isBackendEnabled()) return getLiveCachedPosts();
  return [...loadUserPosts(), ...HOME_FEED_POSTS];
}

/** Posts the signed-in user authored (local store in mock mode, real API posts when live). */
function getOwnPosts(): HomeFeedPost[] {
  if (isBackendEnabled()) {
    const viewerId = getCurrentViewerId();
    return getLiveCachedPosts().filter((p) => p.authorId === viewerId);
  }
  return getOwnPosts();
}

export type EventsJoinedStats = {
  attendedTotal: number;
  /** Upcoming events the user has joined but not yet attended. */
  registeredUpcoming: number;
  byCategory: { category: string; count: number }[];
};

/**
 * Attended = joined events whose date has passed (verified check-in equivalent).
 * Upcoming joins count as "registered", not attended.
 */
export function getEventsJoinedStats(): EventsJoinedStats {
  const joinedIds = new Set(getJoinedEventIds());
  const posts = getAllKnownPosts();
  const byCategory = new Map<string, number>();
  let attendedTotal = 0;
  let registeredUpcoming = 0;
  const seen = new Set<string>();

  for (const post of posts) {
    if (!joinedIds.has(post.eventId) || seen.has(post.eventId)) continue;
    seen.add(post.eventId);

    if (isEventPast(post)) {
      attendedTotal += 1;
      byCategory.set(post.category, (byCategory.get(post.category) ?? 0) + 1);
    } else {
      registeredUpcoming += 1;
    }
  }

  return {
    attendedTotal,
    registeredUpcoming,
    byCategory: [...byCategory.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ============================================================
   4. HOSTING STATS (official events + rating)
   ============================================================ */

export type HostedEventRating = {
  post: HomeFeedPost;
  rating: number;
  ratingCount: number;
};

export type HostingStats = {
  hostedTotal: number;
  avgRating: number;
  ratingCount: number;
  events: HostedEventRating[];
};

/** Deterministic per-event rating so hosted events show stable stars. */
function eventRating(eventId: string): { rating: number; count: number } {
  // No rating feature exists server-side yet: never invent stars for real events.
  if (isBackendEnabled()) return { rating: 0, count: 0 };
  let h = 0;
  for (let i = 0; i < eventId.length; i += 1) {
    h = (h * 31 + eventId.charCodeAt(i)) >>> 0;
  }
  return { rating: 4.2 + (h % 8) / 10, count: 5 + (h % 40) };
}

/** Events created by the current user via the app are "official" hosted events. */
export function getHostingStats(): HostingStats {
  const hosted = getOwnPosts();
  const events: HostedEventRating[] = hosted.map((post) => {
    const { rating, count } = eventRating(post.eventId);
    return { post, rating: Math.round(rating * 10) / 10, ratingCount: count };
  });

  const ratingCount = events.reduce((sum, e) => sum + e.ratingCount, 0);
  const avgRating =
    events.length === 0
      ? 0
      : events.reduce((sum, e) => sum + e.rating * e.ratingCount, 0) / Math.max(1, ratingCount);

  return {
    hostedTotal: events.length,
    avgRating: Math.round(avgRating * 10) / 10,
    ratingCount,
    events,
  };
}

/* ============================================================
   5. XP / REWARD EVENTS → RANK
   ============================================================ */

export type XpBreakdown = {
  total: number;
  sources: { label: string; xp: number }[];
};

const XP_PER_ATTENDED = 150;
const XP_PER_REGISTERED = 25;
const XP_PER_HOSTED = 120;
const XP_PER_DAB_UP = 50;
const XP_PER_BOOSTING = 10;

export function getXpBreakdown(): XpBreakdown {
  const joined = getEventsJoinedStats();
  const hosting = getHostingStats();
  const dabUps = getDabUpsCount();
  const boosting = getBoostingCount();

  const sources = [
    { label: 'Events attended', xp: joined.attendedTotal * XP_PER_ATTENDED },
    { label: 'Upcoming registrations', xp: joined.registeredUpcoming * XP_PER_REGISTERED },
    { label: 'Events hosted', xp: hosting.hostedTotal * XP_PER_HOSTED },
    { label: 'Dab Ups', xp: dabUps * XP_PER_DAB_UP },
    { label: 'Boosting others', xp: boosting * XP_PER_BOOSTING },
  ].filter((s) => s.xp > 0);

  return { total: sources.reduce((sum, s) => sum + s.xp, 0), sources };
}

export function getRankProgress(): RankProgress {
  return getRankForXp(getXpBreakdown().total);
}

/* ============================================================
   6. ACHIEVEMENTS (official events)
   ============================================================ */

export type AchievementProgress = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  earned: boolean;
  current: number;
  target: number;
};

export function getAchievements(): AchievementProgress[] {
  const joined = getEventsJoinedStats();
  const hosting = getHostingStats();
  const dabUps = getDabUpsCount();
  const boosters = getBoostersCount();
  const categories = joined.byCategory.length;

  const make = (
    id: string,
    name: string,
    emoji: string,
    description: string,
    current: number,
    target: number,
  ): AchievementProgress => ({
    id,
    name,
    emoji,
    description,
    current: Math.min(current, target),
    target,
    earned: current >= target,
  });

  return [
    make('first-steps', 'First Steps', '👟', 'Attend your first official event', joined.attendedTotal, 1),
    make('regular', 'Regular', '📅', 'Attend 5 official events', joined.attendedTotal, 5),
    make('twenty-club', 'Twenty Club', '🏆', 'Attend 20 official events', joined.attendedTotal, 20),
    make('all-rounder', 'All-Rounder', '🌐', 'Attend events across 3 different categories', categories, 3),
    make('first-host', 'First Official Event Hosted', '🎪', 'Host your first official event', hosting.hostedTotal, 1),
    make(
      'top-rated-host',
      'Top Rated Host',
      '⭐',
      'Hold a 4.5+ average rating with 10+ ratings',
      hosting.avgRating >= 4.5 ? hosting.ratingCount : 0,
      10,
    ),
    make('dab-master', 'Dab Master', '🤝', 'Dab Up with 10 members', dabUps, 10),
    make('crowd-puller', 'Crowd Puller', '🚀', 'Reach 10 Boosters', boosters, 10),
  ];
}

/* ============================================================
   7. PROFILE INTEREST TAGS (user_tags equivalent)
   ============================================================ */

const USER_TAGS_KEY = 'simsor-user-tags-v1';
export const USER_TAGS_CHANGED_EVENT = 'simsor-user-tags-changed';

export function getUserTags(): string[] {
  try {
    const raw = localStorage.getItem(USER_TAGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      return parsed.filter((id) => id in TAG_BY_ID).slice(0, MAX_PROFILE_TAGS);
    }
  } catch {
    // fall through to seed below
  }
  // Seed from existing interests so profiles aren't empty for current users.
  const sports: string[] = JSON.parse(localStorage.getItem('simsor-sports') || '[]');
  const ent: string[] = JSON.parse(localStorage.getItem('simsor-ent') || '[]');
  const seeded = [...sports, ...ent]
    .map((label) => label.toLowerCase().replace(/\s+/g, '-'))
    .filter((id) => id in TAG_BY_ID)
    .slice(0, MAX_PROFILE_TAGS);
  return seeded;
}

export function saveUserTags(tagIds: string[]): void {
  const cleaned = [...new Set(tagIds)]
    .filter((id) => id in TAG_BY_ID)
    .slice(0, MAX_PROFILE_TAGS);
  localStorage.setItem(USER_TAGS_KEY, JSON.stringify(cleaned));
  window.dispatchEvent(new CustomEvent(USER_TAGS_CHANGED_EVENT));
}

/* ============================================================
   Misc profile helpers
   ============================================================ */

export function getSuggestedDabUps(limit = 6): EventOrganizer[] {
  const store = loadDabStore();
  return EVENT_ORGANIZERS.filter((o) => o.id !== ME_AUTHOR_ID && !(o.id in store)).slice(0, limit);
}

export function getUserPostsFeed(): HomeFeedPost[] {
  // Most recent first — user posts are prepended on create, keep that order.
  return loadUserPosts().filter((p) => p.authorId === ME_AUTHOR_ID);
}

/* ============================================================
   Member profiles (other users)
   ============================================================ */

export function isOwnProfileUser(userId: string | null | undefined): boolean {
  return !userId || userId === ME_AUTHOR_ID;
}

function hashUserId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getProfileOrganizer(userId: string | null | undefined): EventOrganizer {
  if (isOwnProfileUser(userId)) return getCurrentUserOrganizer();
  return resolveOrganizer(userId!);
}

export function getMemberPosts(userId: string): HomeFeedPost[] {
  return getAllKnownPosts().filter((p) => p.authorId === userId);
}

export function getMemberHostingStats(userId: string): HostingStats {
  const hosted = getAllKnownPosts().filter((p) => p.authorId === userId);
  const events: HostedEventRating[] = hosted.map((post) => {
    const { rating, count } = eventRating(post.eventId);
    return { post, rating: Math.round(rating * 10) / 10, ratingCount: count };
  });

  const ratingCount = events.reduce((sum, e) => sum + e.ratingCount, 0);
  const avgRating =
    events.length === 0
      ? 0
      : events.reduce((sum, e) => sum + e.rating * e.ratingCount, 0) / Math.max(1, ratingCount);

  return {
    hostedTotal: events.length,
    avgRating: Math.round(avgRating * 10) / 10,
    ratingCount,
    events,
  };
}

export function getMemberEventsJoinedStats(userId: string): EventsJoinedStats {
  const authorPosts = getMemberPosts(userId);
  if (isBackendEnabled()) {
    const real = getCachedStats(userId);
    const byCat = new Map<string, number>();
    for (const post of authorPosts) byCat.set(post.category, (byCat.get(post.category) ?? 0) + 1);
    return {
      attendedTotal: real?.eventsJoined ?? 0,
      registeredUpcoming: 0,
      byCategory: [...byCat.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
  const h = hashUserId(userId);
  const byCategory = new Map<string, number>();

  for (const post of authorPosts) {
    byCategory.set(post.category, (byCategory.get(post.category) ?? 0) + 1);
  }

  // Extra attended categories beyond authored posts — stable per member.
  const extra = 2 + (h % 6);
  const attendedTotal = Math.max(authorPosts.length, extra + Math.floor(authorPosts.length * 0.6));
  const registeredUpcoming = 1 + (h % 3);

  if (byCategory.size === 0 && attendedTotal > 0) {
    byCategory.set('Community', attendedTotal);
  } else if (byCategory.size > 0 && attendedTotal > authorPosts.length) {
    const first = [...byCategory.keys()][0];
    byCategory.set(first, (byCategory.get(first) ?? 0) + (attendedTotal - authorPosts.length));
  }

  return {
    attendedTotal,
    registeredUpcoming,
    byCategory: [...byCategory.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function getMemberSocialCounts(userId: string): {
  dabUps: number;
  boosters: number;
  boosting: number;
} {
  if (isBackendEnabled()) {
    const real = getCachedStats(userId);
    return {
      dabUps: real?.dabUps ?? 0,
      boosters: real?.followers ?? 0,
      boosting: real?.following ?? 0,
    };
  }
  const h = hashUserId(userId);
  const posts = getMemberPosts(userId).length;
  return {
    dabUps: 2 + (h % 9),
    boosters: Math.max(6, posts * 4 + (h % 28)),
    boosting: 2 + (h % 11),
  };
}

export function getMemberXpBreakdown(userId: string): XpBreakdown {
  const joined = getMemberEventsJoinedStats(userId);
  const hosting = getMemberHostingStats(userId);
  const social = getMemberSocialCounts(userId);

  const sources = [
    { label: 'Events attended', xp: joined.attendedTotal * XP_PER_ATTENDED },
    { label: 'Upcoming registrations', xp: joined.registeredUpcoming * XP_PER_REGISTERED },
    { label: 'Events hosted', xp: hosting.hostedTotal * XP_PER_HOSTED },
    { label: 'Dab Ups', xp: social.dabUps * XP_PER_DAB_UP },
    { label: 'Boosting others', xp: social.boosting * XP_PER_BOOSTING },
  ].filter((s) => s.xp > 0);

  return { total: sources.reduce((sum, s) => sum + s.xp, 0), sources };
}

export function getMemberRankProgress(userId: string): RankProgress {
  return getRankForXp(getMemberXpBreakdown(userId).total);
}

export function getMemberAchievements(userId: string): AchievementProgress[] {
  const joined = getMemberEventsJoinedStats(userId);
  const hosting = getMemberHostingStats(userId);
  const social = getMemberSocialCounts(userId);
  const categories = joined.byCategory.length;

  const make = (
    id: string,
    name: string,
    emoji: string,
    description: string,
    current: number,
    target: number,
  ): AchievementProgress => ({
    id,
    name,
    emoji,
    description,
    current: Math.min(current, target),
    target,
    earned: current >= target,
  });

  return [
    make('first-steps', 'First Steps', '👟', 'Attend your first official event', joined.attendedTotal, 1),
    make('regular', 'Regular', '📅', 'Attend 5 official events', joined.attendedTotal, 5),
    make('twenty-club', 'Twenty Club', '🏆', 'Attend 20 official events', joined.attendedTotal, 20),
    make('all-rounder', 'All-Rounder', '🌐', 'Attend events across 3 different categories', categories, 3),
    make('first-host', 'First Official Event Hosted', '🎪', 'Host your first official event', hosting.hostedTotal, 1),
    make(
      'top-rated-host',
      'Top Rated Host',
      '⭐',
      'Hold a 4.5+ average rating with 10+ ratings',
      hosting.avgRating >= 4.5 ? hosting.ratingCount : 0,
      10,
    ),
    make('dab-master', 'Dab Master', '🤝', 'Dab Up with 10 members', social.dabUps, 10),
    make('crowd-puller', 'Crowd Puller', '🚀', 'Reach 10 Boosters', social.boosters, 10),
  ];
}

export { ME_AUTHOR_ID };

/* ============================================================
   Achievement wins (official event victories)
   ============================================================ */

export type AchievementWin = {
  id: string;
  userId: string;
  eventTitle: string;
  caption: string;
  image: string;
  dateLabel: string;
  placement: string;
};

const ACHIEVEMENT_WINS: AchievementWin[] = [
  {
    id: 'win-rahul-1',
    userId: 'org-rahul',
    eventTitle: 'Hyderabad Premier Cricket League',
    caption: 'Lifted the trophy after a tight final — 89 runs in the decider over.',
    image: 'https://images.unsplash.com/photo-1531415080290-bc98545ab3ef?auto=format&fit=crop&w=800&q=80',
    dateLabel: 'Mar 2026',
    placement: 'Champion',
  },
  {
    id: 'win-rahul-2',
    userId: 'org-rahul',
    eventTitle: 'Necklace Road Sand Volleyball Open',
    caption: 'Official 4v4 finals — undefeated run through the bracket.',
    image: 'https://images.unsplash.com/photo-1612872087720-bb876e2e67aa?auto=format&fit=crop&w=800&q=80',
    dateLabel: 'Jan 2026',
    placement: '1st Place',
  },
  {
    id: 'win-priya-1',
    userId: 'org-priya',
    eventTitle: 'Gachibowli 3v3 Basketball League',
    caption: 'MVP in the official street finals — clutch buzzer-beater in OT.',
    image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=800&q=80',
    dateLabel: 'Feb 2026',
    placement: 'Champion',
  },
  {
    id: 'win-arjun-1',
    userId: 'org-arjun',
    eventTitle: 'Sunday Football Premier Cup',
    caption: 'Captain’s armband on — scored the winning goal in the 88th minute.',
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80',
    dateLabel: 'Dec 2025',
    placement: '1st Place',
  },
  {
    id: 'win-vikram-1',
    userId: 'org-vikram',
    eventTitle: 'Durgam Cheruvu 10K Official Run',
    caption: 'Crossed the finish in the top bracket — personal best on a certified course.',
    image: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=800&q=80',
    dateLabel: 'Nov 2025',
    placement: 'Podium',
  },
  {
    id: 'win-sneha-1',
    userId: 'org-sneha',
    eventTitle: 'Open Doubles Tennis Championship',
    caption: 'Official Banjara Hills finals — straight-sets victory with my partner.',
    image: 'https://images.unsplash.com/photo-1622163642999-958948411936?auto=format&fit=crop&w=800&q=80',
    dateLabel: 'Jun 2025',
    placement: 'Champion',
  },
  {
    id: 'win-dj-kiran-1',
    userId: 'org-dj-kiran',
    eventTitle: 'Rooftop DJ Battle — Official Night',
    caption: 'Crowd-voted winner at the certified rooftop showcase.',
    image: 'https://images.unsplash.com/photo-1571266028243-d220c702765f?auto=format&fit=crop&w=800&q=80',
    dateLabel: 'Apr 2026',
    placement: 'Winner',
  },
  {
    id: 'win-ananya-1',
    userId: 'org-ananya',
    eventTitle: 'Forum Cosplay Official Showcase',
    caption: 'Best in show at the certified community meetup — full group cosplay.',
    image: 'https://images.unsplash.com/photo-1612036785630-4b214b8647bc?auto=format&fit=crop&w=800&q=80',
    dateLabel: 'Jul 2025',
    placement: 'Best in Show',
  },
];

export function getAchievementWins(userId: string | null | undefined): AchievementWin[] {
  const id = isOwnProfileUser(userId) ? ME_AUTHOR_ID : userId!;
  return ACHIEVEMENT_WINS.filter((w) => w.userId === id);
}
