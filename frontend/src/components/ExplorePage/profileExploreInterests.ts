import { SPORTS_CATEGORIES, ENTERTAINMENT_CATEGORIES } from './eventMapIcons';

export const USER_INTERESTS_CHANGED_EVENT = 'simsor-user-interests-changed';

const SPORTS_SET = new Set<string>(SPORTS_CATEGORIES);
const ENTERTAINMENT_SET = new Set<string>(ENTERTAINMENT_CATEGORIES);

/** Map Edit Profile interest labels → Explore filter chip labels. */
const INTEREST_TO_EXPLORE: Record<string, string> = {
  cricket: 'Cricket',
  football: 'Football',
  badminton: 'Badminton',
  running: 'Running',
  pickleball: 'Pickleball',
  tennis: 'Tennis',
  basketball: 'Basketball',
  skateboard: 'Skateboard',
  swimming: 'Swimming',
  volleyball: 'Volleyball',
  hiking: 'Hiking',
  yoga: 'Yoga',
  pilates: 'Pilates',
  weightlifting: 'Weightlifting',
  calisthenics: 'Calisthenics',
  music: 'Music',
  'dj events': 'Music',
  'open mic': 'Music',
  movies: 'Screening',
  theatre: 'Screening',
  comedy: 'Screening',
  screening: 'Screening',
  'food events': 'Clubbing',
  clubbing: 'Clubbing',
  cosplaying: 'Cosplaying',
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

function mapInterest(label: string): string | null {
  const mapped = INTEREST_TO_EXPLORE[label.trim().toLowerCase()];
  return mapped ?? null;
}

function uniquePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/** Ordered Explore Sports chips derived from profile interests. */
export function getPreferredSportsFilters(): string[] {
  const sports = readJSON<string[]>('simsor-sports', ['Cricket', 'Football']);
  return uniquePreserveOrder(
    sports.map(mapInterest).filter((f): f is string => !!f && SPORTS_SET.has(f)),
  );
}

/** Ordered Explore Entertainment chips derived from profile interests. */
export function getPreferredEntertainmentFilters(): string[] {
  const ent = readJSON<string[]>('simsor-ent', ['Music', 'Food Events']);
  return uniquePreserveOrder(
    ent.map(mapInterest).filter((f): f is string => !!f && ENTERTAINMENT_SET.has(f)),
  );
}

export function getPreferredFiltersForMain(
  main: 'Sports' | 'Entertainment',
): string[] {
  return main === 'Sports' ? getPreferredSportsFilters() : getPreferredEntertainmentFilters();
}

export function notifyUserInterestsChanged() {
  window.dispatchEvent(new CustomEvent(USER_INTERESTS_CHANGED_EVENT));
}
