import {
  ME_AUTHOR_ID,
  getCurrentUserOrganizer,
  getCurrentViewerId,
  resolveOrganizer,
  type EventOrganizer,
} from '../ExplorePage/exploreEvents';
import type { PostDto } from '../../api/types';

export { ME_AUTHOR_ID, getCurrentUserOrganizer };

export type HomePostType = 'poster' | 'text' | 'video';
export type HomePostVisibility = 'public' | 'private';
export type HomeMainCategory = 'Sports' | 'Entertainment';

/**
 * How people can register:
 *  - 'open'    → join anytime until the event starts (post shows a start-time countdown)
 *  - 'limited' → capped slots with a host-defined joining deadline (post shows a deadline countdown + slots left)
 */
export type RegistrationType = 'open' | 'limited';

export type HomeFeedPost = {
  id: string;
  type: HomePostType;
  /** Who created / shared this post. */
  authorId: string;
  caption: string;
  /** Poster image (only for `poster` posts). */
  image?: string;
  /** Video source (only for `video` posts). */
  videoUrl?: string;
  visibility: HomePostVisibility;
  /** True when the author reshared another host's event. */
  isReshared: boolean;
  /** The actual event host – only present when `isReshared`. */
  originalHostId?: string;
  /** Linked Explore event id so "View location" can focus the map. */
  eventId: string;
  eventTitle: string;
  /** Category used for interest matching + affinity. */
  category: string;
  mainCategory: HomeMainCategory;
  /** ISO datetime used to decide if the event already happened. */
  eventDateISO: string;
  eventDateLabel: string;
  eventLocation: string;
  coordinates: [number, number];
  postedAgo: string;
  /** Real creation timestamp (ISO) — only present for backend-sourced posts.
   * Used for precise recency scoring instead of parsing `postedAgo`, see
   * `hoursSincePosted` below. */
  createdAtISO?: string;
  likes: number;
  /** Whether the current user has liked this post — only meaningful (and
   * only ever true) for backend-sourced posts; mock-mode posts have no
   * server-tracked like state so `HomePostCard` defaults to unliked. */
  likedByMe?: boolean;
  comments: number;
  /** Registration model – defaults to 'open' when omitted. */
  registrationType?: RegistrationType;
  /** Total slots (only for 'limited'). */
  slotsTotal?: number;
  /** Slots already taken (only for 'limited'). */
  slotsFilled?: number;
  /** ISO time when slot joining closes (only for 'limited'). */
  registrationDeadlineISO?: string;
};

/** The datetime a post's countdown ticks toward, and what it represents. */
export function getCountdownTarget(
  post: HomeFeedPost,
): { iso: string; kind: 'start' | 'deadline' } {
  if (post.registrationType === 'limited' && post.registrationDeadlineISO) {
    return { iso: post.registrationDeadlineISO, kind: 'deadline' };
  }
  return { iso: post.eventDateISO, kind: 'start' };
}

/** Remaining slots for a limited-registration event (never negative). */
export function slotsLeft(post: HomeFeedPost): number {
  if (post.registrationType !== 'limited' || post.slotsTotal == null) return Infinity;
  return Math.max(0, post.slotsTotal - (post.slotsFilled ?? 0));
}

/**
 * Deterministic host rating derived from the author id, so each host shows a
 * stable star rating + rating count (4.2–4.9 stars, 30–430 raters).
 */
export function getHostRating(post: HomeFeedPost): { rating: number; count: number } {
  const author = getPostAuthor(post);
  let h = 0;
  for (let i = 0; i < author.id.length; i += 1) {
    h = (h * 31 + author.id.charCodeAt(i)) >>> 0;
  }
  const rating = 4.2 + (h % 8) / 10;
  const count = 30 + (h % 400);
  return { rating: Math.round(rating * 10) / 10, count };
}

/** True when `authorId` refers to the current signed-in user — either the
 * mock-mode placeholder or (once a live backend is wired up) the real
 * authenticated user id, so backend-sourced posts the user authored
 * themselves still render as "you" instead of falling through to a
 * mismatched/mock organizer. */
export function isMe(authorId: string): boolean {
  return authorId === ME_AUTHOR_ID || authorId === getCurrentViewerId();
}

export function getPostAuthor(post: HomeFeedPost): EventOrganizer {
  return resolveOrganizer(post.authorId);
}

export function getPostHost(post: HomeFeedPost): EventOrganizer | null {
  if (!post.isReshared || !post.originalHostId) return null;
  return resolveOrganizer(post.originalHostId);
}

export function isEventPast(post: HomeFeedPost, now: Date = new Date()): boolean {
  const eventTime = new Date(post.eventDateISO).getTime();
  if (Number.isNaN(eventTime)) return false;
  return eventTime < now.getTime();
}

/** Convert a "2h" / "1d" / "now" style label to hours-ago for recency scoring. */
export function postedAgoHours(postedAgo: string): number {
  const trimmed = postedAgo.trim().toLowerCase();
  if (trimmed === 'now' || trimmed === 'just now') return 0;
  const match = /^(\d+)\s*([hd])$/.exec(trimmed);
  if (!match) return 48;
  const value = Number(match[1]);
  return match[2] === 'd' ? value * 24 : value;
}

/** "now" / "3h" / "2d" — the label format `postedAgoHours` above parses. */
export function formatPostedAgo(hours: number): string {
  if (hours < 1) return 'now';
  if (hours < 24) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Precise hours-since-posted for backend-sourced posts (real `createdAtISO`),
 * falling back to parsing the coarse `postedAgo` label for mock-mode posts
 * that have no real timestamp. Recency scoring in feedAlgorithm.ts should
 * always go through this rather than `postedAgoHours(post.postedAgo)`
 * directly, so backend-fed feeds get exact recency instead of the label's
 * hour/day rounding.
 */
export function hoursSincePosted(post: HomeFeedPost, now: Date = new Date()): number {
  if (post.createdAtISO) {
    const created = new Date(post.createdAtISO).getTime();
    if (!Number.isNaN(created)) return Math.max(0, (now.getTime() - created) / 3_600_000);
  }
  return postedAgoHours(post.postedAgo);
}

/** Maps the backend's `PostDto` (see api/types.ts) onto the client's
 * `HomeFeedPost` shape — the one place that translates the real, shared post
 * model into what the existing feed UI/scoring already knows how to render. */
export function mapPostDtoToHomeFeedPost(dto: PostDto): HomeFeedPost {
  const createdHours = (Date.now() - new Date(dto.createdAt).getTime()) / 3_600_000;
  return {
    id: dto.id,
    type: dto.type,
    authorId: dto.authorId,
    caption: dto.caption,
    image: dto.image ?? undefined,
    videoUrl: dto.videoUrl ?? undefined,
    visibility: dto.visibility,
    isReshared: dto.isReshared,
    originalHostId: dto.originalHostId ?? undefined,
    eventId: dto.eventId,
    eventTitle: dto.eventTitle,
    category: dto.category,
    mainCategory: dto.mainCategory,
    eventDateISO: dto.eventDateISO ?? '',
    eventDateLabel: dto.eventDateLabel,
    eventLocation: dto.eventLocation,
    coordinates: dto.coordinates,
    postedAgo: formatPostedAgo(Number.isNaN(createdHours) ? 48 : createdHours),
    createdAtISO: dto.createdAt,
    likes: dto.likes,
    likedByMe: dto.likedByMe,
    comments: dto.comments,
    registrationType: dto.registrationType ?? undefined,
    slotsTotal: dto.slotsTotal ?? undefined,
    slotsFilled: dto.slotsFilled ?? undefined,
    registrationDeadlineISO: dto.registrationDeadlineISO ?? undefined,
  };
}

/** Organizers the user follows by default on first load. */
export const DEFAULT_FOLLOWING = ['org-rahul', 'org-dj-kiran'];

/** Fallback poster shown when a post image fails to load (prevents blank cards). */
export const FALLBACK_POST_IMAGE =
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80';

/**
 * Deterministic, UNIQUE fallback image per seed (post id / event id).
 * Prevents every broken Unsplash link from collapsing to the same generic
 * image, so tiles never look like duplicated "spam".
 */
export function fallbackImageFor(seed: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/800`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Matches the "Sun, July 5 · 9:00 AM" shape the seeds are authored in. */
function formatSeedDateLabel(date: Date): string {
  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
  });
  const timeLabel = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${dateLabel} · ${timeLabel}`;
}

/** Local-time ISO without a timezone suffix, the format the seeds use. */
function toLocalISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * Seeds are authored on fixed calendar dates, so the whole feed eventually
 * reads as "Event ended". Shifting every seed by the same whole number of days
 * preserves the demo's relative schedule (some events imminent, others weeks
 * out) and the authored time of day, while keeping the earliest one ahead of
 * now. Whole days only, so morning events stay morning events.
 */
function rollSeedDatesForward(posts: HomeFeedPost[], now: Date = new Date()): HomeFeedPost[] {
  const times = posts
    .map((post) => new Date(post.eventDateISO).getTime())
    .filter((time) => !Number.isNaN(time));
  if (times.length === 0) return posts;

  // Land the soonest event a day out rather than exactly on `now`, so its card
  // still has a live countdown instead of expiring the moment the app loads.
  const shiftDays = Math.ceil((now.getTime() + DAY_MS - Math.min(...times)) / DAY_MS);
  if (shiftDays <= 0) return posts;

  const shift = (iso: string): string => {
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return iso;
    return toLocalISO(new Date(time + shiftDays * DAY_MS));
  };

  return posts.map((post) => {
    const eventDateISO = shift(post.eventDateISO);
    const rolled: HomeFeedPost = {
      ...post,
      eventDateISO,
      eventDateLabel: formatSeedDateLabel(new Date(eventDateISO)),
    };
    if (post.registrationDeadlineISO) {
      rolled.registrationDeadlineISO = shift(post.registrationDeadlineISO);
    }
    return rolled;
  });
}

const SEED_HOME_FEED_POSTS: HomeFeedPost[] = [
  {
    id: 'post-cricket-poster',
    type: 'poster',
    authorId: 'org-rahul',
    caption: 'Slots filling fast for the Sunday Premier Cricket Tournament. Register your squad now!',
    image:
      'https://images.unsplash.com/photo-1531415080290-bc98545ab3ef?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-cricket',
    eventTitle: 'Cricket Tournament',
    category: 'Cricket',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-05T09:00:00',
    eventDateLabel: 'Sun, July 5 · 9:00 AM',
    eventLocation: 'Miyapur Play Ground, Miyapur',
    coordinates: [17.4968, 78.3614],
    postedAgo: '2h',
    likes: 128,
    comments: 24,
    registrationType: 'limited',
    slotsTotal: 16,
    slotsFilled: 12,
    registrationDeadlineISO: '2026-07-05T08:00:00',
  },
  {
    id: 'post-music-reshare',
    type: 'poster',
    authorId: 'org-ananya',
    caption: 'Resharing this rooftop sundowner — my favourite DJ night in the city. See you all there!',
    image:
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: true,
    originalHostId: 'org-dj-kiran',
    eventId: 'evt-music',
    eventTitle: 'Sunset DJ Session',
    category: 'Music',
    mainCategory: 'Entertainment',
    eventDateISO: '2026-07-11T18:00:00',
    eventDateLabel: 'Sat, July 11 · 6:00 PM',
    eventLocation: 'Over the Moon, Gachibowli',
    coordinates: [17.4358, 78.3634],
    postedAgo: '5h',
    likes: 342,
    comments: 58,
  },
  {
    id: 'post-run-text',
    type: 'text',
    authorId: 'org-vikram',
    caption:
      'Private run this Saturday for the core crew 🏃 — 10K along the lake trail, hydration stops sorted. Ping me if you want in.',
    visibility: 'private',
    isReshared: false,
    eventId: 'evt-running',
    eventTitle: 'Sunrise Run Club',
    category: 'Running',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-04T06:00:00',
    eventDateLabel: 'Sat, July 4 · 6:00 AM',
    eventLocation: 'Durgam Cheruvu Lake Trail',
    coordinates: [17.4312, 78.4065],
    postedAgo: '8h',
    likes: 46,
    comments: 12,
  },
  {
    id: 'post-dj-live',
    type: 'poster',
    authorId: 'org-dj-kiran',
    caption: 'New set dropping this weekend 🎧 House, techno and a surprise live act. Limited entry!',
    image:
      'https://images.unsplash.com/photo-1571266028247-e4733b0f0bb0?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-clubbing',
    eventTitle: 'Warehouse Rave',
    category: 'Clubbing',
    mainCategory: 'Entertainment',
    eventDateISO: '2026-07-12T21:00:00',
    eventDateLabel: 'Sun, July 12 · 9:00 PM',
    eventLocation: 'Cyber Towers, Hitech City',
    coordinates: [17.4482, 78.3812],
    postedAgo: '10h',
    likes: 512,
    comments: 74,
    registrationType: 'limited',
    slotsTotal: 80,
    slotsFilled: 62,
    registrationDeadlineISO: '2026-07-12T20:00:00',
  },
  {
    id: 'post-basketball-reshare-text',
    type: 'text',
    authorId: 'org-arjun',
    caption:
      "Resharing Priya's 3v3 league — one of the best-run street tournaments around. Highly recommend signing up.",
    visibility: 'public',
    isReshared: true,
    originalHostId: 'org-priya',
    eventId: 'evt-basketball',
    eventTitle: '3v3 Basketball League',
    category: 'Basketball',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-08T18:00:00',
    eventDateLabel: 'Wed, July 8 · 6:00 PM',
    eventLocation: 'Gachibowli Indoor Arena',
    coordinates: [17.4401, 78.3489],
    postedAgo: '1d',
    likes: 89,
    comments: 9,
    registrationType: 'limited',
    slotsTotal: 24,
    slotsFilled: 19,
    registrationDeadlineISO: '2026-07-08T17:00:00',
  },
  {
    id: 'post-pickleball',
    type: 'poster',
    authorId: 'org-sneha',
    caption: 'Morning pickleball doubles this Friday 🏓 Paddles on rent, all levels welcome!',
    image:
      'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-pickleball',
    eventTitle: 'Pickleball Social',
    category: 'Pickleball',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-10T07:00:00',
    eventDateLabel: 'Fri, July 10 · 7:00 AM',
    eventLocation: 'Kondapur Sports Complex',
    coordinates: [17.4622, 78.3578],
    postedAgo: '1d',
    likes: 63,
    comments: 7,
    registrationType: 'limited',
    slotsTotal: 12,
    slotsFilled: 9,
    registrationDeadlineISO: '2026-07-10T06:00:00',
  },
  {
    id: 'post-football-upcoming',
    type: 'text',
    authorId: 'org-arjun',
    caption: 'Sunday 11-a-side is on ⚽ Two spots left, first come first served. Turf booked till 7.',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-football',
    eventTitle: 'Sunday Football Match',
    category: 'Football',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-05T17:00:00',
    eventDateLabel: 'Sun, July 5 · 5:00 PM',
    eventLocation: 'Madhapur Turf, Hyderabad',
    coordinates: [17.4485, 78.3912],
    postedAgo: '2d',
    likes: 74,
    comments: 15,
    registrationType: 'limited',
    slotsTotal: 22,
    slotsFilled: 20,
    registrationDeadlineISO: '2026-07-05T16:00:00',
  },
  {
    id: 'post-tennis-past',
    type: 'poster',
    authorId: 'org-sneha',
    caption: 'What a turnout at the Open Doubles! Thanks to everyone who came out. Next edition soon 🎾',
    image:
      'https://images.unsplash.com/photo-1622163642999-958948900c39?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-tennis',
    eventTitle: 'Tennis Open Doubles',
    category: 'Tennis',
    mainCategory: 'Sports',
    eventDateISO: '2026-06-18T16:00:00',
    eventDateLabel: 'Wed, June 18 · 4:00 PM',
    eventLocation: 'Banjara Hills Tennis Club',
    coordinates: [17.4156, 78.4347],
    postedAgo: '3d',
    likes: 210,
    comments: 33,
  },
  {
    id: 'post-football-past-reshare',
    type: 'poster',
    authorId: 'org-vikram',
    caption: "Throwback to last Sunday's football match — resharing Arjun's recap. Great game, lads!",
    image:
      'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: true,
    originalHostId: 'org-arjun',
    eventId: 'evt-football',
    eventTitle: 'Sunday Football Match',
    category: 'Football',
    mainCategory: 'Sports',
    eventDateISO: '2026-06-21T17:00:00',
    eventDateLabel: 'Sun, June 21 · 5:00 PM',
    eventLocation: 'Madhapur Turf, Hyderabad',
    coordinates: [17.4485, 78.3912],
    postedAgo: '6d',
    likes: 156,
    comments: 21,
  },
  {
    id: 'post-futsal',
    type: 'poster',
    authorId: 'org-vikram',
    caption: 'Friday futsal under the lights ⚽ Small-sided, high intensity — indoor shoes only.',
    image:
      'https://images.unsplash.com/photo-1574629810360-7abca99b5a64?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-futsal',
    eventTitle: 'Friday Futsal Pickup',
    category: 'Football',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-11T20:00:00',
    eventDateLabel: 'Fri, July 11 · 8:00 PM',
    eventLocation: 'Madhapur Turf, Hyderabad',
    coordinates: [17.4485, 78.3912],
    postedAgo: '3h',
    likes: 52,
    comments: 8,
  },
  {
    id: 'post-badminton',
    type: 'poster',
    authorId: 'org-sneha',
    caption: 'Badminton smash night 🏸 Timed rotations, all skill levels — rackets on rent.',
    image:
      'https://images.unsplash.com/photo-1620595435019-9d5d14e54fe0?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-badminton',
    eventTitle: 'Badminton Smash Night',
    category: 'Badminton',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-17T20:00:00',
    eventDateLabel: 'Thu, July 17 · 8:00 PM',
    eventLocation: 'Hitech City Sports Hub',
    coordinates: [17.4435, 78.3772],
    postedAgo: '4h',
    likes: 41,
    comments: 6,
  },
  {
    id: 'post-skateboard',
    type: 'poster',
    authorId: 'org-vikram',
    caption: 'Skate plaza session this Sunday 🛹 Bring helmets — beginners welcome!',
    image:
      'https://images.unsplash.com/photo-1542770665-66a0b85d33f5?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-skateboard',
    eventTitle: 'Skate Park Session',
    category: 'Skateboard',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-13T17:00:00',
    eventDateLabel: 'Sun, July 13 · 5:00 PM',
    eventLocation: 'Shilparamam Skate Plaza',
    coordinates: [17.405, 78.455],
    postedAgo: '6h',
    likes: 88,
    comments: 11,
  },
  {
    id: 'post-swimming',
    type: 'poster',
    authorId: 'org-priya',
    caption: 'Morning lap swim at the aquatic center 🏊 Technique drills + free swim lanes.',
    image:
      'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-swimming',
    eventTitle: 'Morning Lap Swim',
    category: 'Swimming',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-14T07:00:00',
    eventDateLabel: 'Mon, July 14 · 7:00 AM',
    eventLocation: 'Gachibowli Aquatic Center',
    coordinates: [17.388, 78.482],
    postedAgo: '7h',
    likes: 37,
    comments: 5,
  },
  {
    id: 'post-screening',
    type: 'poster',
    authorId: 'org-ananya',
    caption: 'Open-air movie night under the stars 🎬 Blankets encouraged, snacks on us.',
    image:
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-screening',
    eventTitle: 'Open-Air Movie Screening',
    category: 'Screening',
    mainCategory: 'Entertainment',
    eventDateISO: '2026-07-19T19:30:00',
    eventDateLabel: 'Sat, July 19 · 7:30 PM',
    eventLocation: 'Shilparamam Amphitheatre',
    coordinates: [17.4698, 78.3775],
    postedAgo: '9h',
    likes: 143,
    comments: 19,
  },
  {
    id: 'post-cosplaying',
    type: 'poster',
    authorId: 'org-ananya',
    caption: 'Anime cosplay meetup at Forum Sujana 🎭 Parade, photo booths and merch stalls!',
    image:
      'https://images.unsplash.com/photo-1535295972055-1c7624482085?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-cosplaying',
    eventTitle: 'Anime Cosplay Meetup',
    category: 'Cosplaying',
    mainCategory: 'Entertainment',
    eventDateISO: '2026-07-20T11:00:00',
    eventDateLabel: 'Sun, July 20 · 11:00 AM',
    eventLocation: 'Forum Sujana Mall, KPHB',
    coordinates: [17.4942, 78.3996],
    postedAgo: '11h',
    likes: 267,
    comments: 44,
  },
  {
    id: 'post-yoga',
    type: 'poster',
    authorId: 'org-priya',
    caption: 'Sunset yoga flow at KBR 🧘 Mats provided — breathe, stretch, unwind.',
    image:
      'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-yoga',
    eventTitle: 'Sunset Yoga Flow',
    category: 'Yoga',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-08T18:30:00',
    eventDateLabel: 'Tue, July 8 · 6:30 PM',
    eventLocation: 'KBR National Park, Jubilee Hills',
    coordinates: [17.4122, 78.407],
    postedAgo: '12h',
    likes: 94,
    comments: 14,
  },
  {
    id: 'post-volleyball',
    type: 'poster',
    authorId: 'org-rahul',
    caption: 'Sand volleyball league signup open 🏐 4v4 format, floodlit courts at Necklace Road.',
    image:
      'https://images.unsplash.com/photo-1612872085224-b08a92e221f6?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-volleyball',
    eventTitle: 'Sand Volleyball League',
    category: 'Volleyball',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-12T17:00:00',
    eventDateLabel: 'Sat, July 12 · 5:00 PM',
    eventLocation: 'Necklace Road, Hyderabad',
    coordinates: [17.4401, 78.465],
    postedAgo: '14h',
    likes: 76,
    comments: 10,
    registrationType: 'limited',
    slotsTotal: 16,
    slotsFilled: 10,
    registrationDeadlineISO: '2026-07-12T16:00:00',
  },
  {
    id: 'post-hiking',
    type: 'poster',
    authorId: 'org-vikram',
    caption: 'Gandipet hill trek at sunrise ⛰️ Moderate trail, lake views — bring water!',
    image:
      'https://images.unsplash.com/photo-1551632811-561732b04104?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-hiking',
    eventTitle: 'Gandipet Hill Trek',
    category: 'Hiking',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-13T05:30:00',
    eventDateLabel: 'Sun, July 13 · 5:30 AM',
    eventLocation: 'Gandipet, Hyderabad',
    coordinates: [17.3885, 78.3012],
    postedAgo: '20h',
    likes: 69,
    comments: 9,
  },
  {
    id: 'post-crossfit',
    type: 'poster',
    authorId: 'org-priya',
    caption: 'Community CrossFit WOD — partner workout, scaled for every level 💪',
    image:
      'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-crossfit',
    eventTitle: 'CrossFit Community WOD',
    category: 'CrossFit',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-16T06:00:00',
    eventDateLabel: 'Wed, July 16 · 6:00 AM',
    eventLocation: 'Nanakramguda, Hyderabad',
    coordinates: [17.4196, 78.3403],
    postedAgo: '4d',
    likes: 71,
    comments: 9,
  },
  {
    id: 'post-pilates',
    type: 'poster',
    authorId: 'org-priya',
    caption: 'Reformer Pilates class 🧘 Core, control and posture — mats and reformers provided.',
    image:
      'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-pilates',
    eventTitle: 'Reformer Pilates Class',
    category: 'Pilates',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-15T07:30:00',
    eventDateLabel: 'Tue, July 15 · 7:30 AM',
    eventLocation: 'Jubilee Hills, Hyderabad',
    coordinates: [17.4265, 78.4198],
    postedAgo: '4d',
    likes: 48,
    comments: 6,
  },
  {
    id: 'post-weightlifting',
    type: 'poster',
    authorId: 'org-arjun',
    caption: 'Olympic weightlifting clinic 🏋️ Coached snatch + clean & jerk. Chalk up!',
    image:
      'https://images.unsplash.com/photo-1534368959876-26bf04f2c947?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-weightlifting',
    eventTitle: 'Olympic Weightlifting Clinic',
    category: 'Weightlifting',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-24T06:30:00',
    eventDateLabel: 'Thu, July 24 · 6:30 AM',
    eventLocation: 'Kondapur, Hyderabad',
    coordinates: [17.4622, 78.3578],
    postedAgo: '5d',
    likes: 54,
    comments: 7,
  },
  {
    id: 'post-bodybuilding',
    type: 'poster',
    authorId: 'org-arjun',
    caption: 'Bodybuilding pump session 💪 Chest & back day — spotters on hand, all welcome.',
    image:
      'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-bodybuilding',
    eventTitle: 'Bodybuilding Pump Session',
    category: 'Bodybuilding',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-26T17:00:00',
    eventDateLabel: 'Sat, July 26 · 5:00 PM',
    eventLocation: 'Madhapur, Hyderabad',
    coordinates: [17.4485, 78.3912],
    postedAgo: '5d',
    likes: 63,
    comments: 8,
  },
  {
    id: 'post-calisthenics',
    type: 'poster',
    authorId: 'org-vikram',
    caption: 'Calisthenics park workout 🤸 Pull-ups, dips, muscle-ups on the bars — all levels!',
    image:
      'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-calisthenics',
    eventTitle: 'Calisthenics Park Workout',
    category: 'Calisthenics',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-20T07:00:00',
    eventDateLabel: 'Sun, July 20 · 7:00 AM',
    eventLocation: 'Jubilee Hills, Hyderabad',
    coordinates: [17.4122, 78.407],
    postedAgo: '5d',
    likes: 57,
    comments: 7,
  },
  {
    id: 'post-liveband',
    type: 'poster',
    authorId: 'org-dj-kiran',
    caption: 'Indie live band night — three local acts back-to-back 🎸 Early entry before 8!',
    image:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-liveband',
    eventTitle: 'Indie Live Band Night',
    category: 'Music',
    mainCategory: 'Entertainment',
    eventDateISO: '2026-07-17T20:30:00',
    eventDateLabel: 'Thu, July 17 · 8:30 PM',
    eventLocation: 'Somajiguda, Hyderabad',
    coordinates: [17.4234, 78.4578],
    postedAgo: '4d',
    likes: 189,
    comments: 26,
  },
  {
    id: 'post-basketball-poster',
    type: 'poster',
    authorId: 'org-priya',
    caption: '3v3 basketball league is back 🏀 Register your squad — spots filling fast!',
    image:
      'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=800&q=80',
    visibility: 'public',
    isReshared: false,
    eventId: 'evt-basketball',
    eventTitle: '3v3 Basketball League',
    category: 'Basketball',
    mainCategory: 'Sports',
    eventDateISO: '2026-07-08T18:00:00',
    eventDateLabel: 'Wed, July 8 · 6:00 PM',
    eventLocation: 'Gachibowli Indoor Arena',
    coordinates: [17.4401, 78.3489],
    postedAgo: '5d',
    likes: 95,
    comments: 13,
    registrationType: 'limited',
    slotsTotal: 24,
    slotsFilled: 18,
    registrationDeadlineISO: '2026-07-08T17:00:00',
  },
];

export const HOME_FEED_POSTS: HomeFeedPost[] = rollSeedDatesForward(SEED_HOME_FEED_POSTS);
