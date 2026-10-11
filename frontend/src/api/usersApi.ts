/**
 * Public user lookups — used to resolve a real event host's name/avatar on
 * the Explore map when the backend is live. No mock fallback: this data
 * doesn't exist locally, callers should skip calling this in mock mode.
 */
import { apiGet, isBackendEnabled } from './client';
import { CACHE_TTL, cachedGet, rememberPerson } from '../lib/deviceCache';
import { API_ROUTES, type PublicUserDto } from './types';

export async function fetchPublicUser(userId: string): Promise<PublicUserDto | null> {
  if (!isBackendEnabled()) return null;
  try {
    const profile = await cachedGet(
      `person:${userId}`,
      () => apiGet<PublicUserDto>(API_ROUTES.userPublic(userId)),
      { maxAgeMs: CACHE_TTL.people },
    );
    if (profile) rememberPerson(profile);
    return profile;
  } catch {
    return null;
  }
}

/** Directory of other real users — used by the Chat contact picker (start a
 * DM / add group members) once a backend is live. Empty in mock mode; the
 * mock contact list (EVENT_ORGANIZERS) is used instead — see chatStore.ts. */
export async function listUsers(q?: string, opts?: { force?: boolean }): Promise<PublicUserDto[]> {
  if (!isBackendEnabled()) return [];
  try {
    const users = await cachedGet(
      `users:${q?.trim() || 'all'}`,
      () => apiGet<PublicUserDto[]>(API_ROUTES.users, { params: q ? { q } : undefined }),
      { maxAgeMs: CACHE_TTL.users, force: opts?.force || Boolean(q?.trim()) },
    );
    users.forEach(rememberPerson);
    return users;
  } catch {
    return [];
  }
}
