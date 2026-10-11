/**
 * Real profile counters (followers / following / dab-ups / events) straight
 * from the database — GET /api/me/stats for yourself, /api/users/:id/stats for
 * anyone else. Cached in memory; components re-render via STATS_CHANGED_EVENT.
 */
import { apiGet, isBackendEnabled } from './client';
import { CACHE_TTL, cachedGet, DEVICE_CACHE_CLEARED, readCache, writeCache } from '../lib/deviceCache';
import { API_ROUTES, type MeStatsDto } from './types';

export const STATS_CHANGED_EVENT = 'simsor-stats-changed';

const cache = new Map<string, MeStatsDto>();
const inFlight = new Map<string, Promise<void>>();

function key(userId?: string | null): string {
  return userId || 'me';
}

export function getCachedStats(userId?: string | null): MeStatsDto | undefined {
  const k = key(userId);
  const hit = cache.get(k);
  if (hit) return hit;
  const persisted = readCache<MeStatsDto>(`stats:${k}`);
  if (persisted) cache.set(k, persisted);
  return persisted;
}

export function refreshStats(userId?: string | null, opts?: { force?: boolean }): Promise<void> {
  if (!isBackendEnabled()) return Promise.resolve();
  const k = key(userId);
  if (!opts?.force) {
    const pending = inFlight.get(k);
    if (pending) return pending;
  }

  const url = userId ? `/api/users/${userId}/stats` : API_ROUTES.meStats;
  const p = cachedGet<MeStatsDto>(`stats:${k}`, () => apiGet<MeStatsDto>(url), {
    maxAgeMs: CACHE_TTL.stats,
    force: opts?.force,
  })
    .then((stats) => {
      const prev = cache.get(k);
      cache.set(k, stats);
      writeCache(`stats:${k}`, stats);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(stats)) {
        window.dispatchEvent(new CustomEvent(STATS_CHANGED_EVENT));
      }
    })
    .catch(() => {})
    .finally(() => {
      inFlight.delete(k);
    });
  inFlight.set(k, p);
  return p;
}

export function patchCachedStats(userId: string | null | undefined, patch: Partial<MeStatsDto>): void {
  const k = key(userId);
  const prev = getCachedStats(userId);
  if (!prev) return;
  const next = { ...prev, ...patch };
  cache.set(k, next);
  writeCache(`stats:${k}`, next);
  window.dispatchEvent(new CustomEvent(STATS_CHANGED_EVENT));
}

export function clearStatsCache(): void {
  cache.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener(DEVICE_CACHE_CLEARED, () => cache.clear());
}
