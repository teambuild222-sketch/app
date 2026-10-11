/**
 * Device-side cache (Instagram-style stale-while-revalidate).
 * JSON snapshots live in localStorage so the next open paints instantly.
 * Images/videos are kept by the service worker (see public/sw.js).
 */
export const DEVICE_CACHE_CLEARED = 'simsor-device-cache-cleared';
export const CACHE_UPDATED = 'simsor-cache-updated';

const PREFIX = 'simsor-cache-v1:';

export const CACHE_TTL = {
  posts: 15 * 60_000,
  events: 10 * 60_000,
  notifications: 45_000,
  chatInbox: 5 * 60_000,
  chatMessages: 30 * 60_000,
  people: 6 * 60 * 60_000,
  communities: 15 * 60_000,
  dabUps: 15 * 60_000,
  users: 15 * 60_000,
  stats: 5 * 60_000,
} as const;

type Envelope<T> = { v: T; t: number };

function owner(): string {
  try {
    return localStorage.getItem('simsor-user-id') || 'anon';
  } catch {
    return 'anon';
  }
}

function fullKey(key: string): string {
  return `${PREFIX}${owner()}:${key}`;
}

function readEnvelope<T>(key: string): Envelope<T> | null {
  try {
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || typeof parsed.t !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readCache<T>(key: string): T | null {
  return readEnvelope<T>(key)?.v ?? null;
}

export function cacheAgeMs(key: string): number | null {
  const env = readEnvelope(key);
  return env ? Date.now() - env.t : null;
}

export function isCacheFresh(key: string, maxAgeMs: number): boolean {
  const age = cacheAgeMs(key);
  return age != null && age < maxAgeMs;
}

export function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(fullKey(key), JSON.stringify({ v: value, t: Date.now() } satisfies Envelope<T>));
  } catch {
    /* quota / private mode — keep going without persistence */
  }
}

export function removeCache(key: string): void {
  try {
    localStorage.removeItem(fullKey(key));
  } catch {
    /* ignore */
  }
}

/** Drop every snapshot for the signed-in user (or every user if `all`). */
export function clearDeviceCache(scope: 'user' | 'all' = 'user'): void {
  try {
    const needle = scope === 'all' ? PREFIX : `${PREFIX}${owner()}:`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(needle)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(DEVICE_CACHE_CLEARED));
}

export function invalidateCache(prefix: string): void {
  try {
    const needle = `${PREFIX}${owner()}:${prefix}`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(needle)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

type CachedGetOptions = {
  maxAgeMs?: number;
  force?: boolean;
};

const inflight = new Map<string, Promise<unknown>>();

function emitCacheUpdated(key: string): void {
  window.dispatchEvent(new CustomEvent(CACHE_UPDATED, { detail: key }));
}

function fetchAndStore<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const next = fetcher()
    .then((fresh) => {
      writeCache(key, fresh);
      emitCacheUpdated(key);
      return fresh;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, next);
  return next;
}

/**
 * Instagram-style: if the device has a snapshot, return it immediately.
 * A background refresh runs when the snapshot is stale (or `force` is set).
 * Only the first visit (no snapshot) waits on the network.
 */
export async function cachedGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: CachedGetOptions = {},
): Promise<T> {
  const maxAgeMs = opts.maxAgeMs ?? 60_000;
  const hit = readCache<T>(key);
  if (hit != null && !opts.force) {
    if (!isCacheFresh(key, maxAgeMs)) void fetchAndStore(key, fetcher).catch(() => undefined);
    return hit;
  }
  try {
    return await fetchAndStore(key, fetcher);
  } catch (err) {
    if (hit != null) return hit;
    throw err;
  }
}

const PEOPLE_INDEX = 'people:ids';

export function rememberPerson<T extends { id: string }>(person: T): void {
  writeCache(`person:${person.id}`, person);
  const index = readCache<string[]>(PEOPLE_INDEX) ?? [];
  if (index.includes(person.id)) return;
  writeCache(PEOPLE_INDEX, [...index, person.id].slice(-200));
}

export function loadCachedPeople<T extends { id: string }>(): T[] {
  const ids = readCache<string[]>(PEOPLE_INDEX) ?? [];
  return ids
    .map((id) => readCache<T>(`person:${id}`))
    .filter((p): p is T => Boolean(p));
}
