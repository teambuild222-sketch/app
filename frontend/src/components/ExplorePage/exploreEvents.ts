import { isBackendEnabled } from '../../api/client';
import type { PublicUserDto } from '../../api/types';

export type EventOrganizer = {
  id: string;
  name: string;
  username: string;
  avatar: string;
  role: string;
  bio: string;
  location: string;
  eventsHosted: number;
};

export type GameAccess = 'public' | 'invite';

export type ExploreEvent = {
  id: string;
  title: string;
  category: string;
  mainCategory: 'Sports' | 'Entertainment';
  date: string;
  time: string;
  venue: string;
  location: string;
  description: string;
  coordinates: [number, number];
  attendees: number;
  image: string;
  organizerId: string;
  gameAccess?: GameAccess;
  /** People lists selected when publishing an invite-only event. */
  inviteListIds?: string[];
  /** Snapshot of invitee member IDs at publish time (also re-resolved from lists). */
  invitedMemberIds?: string[];
};

export const EVENT_ORGANIZERS: EventOrganizer[] = [
  {
    id: 'org-rahul',
    name: 'Rahul Sharma',
    username: 'rahul_cricket',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&h=150&q=80',
    role: 'Cricket Organizer',
    bio: 'Hosts weekend cricket leagues and community knockout tournaments across Hyderabad.',
    location: 'Miyapur, Hyderabad',
    eventsHosted: 18,
  },
  {
    id: 'org-priya',
    name: 'Priya Reddy',
    username: 'priya_hoops',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
    role: 'Basketball Host',
    bio: 'Runs 3v3 street basketball nights and youth training sessions in Gachibowli.',
    location: 'Gachibowli, Hyderabad',
    eventsHosted: 12,
  },
  {
    id: 'org-arjun',
    name: 'Arjun Mehta',
    username: 'arjun_football',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80',
    role: 'Football Captain',
    bio: 'Organises Sunday football matches and turf bookings for casual squads.',
    location: 'Madhapur, Hyderabad',
    eventsHosted: 24,
  },
  {
    id: 'org-sneha',
    name: 'Sneha Kapoor',
    username: 'sneha_pickle',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80',
    role: 'Racket Sports Host',
    bio: 'Pickleball, tennis and badminton socials for all skill levels.',
    location: 'Kondapur, Hyderabad',
    eventsHosted: 15,
  },
  {
    id: 'org-vikram',
    name: 'Vikram Das',
    username: 'vikram_runs',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80',
    role: 'Run Club Lead',
    bio: 'Sunrise runs, trail groups and 5K/10K community challenges.',
    location: 'Hitech City, Hyderabad',
    eventsHosted: 31,
  },
  {
    id: 'org-dj-kiran',
    name: 'DJ Kiran',
    username: 'dj_kiran',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&h=150&q=80',
    role: 'Music & Nightlife',
    bio: 'Curates rooftop DJ sets, live music nights and festival pop-ups.',
    location: 'Jubilee Hills, Hyderabad',
    eventsHosted: 22,
  },
  {
    id: 'org-ananya',
    name: 'Ananya Iyer',
    username: 'ananya_events',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80',
    role: 'Culture Curator',
    bio: 'Screenings, cosplay meetups and arts community gatherings.',
    location: 'Banjara Hills, Hyderabad',
    eventsHosted: 19,
  },
];

export const ORGANIZER_BY_ID = Object.fromEntries(
  EVENT_ORGANIZERS.map((organizer) => [organizer.id, organizer])
) as Record<string, EventOrganizer>;

/** Author/organizer id used for anything created by the current signed-in user
 * while in mock mode. Home feed posts always use this id regardless of mode
 * (there's no posts API yet). Map events sourced from the live backend use
 * the real authenticated user id instead — see `getCurrentViewerId()`. */
export const ME_AUTHOR_ID = 'org-me';

/**
 * The id to compare against `event.organizerId` when deciding "is this my
 * event" for the Explore map (private-map scope, organizer lookup). In mock
 * mode this is the placeholder `ME_AUTHOR_ID`; once a live backend is wired
 * up, created events carry the real authenticated user's id instead, so we
 * need to compare against that instead.
 */
export function getCurrentViewerId(): string {
  if (isBackendEnabled()) {
    const realId = localStorage.getItem('simsor-user-id');
    if (realId) return realId;
  }
  return ME_AUTHOR_ID;
}

/**
 * Cache of organizer profiles fetched from the live backend (`GET
 * /api/users/:id/public`), keyed by user id. Populated by the Explore page
 * after loading events, since `getEventOrganizer` below must stay
 * synchronous (it's called deep in render, e.g. from map popups).
 */
const REMOTE_ORGANIZER_CACHE = new Map<string, EventOrganizer>();

export function cacheRemoteOrganizer(userId: string, profile: PublicUserDto): void {
  REMOTE_ORGANIZER_CACHE.set(userId, {
    id: profile.id,
    name: profile.fullName || profile.username,
    username: profile.username,
    avatar: profile.avatarUrl || DEFAULT_ME_ACCOUNT.avatar,
    role: 'Host',
    bio: profile.bio,
    location: profile.location,
    eventsHosted: profile.eventsHosted,
  });
}

export function getCachedRemoteOrganizer(userId: string): EventOrganizer | undefined {
  return REMOTE_ORGANIZER_CACHE.get(userId);
}

export function isKnownOrganizerId(organizerId: string): boolean {
  return (
    organizerId === ME_AUTHOR_ID ||
    organizerId === getCurrentViewerId() ||
    organizerId in ORGANIZER_BY_ID ||
    REMOTE_ORGANIZER_CACHE.has(organizerId)
  );
}

/** Default account applied to the current user until they edit their profile. */
export const DEFAULT_ME_ACCOUNT = {
  name: 'Aditya Rao',
  username: 'aditya.rao',
  avatar:
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80',
  location: 'Hyderabad, India',
};

/**
 * The single source of truth for the current user's identity, used consistently
 * across the Home feed and the Explore map so a created event shows the same host.
 */
export function getCurrentUserOrganizer(): EventOrganizer {
  return {
    id: ME_AUTHOR_ID,
    name: localStorage.getItem('simsor-fullname') || DEFAULT_ME_ACCOUNT.name,
    username: localStorage.getItem('simsor-username') || DEFAULT_ME_ACCOUNT.username,
    avatar: localStorage.getItem('simsor-avatar') || DEFAULT_ME_ACCOUNT.avatar,
    role: 'Host · You',
    bio: '',
    location: localStorage.getItem('simsor-location') || DEFAULT_ME_ACCOUNT.location,
    eventsHosted: 0,
  };
}

/** Default community photo — creator's profile picture, not a stock image. */
export function getDefaultCommunityAvatarForCreator(creatorId: string): string {
  if (creatorId === ME_AUTHOR_ID) return getCurrentUserOrganizer().avatar;
  return ORGANIZER_BY_ID[creatorId]?.avatar ?? DEFAULT_ME_ACCOUNT.avatar;
}

export const INITIAL_EVENTS: ExploreEvent[] = [
  {
    id: 'evt-cricket',
    title: 'Cricket Tournament',
    category: 'Cricket',
    mainCategory: 'Sports',
    date: 'Sun, June 14',
    time: '09:00 AM',
    venue: 'Miyapur Play Ground, Miyapur',
    location: 'Miyapur Play Ground, Miyapur',
    description: 'Join the premier amateur cricket league tournament in Hyderabad.',
    coordinates: [17.4968, 78.3614],
    attendees: 56,
    image: 'https://images.unsplash.com/photo-1531415080290-bc98545ab3ef?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-rahul',
  },
  {
    id: 'evt-basketball',
    title: '3v3 Basketball League',
    category: 'Basketball',
    mainCategory: 'Sports',
    date: 'Sat, June 13',
    time: '06:00 PM',
    venue: 'Gachibowli Indoor Arena',
    location: 'Gachibowli Indoor Arena',
    description: 'Fast-paced street basketball tournament. Teams of 3, register now!',
    coordinates: [17.4401, 78.3489],
    attendees: 24,
    image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-priya',
  },
  {
    id: 'evt-football',
    title: 'Sunday Football Match',
    category: 'Football',
    mainCategory: 'Sports',
    date: 'Sun, June 7',
    time: '05:00 PM',
    venue: 'Madhapur Turf, Hyderabad',
    location: 'Madhapur Turf, Hyderabad',
    description: 'Casual 11-a-side football. All skill levels welcome.',
    coordinates: [17.4485, 78.3912],
    attendees: 18,
    image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-arjun',
  },
  {
    id: 'evt-futsal',
    title: 'Friday Futsal Pickup',
    category: 'Football',
    mainCategory: 'Sports',
    date: 'Fri, June 12',
    time: '08:00 PM',
    venue: 'Madhapur Turf, Hyderabad',
    location: 'Madhapur Turf, Hyderabad',
    description: 'Small-sided futsal under the lights. Bring indoor shoes.',
    coordinates: [17.4485, 78.3912],
    attendees: 10,
    image: 'https://images.unsplash.com/photo-1574629810360-7abca99b5a64?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-vikram',
  },
  {
    id: 'evt-pickleball',
    title: 'Pickleball Social',
    category: 'Pickleball',
    mainCategory: 'Sports',
    date: 'Fri, June 12',
    time: '07:00 AM',
    venue: 'Kondapur Sports Complex',
    location: 'Kondapur Sports Complex',
    description: 'Morning pickleball doubles. Paddles available on rent.',
    coordinates: [17.4622, 78.3578],
    attendees: 12,
    image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-sneha',
  },
  {
    id: 'evt-tennis',
    title: 'Tennis Open Doubles',
    category: 'Tennis',
    mainCategory: 'Sports',
    date: 'Wed, June 18',
    time: '04:00 PM',
    venue: 'Banjara Hills Tennis Club',
    location: 'Banjara Hills Tennis Club',
    description: 'Mixed doubles round-robin. Intermediate level and above.',
    coordinates: [17.4156, 78.4347],
    attendees: 16,
    image: 'https://images.unsplash.com/photo-1622163642999-958948900c39?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-sneha',
  },
  {
    id: 'evt-badminton',
    title: 'Badminton Smash Night',
    category: 'Badminton',
    mainCategory: 'Sports',
    date: 'Thu, June 19',
    time: '08:00 PM',
    venue: 'Hitech City Sports Hub',
    location: 'Hitech City Sports Hub',
    description: 'Late-night badminton sessions with timed match rotations.',
    coordinates: [17.4435, 78.3772],
    attendees: 20,
    image: 'https://images.unsplash.com/photo-1620595435019-9d5d14e54fe0?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-sneha',
  },
  {
    id: 'evt-running',
    title: 'Sunrise Run Club',
    category: 'Running',
    mainCategory: 'Sports',
    date: 'Sat, June 21',
    time: '06:00 AM',
    venue: 'Durgam Cheruvu Lake Trail',
    location: 'Durgam Cheruvu Lake Trail',
    description: '5K and 10K group run along the lake. Hydration stops included.',
    coordinates: [17.4312, 78.4065],
    attendees: 45,
    image: 'https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-vikram',
  },
  {
    id: 'evt-skateboard',
    title: 'Skate Park Session',
    category: 'Skateboard',
    mainCategory: 'Sports',
    date: 'Sun, June 22',
    time: '05:00 PM',
    venue: 'Shilparamam Skate Plaza',
    location: 'Shilparamam Skate Plaza',
    description: 'Open skate session for all levels. Helmets recommended.',
    coordinates: [17.4050, 78.4550],
    attendees: 14,
    image: 'https://images.unsplash.com/photo-1542770665-66a0b85d33f5?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-vikram',
  },
  {
    id: 'evt-swimming',
    title: 'Morning Lap Swim',
    category: 'Swimming',
    mainCategory: 'Sports',
    date: 'Mon, June 23',
    time: '07:00 AM',
    venue: 'Gachibowli Aquatic Center',
    location: 'Gachibowli Aquatic Center',
    description: 'Lane swimming and technique drills. All strokes welcome.',
    coordinates: [17.3880, 78.4820],
    attendees: 22,
    image: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-priya',
  },
  {
    id: 'evt-music',
    title: 'Sunset DJ Session',
    category: 'Music',
    mainCategory: 'Entertainment',
    date: 'Sat, June 20',
    time: '06:00 PM',
    venue: 'Over the Moon, Gachibowli',
    location: 'Over the Moon, Gachibowli',
    description: 'Live DJ sets with house and techno. Rooftop vibes.',
    coordinates: [17.4358, 78.3634],
    attendees: 350,
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-dj-kiran',
  },
  {
    id: 'evt-screening',
    title: 'Open-Air Movie Screening',
    category: 'Screening',
    mainCategory: 'Entertainment',
    date: 'Fri, June 26',
    time: '07:30 PM',
    venue: 'Shilparamam Amphitheatre',
    location: 'Shilparamam Amphitheatre',
    description: 'Classic film night under the stars. Bring your own blanket.',
    coordinates: [17.4698, 78.3775],
    attendees: 120,
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-ananya',
  },
  {
    id: 'evt-clubbing',
    title: 'Neon Nights Club',
    category: 'Clubbing',
    mainCategory: 'Entertainment',
    date: 'Sat, June 27',
    time: '10:00 PM',
    venue: 'Brew Buzz, Jubilee Hills',
    location: 'Brew Buzz, Jubilee Hills',
    description: 'Saturday club night with guest DJs and laser show.',
    coordinates: [17.4265, 78.4198],
    attendees: 280,
    image: 'https://images.unsplash.com/photo-1571266028247-e4733b0f0bb0?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-dj-kiran',
  },
  {
    id: 'evt-cosplaying',
    title: 'Anime Cosplay Meetup',
    category: 'Cosplaying',
    mainCategory: 'Entertainment',
    date: 'Sun, June 28',
    time: '11:00 AM',
    venue: 'Forum Sujana Mall, KPHB',
    location: 'Forum Sujana Mall, KPHB',
    description: 'Cosplay parade, photo booths, and character meet-ups.',
    coordinates: [17.4942, 78.3996],
    attendees: 95,
    image: 'https://images.unsplash.com/photo-1535295972055-1c7624482085?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-ananya',
  },
  {
    id: 'evt-yoga',
    title: 'Sunset Yoga Flow',
    category: 'Yoga',
    mainCategory: 'Sports',
    date: 'Tue, July 8',
    time: '06:30 PM',
    venue: 'KBR National Park Lawn',
    location: 'KBR National Park, Jubilee Hills',
    description: 'Open-air vinyasa flow as the sun sets. Mats provided, all levels welcome.',
    coordinates: [17.4122, 78.407],
    attendees: 38,
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-priya',
  },
  {
    id: 'evt-volleyball',
    title: 'Sand Volleyball League',
    category: 'Volleyball',
    mainCategory: 'Sports',
    date: 'Sat, July 12',
    time: '05:00 PM',
    venue: 'Necklace Road Sports Arena',
    location: 'Necklace Road, Hyderabad',
    description: '4v4 beach volleyball under the floodlights. Teams register on arrival.',
    coordinates: [17.4401, 78.465],
    attendees: 28,
    image: 'https://images.unsplash.com/photo-1612872085224-b08a92e221f6?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-rahul',
  },
  {
    id: 'evt-hiking',
    title: 'Gandipet Hill Trek',
    category: 'Hiking',
    mainCategory: 'Sports',
    date: 'Sun, July 13',
    time: '05:30 AM',
    venue: 'Gandipet Lake Trailhead',
    location: 'Gandipet, Hyderabad',
    description: 'Moderate sunrise trek with lake views. Carry 1L water minimum.',
    coordinates: [17.3885, 78.3012],
    attendees: 34,
    image: 'https://images.unsplash.com/photo-1551632811-561732b04104?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-vikram',
  },
  {
    id: 'evt-crossfit',
    title: 'CrossFit Community WOD',
    category: 'CrossFit',
    mainCategory: 'Sports',
    date: 'Wed, July 16',
    time: '06:00 AM',
    venue: 'Financial District Gym',
    location: 'Nanakramguda, Hyderabad',
    description: 'Partner workout of the day. Scaled options for every fitness level.',
    coordinates: [17.4196, 78.3403],
    attendees: 26,
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-priya',
  },
  {
    id: 'evt-pilates',
    title: 'Reformer Pilates Class',
    category: 'Pilates',
    mainCategory: 'Sports',
    date: 'Tue, July 15',
    time: '07:30 AM',
    venue: 'Core Studio, Jubilee Hills',
    location: 'Jubilee Hills, Hyderabad',
    description: 'Reformer-based Pilates focused on core strength and posture. All levels.',
    coordinates: [17.4265, 78.4198],
    attendees: 15,
    image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-priya',
  },
  {
    id: 'evt-weightlifting',
    title: 'Olympic Weightlifting Clinic',
    category: 'Weightlifting',
    mainCategory: 'Sports',
    date: 'Thu, July 24',
    time: '06:30 AM',
    venue: 'Iron Temple Gym, Kondapur',
    location: 'Kondapur, Hyderabad',
    description: 'Coached snatch and clean & jerk technique session. Chalk provided.',
    coordinates: [17.4622, 78.3578],
    attendees: 12,
    image: 'https://images.unsplash.com/photo-1534368959876-26bf04f2c947?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-arjun',
  },
  {
    id: 'evt-bodybuilding',
    title: 'Bodybuilding Pump Session',
    category: 'Bodybuilding',
    mainCategory: 'Sports',
    date: 'Sat, July 26',
    time: '05:00 PM',
    venue: 'Muscle Factory, Madhapur',
    location: 'Madhapur, Hyderabad',
    description: 'Hypertrophy-focused group lift — chest & back day. Spotters on hand.',
    coordinates: [17.4485, 78.3912],
    attendees: 20,
    image: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-arjun',
  },
  {
    id: 'evt-calisthenics',
    title: 'Calisthenics Park Workout',
    category: 'Calisthenics',
    mainCategory: 'Sports',
    date: 'Sun, July 20',
    time: '07:00 AM',
    venue: 'KBR Park Outdoor Bars',
    location: 'Jubilee Hills, Hyderabad',
    description: 'Bodyweight training on bars and rings — pull-ups, dips, muscle-ups. All levels.',
    coordinates: [17.4122, 78.407],
    attendees: 19,
    image: 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-vikram',
  },
  {
    id: 'evt-liveband',
    title: 'Indie Live Band Night',
    category: 'Music',
    mainCategory: 'Entertainment',
    date: 'Thu, July 17',
    time: '08:30 PM',
    venue: 'The Park, Somajiguda',
    location: 'Somajiguda, Hyderabad',
    description: 'Three local indie acts back-to-back. Early bird entry before 8.',
    coordinates: [17.4234, 78.4578],
    attendees: 110,
    image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80',
    organizerId: 'org-dj-kiran',
  },
];

const INITIAL_EVENT_BY_ID = Object.fromEntries(
  INITIAL_EVENTS.map((event) => [event.id, event])
) as Record<string, ExploreEvent>;

export function normalizeExploreEvent(
  event: Partial<ExploreEvent> & Pick<ExploreEvent, 'id'>
): ExploreEvent {
  const fallback = INITIAL_EVENT_BY_ID[event.id];

  return {
    ...(fallback ?? INITIAL_EVENTS[0]),
    ...event,
    coordinates: (event.coordinates ?? fallback?.coordinates ?? INITIAL_EVENTS[0].coordinates) as [
      number,
      number,
    ],
    organizerId: event.organizerId ?? fallback?.organizerId ?? 'org-rahul',
    gameAccess: event.gameAccess ?? fallback?.gameAccess ?? 'public',
    inviteListIds: event.inviteListIds ?? fallback?.inviteListIds,
    invitedMemberIds: event.invitedMemberIds ?? fallback?.invitedMemberIds,
  };
}

export const EXPLORE_EVENTS_KEY = 'simsor-explore-events-v4';
export const EXPLORE_EVENTS_CHANGED_EVENT = 'simsor-explore-events-changed';

/** Demo events removed from the product – strip from localStorage too. */
const REMOVED_EVENT_IDS = new Set([
  'evt-rugby',
  'evt-tabletennis',
  'evt-boxing',
  'evt-cycling',
  'evt-golf',
  'evt-karaoke',
  'evt-comedy',
  'evt-art',
  'evt-food',
  'evt-esports',
  'evt-dance',
  'evt-photo',
]);

function withoutRemovedEvents(events: ExploreEvent[]): ExploreEvent[] {
  return events.filter((event) => !REMOVED_EVENT_IDS.has(event.id));
}

/** Persist a newly created event so both Explore and Home stay in sync. */
export function appendExploreEvent(event: ExploreEvent): void {
  const next = [...loadExploreEvents(), event];
  localStorage.setItem(EXPLORE_EVENTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EXPLORE_EVENTS_CHANGED_EVENT));
}

/** Remove an event from the map (e.g. when the user deletes their post). */
export function removeExploreEvent(eventId: string): void {
  const next = loadExploreEvents().filter((event) => event.id !== eventId);
  localStorage.setItem(EXPLORE_EVENTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EXPLORE_EVENTS_CHANGED_EVENT));
}

export function loadExploreEvents(): ExploreEvent[] {
  const saved = localStorage.getItem('simsor-explore-events-v4');
  if (!saved) return INITIAL_EVENTS;

  try {
    const parsed = JSON.parse(saved) as Array<Partial<ExploreEvent> & Pick<ExploreEvent, 'id'>>;
    if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_EVENTS;
    const loaded = withoutRemovedEvents(parsed.map(normalizeExploreEvent));
    return mergeSeedEvents(loaded);
  } catch {
    return INITIAL_EVENTS;
  }
}

export function mergeSeedEvents(loaded: ExploreEvent[]): ExploreEvent[] {
  const REFRESH_SEED_IDS = new Set(['evt-skateboard', 'evt-swimming']);

  const refreshed = loaded.map((event) =>
    REFRESH_SEED_IDS.has(event.id) ? normalizeExploreEvent(event) : event
  );

  const missingSeeds = INITIAL_EVENTS.filter(
    (seed) => !refreshed.some((event) => event.id === seed.id)
  );

  return withoutRemovedEvents(
    missingSeeds.length > 0 ? [...refreshed, ...missingSeeds] : refreshed
  );
}

export type LocationEventGroup = {
  key: string;
  coordinates: [number, number];
  events: ExploreEvent[];
};

export function locationKeyFromCoordinates(coordinates: [number, number]): string {
  return `${coordinates[0].toFixed(5)},${coordinates[1].toFixed(5)}`;
}

export function groupEventsByLocation(events: ExploreEvent[]): LocationEventGroup[] {
  const grouped = new Map<string, ExploreEvent[]>();

  for (const event of events) {
    const key = locationKeyFromCoordinates(event.coordinates);
    const existing = grouped.get(key) ?? [];
    existing.push(event);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries()).map(([key, groupEvents]) => ({
    key,
    coordinates: groupEvents[0].coordinates,
    events: groupEvents,
  }));
}

export function getEventOrganizer(event: Partial<ExploreEvent>): EventOrganizer {
  const organizerId =
    event.organizerId ??
    (event.id ? INITIAL_EVENT_BY_ID[event.id]?.organizerId : undefined) ??
    'org-rahul';

  // Recognize both the mock-mode placeholder id and the real backend id of
  // the signed-in user as "me" — always display via getCurrentUserOrganizer()
  // (id stays ME_AUTHOR_ID) so profile navigation / chat code elsewhere,
  // which is all keyed on ME_AUTHOR_ID, keeps working unchanged.
  if (organizerId === ME_AUTHOR_ID || organizerId === getCurrentViewerId()) {
    return getCurrentUserOrganizer();
  }
  return (
    ORGANIZER_BY_ID[organizerId] ?? REMOTE_ORGANIZER_CACHE.get(organizerId) ?? EVENT_ORGANIZERS[0]
  );
}

export function openEventInGoogleMaps(event: ExploreEvent): void {
  const [lat, lng] = event.coordinates;
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    '_blank',
    'noopener,noreferrer'
  );
}
