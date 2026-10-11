/**
 * In-app notification feed (backend: GET /api/notifications). Rows are created
 * server-side whenever someone follows / likes / comments / joins / dabs you.
 */
import { apiGet, apiPost, isBackendEnabled } from './client';
import { CACHE_TTL, cachedGet, readCache, writeCache } from '../lib/deviceCache';
import { API_ROUTES, type NotificationsResponseDto } from './types';

export function getCachedNotifications(): NotificationsResponseDto {
  return readCache<NotificationsResponseDto>('notifications') ?? { items: [], unread: 0 };
}

export async function fetchNotifications(opts?: { force?: boolean }): Promise<NotificationsResponseDto> {
  if (!isBackendEnabled()) return { items: [], unread: 0 };
  try {
    return await cachedGet('notifications', () => apiGet<NotificationsResponseDto>(API_ROUTES.notifications), {
      maxAgeMs: CACHE_TTL.notifications,
      force: opts?.force,
    });
  } catch {
    return getCachedNotifications();
  }
}

export async function markNotificationsRead(): Promise<void> {
  if (!isBackendEnabled()) return;
  try {
    await apiPost(API_ROUTES.notificationsRead);
    const cached = getCachedNotifications();
    writeCache('notifications', {
      unread: 0,
      items: cached.items.map((n) => ({ ...n, read: true })),
    });
  } catch {
    /* non-critical */
  }
}
