/**
 * Real profile counters (followers / following / dab-ups / events) straight
 * from the database — GET /api/me/stats for yourself, /api/users/:id/stats for
 * anyone else. Cached in memory; components re-render via STATS_CHANGED_EVENT.
 */
import { apiGet, isBackendEnabled } from './client';
import { API_ROUTES, type MeStatsDto } from './types';

export const STATS_CHANGED_EVENT = 'simsor-stats-changed';

const cache = new Map<string, MeStatsDto>();
const inFlight = new Map<string, Promise<void>>();

function key(userId?: string | null): string {
  return userId || 'me';
}

export function getCachedStats(userId?: string | null): MeStatsDto | undefined {
  return cache.get(key(userId));
}

export function refreshStats(userId?: string | null): Promise<void> {
  if (!isBackendEnabled()) return Promise.resolve();
  const k = key(userId);
  const pending = inFlight.get(k);
  if (pending) return pending;

  const url = userId ? `/api/users/${userId}/stats` : API_ROUTES.meStats;
  const p = apiGet<MeStatsDto>(url)
    .then((stats) => {
      const prev = cache.get(k);
      cache.set(k, stats);
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

export function clearStatsCache(): void {
  cache.clear();
}
