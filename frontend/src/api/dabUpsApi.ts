import { apiGet, isBackendEnabled } from './client';
import { CACHE_TTL, cachedGet, DEVICE_CACHE_CLEARED, readCache } from '../lib/deviceCache';
import { API_ROUTES } from './types';

let dabbedUpIds: string[] = readCache<{ userIds: string[] }>('dabups:mine')?.userIds ?? [];

if (typeof window !== 'undefined') {
  window.addEventListener(DEVICE_CACHE_CLEARED, () => {
    dabbedUpIds = [];
  });
}

export async function hydrateDabUps(opts?: { force?: boolean }): Promise<void> {
  if (!isBackendEnabled()) return;
  const res = await cachedGet<{ userIds: string[] }>(
    'dabups:mine',
    () => apiGet<{ userIds: string[] }>(API_ROUTES.dabUpsMine),
    { maxAgeMs: CACHE_TTL.dabUps, force: opts?.force },
  );
  dabbedUpIds = res.userIds;
}

export function getServerDabbedUpIds(): string[] {
  return dabbedUpIds;
}
